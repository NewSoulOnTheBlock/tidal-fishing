import express from 'express';
import cors from 'cors';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
  clusterApiUrl,
} from '@solana/web3.js';
import bs58 from 'bs58';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Ensure ban-system tables exist (idempotent — runs on every boot).
// Self-heals deploys where schema.sql was never applied manually, which
// otherwise causes /api/catch/validate to 500 and breaks all fishing.
async function initDatabase() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS banned_wallets (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(44) UNIQUE NOT NULL,
      reason TEXT,
      banned_at TIMESTAMP DEFAULT NOW(),
      banned_by VARCHAR(100) DEFAULT 'system'
    );
    CREATE TABLE IF NOT EXISTS banned_ips (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) UNIQUE NOT NULL,
      reason TEXT,
      banned_at TIMESTAMP DEFAULT NOW(),
      banned_by VARCHAR(100) DEFAULT 'system'
    );
    CREATE INDEX IF NOT EXISTS idx_banned_wallets ON banned_wallets(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_banned_ips ON banned_ips(ip_address);
    CREATE TABLE IF NOT EXISTS ip_activity (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) NOT NULL,
      wallet_address VARCHAR(44),
      action VARCHAR(50) NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW(),
      metadata JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_ip_activity_lookup ON ip_activity(ip_address, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_ip_activity_wallet ON ip_activity(wallet_address, timestamp DESC);
  `;
  try {
    await pool.query(ddl);
    console.log('✅ Ban-system tables ready');
  } catch (err) {
    console.error('❌ Failed to initialize ban-system tables:', err);
  }
}
initDatabase();

// Environment variables
const RPC_URL = process.env.VITE_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
const TIDE_MINT_STR = process.env.VITE_TIDE_MINT || '7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump';
const SECRET_STR = process.env.TIDAL_TREASURY_SECRET || '';
const TIDE_DECIMALS = Number(process.env.VITE_TIDE_DECIMALS ?? 6);
const MAX_UI_AMOUNT = Number(process.env.TIDAL_WITHDRAW_MAX ?? 100_000_000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://tidalfishing.fun';

// Solana program IDs
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json());

// IP extraction helper
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'unknown';
}

// Ban check middleware
async function checkBans(req, res, next) {
  const ip = getClientIP(req);
  const walletAddress = req.body.walletAddress || req.query.walletAddress;
  
  try {
    // Check IP ban
    const ipBan = await pool.query(
      'SELECT reason FROM banned_ips WHERE ip_address = $1',
      [ip]
    );
    if (ipBan.rows.length > 0) {
      return res.status(403).json({ 
        error: 'Access denied',
        reason: ipBan.rows[0].reason || 'Your IP has been banned',
        banned: true
      });
    }
    
    // Check wallet ban if provided
    if (walletAddress) {
      const walletBan = await pool.query(
        'SELECT reason FROM banned_wallets WHERE wallet_address = $1',
        [walletAddress]
      );
      if (walletBan.rows.length > 0) {
        return res.status(403).json({ 
          error: 'Account suspended',
          reason: walletBan.rows[0].reason || 'This wallet has been banned',
          banned: true
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('[ban-check] Error:', error);
    // Don't block on ban-check errors
    next();
  }
}

// Track IP activity
async function trackActivity(ip, wallet, action, metadata = {}) {
  try {
    await pool.query(
      'INSERT INTO ip_activity (ip_address, wallet_address, action, metadata) VALUES ($1, $2, $3, $4)',
      [ip, wallet, action, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('[track-activity] Error:', error);
  }
}

// Apply ban check to all API routes
app.use('/api', checkBans);

// Load treasury keypair
let treasuryKeypair = null;
try {
  if (SECRET_STR) {
    let bytes;
    if (SECRET_STR.trim().startsWith('[')) {
      bytes = Uint8Array.from(JSON.parse(SECRET_STR));
    } else {
      bytes = bs58.decode(SECRET_STR.trim());
    }
    if (bytes.length === 64) {
      treasuryKeypair = Keypair.fromSecretKey(bytes);
      console.log('[server] Treasury loaded:', treasuryKeypair.publicKey.toBase58());
    }
  }
} catch (error) {
  console.error('[server] Failed to load treasury keypair:', error.message);
}

// Solana connection
const connection = new Connection(RPC_URL, 'confirmed');

// Helper functions
async function detectTokenProgram(mint) {
  // Check the mint account to determine if it's Token-2022 or classic
  const mintInfo = await connection.getAccountInfo(mint);
  if (!mintInfo) {
    throw new Error('Mint account not found');
  }
  // Token-2022 mints are owned by the Token-2022 program
  if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

async function getAssociatedTokenAddress(mint, owner, tokenProgram) {
  // Derive ATA using the correct token program
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return { address: ata, programId: tokenProgram };
}

function createAssociatedTokenAccountIx(payer, ata, owner, mint, tokenProgram) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

function createTransferIx(source, dest, owner, amount, tokenProgram) {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // SPL Token: Transfer
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    treasury: treasuryKeypair ? treasuryKeypair.publicKey.toBase58() : 'not configured',
    tideMint: TIDE_MINT_STR,
    rpcUrl: RPC_URL.replace(/api-key=[^&]+/, 'api-key=***'),
  });
});

// Get treasury balance
app.get('/api/treasury/balance', async (req, res) => {
  try {
    if (!treasuryKeypair) {
      return res.status(503).json({ error: 'Treasury not configured' });
    }

    const mintPk = new PublicKey(TIDE_MINT_STR);
    const tokenProgram = await detectTokenProgram(mintPk);
    const { address: ata } = await getAssociatedTokenAddress(mintPk, treasuryKeypair.publicKey, tokenProgram);
    
    const balance = await connection.getTokenAccountBalance(ata);
    
    res.json({
      address: treasuryKeypair.publicKey.toBase58(),
      mint: TIDE_MINT_STR,
      tokenAccount: ata.toBase58(),
      balance: {
        raw: balance.value.amount,
        ui: balance.value.uiAmountString,
        decimals: balance.value.decimals,
      },
    });
  } catch (error) {
    console.error('[treasury/balance] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Withdraw endpoint
app.post('/api/withdraw', async (req, res) => {
  try {
    // Validation
    if (!treasuryKeypair || !TIDE_MINT_STR) {
      return res.status(503).json({
        error: 'Withdrawals not configured: treasury key or mint missing',
      });
    }

    const { recipient, amount } = req.body;
    
    if (typeof recipient !== 'string' || !recipient) {
      return res.status(400).json({ error: 'recipient (string) required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount (positive number) required' });
    }
    if (amount > MAX_UI_AMOUNT) {
      return res.status(400).json({ error: `amount exceeds per-call cap of ${MAX_UI_AMOUNT}` });
    }

    let recipientPk;
    try {
      recipientPk = new PublicKey(recipient);
    } catch {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }

    const mintPk = new PublicKey(TIDE_MINT_STR);
    const rawAmount = BigInt(Math.round(amount * 10 ** TIDE_DECIMALS));

    // Detect token program from the mint
    const tokenProgram = await detectTokenProgram(mintPk);
    
    const source = await getAssociatedTokenAddress(mintPk, treasuryKeypair.publicKey, tokenProgram);
    const dest = await getAssociatedTokenAddress(mintPk, recipientPk, tokenProgram);

    // Build transaction
    const ixs = [];
    ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));

    // Check treasury balance
    let sourceBalance = 0n;
    try {
      const acc = await connection.getTokenAccountBalance(source.address);
      sourceBalance = BigInt(acc.value.amount);
    } catch (error) {
      return res.status(500).json({ error: 'Treasury has no $TIDE token account' });
    }

    if (sourceBalance < rawAmount) {
      return res.status(503).json({
        error: `Treasury balance too low (have ${Number(sourceBalance) / 10 ** TIDE_DECIMALS}, need ${amount})`,
      });
    }

    // Create recipient ATA if needed
    const destInfo = await connection.getAccountInfo(dest.address);
    if (!destInfo) {
      ixs.push(createAssociatedTokenAccountIx(treasuryKeypair.publicKey, dest.address, recipientPk, mintPk, tokenProgram));
    }

    // Add transfer instruction
    ixs.push(createTransferIx(source.address, dest.address, treasuryKeypair.publicKey, rawAmount, tokenProgram));

    // Create and sign transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: treasuryKeypair.publicKey,
      blockhash,
      lastValidBlockHeight,
    });
    tx.add(...ixs);
    tx.sign(treasuryKeypair);

    // Send and confirm
    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    console.log('[withdraw] Success:', signature, 'recipient:', recipient, 'amount:', amount);

    res.json({
      signature,
      recipient,
      amount,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    });
  } catch (error) {
    console.error('[withdraw] Error:', error);
    res.status(502).json({ error: error.message || 'Transaction failed' });
  }
});

// ============================================================================
// PROFILE ENDPOINTS
// ============================================================================

// Update player profile (username, profile picture, bio)
app.patch('/api/player/profile', async (req, res) => {
  try {
    const { walletAddress, username, profilePicture, bio } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress required' });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (username !== undefined) {
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (profilePicture !== undefined) {
      updates.push(`profile_picture = $${paramCount++}`);
      values.push(profilePicture);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount++}`);
      values.push(bio);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(walletAddress);
    
    const result = await pool.query(
      `UPDATE players 
       SET ${updates.join(', ')}, last_login = NOW()
       WHERE wallet_address = $${paramCount}
       RETURNING id, wallet_address, username, profile_picture, bio, level, xp, total_catches, total_earned`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ 
      success: true,
      player: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get player profile (public view)
app.get('/api/player/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    const result = await pool.query(
      `SELECT 
        wallet_address,
        username,
        profile_picture,
        bio,
        level,
        xp,
        money,
        total_catches,
        total_earned,
        perfect_hooks,
        unlocked_locations,
        login_streak,
        created_at
      FROM players 
      WHERE wallet_address = $1`,
      [wallet]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get achievements
    const achievementsResult = await pool.query(
      `SELECT achievement_id, unlocked_at 
       FROM achievements 
       WHERE player_id = (SELECT id FROM players WHERE wallet_address = $1)
       ORDER BY unlocked_at ASC`,
      [wallet]
    );

    res.json({
      player: result.rows[0],
      achievements: achievementsResult.rows
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ============================================================================
// EXISTING ENDPOINTS
// ============================================================================

// 1. Auth - Get or create player profile
app.post('/api/player/auth', async (req, res) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress || walletAddress.length < 32) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // Find existing player or create new
    let result = await pool.query(
      'SELECT * FROM players WHERE wallet_address = $1',
      [walletAddress]
    );

    if (result.rows.length === 0) {
      // Create new player
      result = await pool.query(
        `INSERT INTO players (wallet_address) 
         VALUES ($1) 
         RETURNING *`,
        [walletAddress]
      );
      console.log('[auth] New player created:', walletAddress);
    } else {
      // Update last login
      await pool.query(
        'UPDATE players SET last_login = NOW() WHERE wallet_address = $1',
        [walletAddress]
      );
      console.log('[auth] Player logged in:', walletAddress);
    }

    res.json({ player: result.rows[0] });
  } catch (error) {
    console.error('[auth] Error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. Save player state
app.post('/api/player/save', async (req, res) => {
  const { walletAddress, state } = req.body;

  if (!walletAddress || !state) {
    return res.status(400).json({ error: 'Missing wallet address or state' });
  }

  try {
    await pool.query(
      `UPDATE players SET 
        level = GREATEST(players.level, $2),
        xp = GREATEST(players.xp, $3),
        money = $4,
        total_catches = GREATEST(players.total_catches, $5),
        total_earned = GREATEST(players.total_earned, $6),
        perfect_hooks = GREATEST(players.perfect_hooks, $7),
        snaps = $8,
        unlocked_locations = $9,
        equipped_rod = $10,
        equipped_reel = $11,
        equipped_line = $12,
        equipped_bait = $13,
        owned_gear = $14
       WHERE wallet_address = $1`,
      [
        walletAddress,
        state.level,
        state.xp,
        state.money,
        state.totalCatches,
        state.totalEarned,
        state.perfectHooks || 0,
        state.snaps || 0,
        state.unlockedLocations,
        state.equippedRod,
        state.equippedReel,
        state.equippedLine,
        state.equippedBait,
        JSON.stringify(state.ownedGear)
      ]
    );

    console.log('[save] Player state saved:', walletAddress);
    res.json({ success: true });
  } catch (error) {
    console.error('[save] Error:', error);
    res.status(500).json({ error: 'Save failed' });
  }
});

// 3. Record catch
app.post('/api/player/catch', async (req, res) => {
  const { walletAddress, catch: catchData } = req.body;

  if (!walletAddress || !catchData) {
    return res.status(400).json({ error: 'Missing wallet address or catch data' });
  }

  try {
    const player = await pool.query(
      'SELECT id FROM players WHERE wallet_address = $1',
      [walletAddress]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Insert catch
    await pool.query(
      `INSERT INTO catches (player_id, species_id, location, rarity, size_cm, weight_kg, value, perfect_hook)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        player.rows[0].id,
        catchData.speciesId,
        catchData.location,
        catchData.rarity,
        catchData.sizeCm,
        catchData.weightKg,
        catchData.value,
        catchData.perfectHook || false
      ]
    );

    // Update journal entry
    await pool.query(
      `INSERT INTO journal_entries (player_id, species_id, total_caught, biggest_size_cm, biggest_weight_kg)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (player_id, species_id) 
       DO UPDATE SET 
         total_caught = journal_entries.total_caught + 1,
         biggest_size_cm = GREATEST(journal_entries.biggest_size_cm, $3),
         biggest_weight_kg = GREATEST(journal_entries.biggest_weight_kg, $4)`,
      [player.rows[0].id, catchData.speciesId, catchData.sizeCm, catchData.weightKg]
    );

    console.log('[catch] Recorded:', catchData.speciesId, 'for', walletAddress);
    res.json({ success: true });
  } catch (error) {
    console.error('[catch] Error:', error);
    res.status(500).json({ error: 'Failed to record catch' });
  }
});

// 4. Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leaderboard LIMIT 100');
    res.json({ leaderboard: result.rows });
  } catch (error) {
    console.error('[leaderboard] Error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// 5. Get player stats
app.get('/api/player/stats/:walletAddress', async (req, res) => {
  try {
    const player = await pool.query(
      `SELECT p.*, 
        COUNT(DISTINCT c.species_id) as unique_species,
        COUNT(c.id) as total_catches_recorded
       FROM players p
       LEFT JOIN catches c ON p.id = c.player_id
       WHERE p.wallet_address = $1
       GROUP BY p.id`,
      [req.params.walletAddress]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ stats: player.rows[0] });
  } catch (error) {
    console.error('[stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// 6. Get player journal
app.get('/api/player/journal/:walletAddress', async (req, res) => {
  try {
    const player = await pool.query(
      'SELECT id FROM players WHERE wallet_address = $1',
      [req.params.walletAddress]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const journal = await pool.query(
      `SELECT * FROM journal_entries 
       WHERE player_id = $1 
       ORDER BY first_caught_at DESC`,
      [player.rows[0].id]
    );

    res.json({ journal: journal.rows });
  } catch (error) {
    console.error('[journal] Error:', error);
    res.status(500).json({ error: 'Failed to fetch journal' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[server] Tidal API listening on port ${PORT}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
  console.log(`[server] Treasury: ${treasuryKeypair ? '✅ Loaded' : '❌ Not configured'}`);
  console.log(`[server] $TIDE Mint: ${TIDE_MINT_STR}`);
  console.log(`[server] Database: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
});

// ============================================================================
// BAN SYSTEM & CATCH VALIDATION
// ============================================================================

// Validate catch (prevents offline fishing)
app.post('/api/catch/validate', async (req, res) => {
  const { walletAddress, speciesId, value } = req.body;
  const ip = getClientIP(req);
  
  if (!walletAddress || !speciesId) {
    return res.status(400).json({ error: 'Missing required fields', allowed: false });
  }
  
  try {
    // Track this catch attempt
    await trackActivity(ip, walletAddress, 'catch_validate', { speciesId, value });
    
    // Check rate limits (catches per minute from this IP)
    const recentCatches = await pool.query(
      `SELECT COUNT(*) as count FROM ip_activity 
       WHERE ip_address = $1 
       AND action = 'catch_validate' 
       AND timestamp > NOW() - INTERVAL '1 minute'`,
      [ip]
    );
    
    if (parseInt(recentCatches.rows[0].count) > 10) {
      console.log(`[catch-validate] Rate limit exceeded for IP: ${ip}`);
      return res.json({ 
        allowed: false, 
        error: 'Too many catches. Please slow down.' 
      });
    }
    
    // All checks passed
    res.json({ allowed: true });
  } catch (error) {
    console.error('[catch-validate] Error:', error);
    // Fail closed - don't allow catch on error
    res.status(500).json({ error: 'Validation failed', allowed: false });
  }
});

// Admin: Ban wallet
app.post('/api/admin/ban/wallet', async (req, res) => {
  const { walletAddress, reason, adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address required' });
  }
  
  try {
    await pool.query(
      'INSERT INTO banned_wallets (wallet_address, reason) VALUES ($1, $2) ON CONFLICT (wallet_address) DO UPDATE SET reason = $2',
      [walletAddress, reason || 'Violation of terms']
    );
    console.log(`[admin] Banned wallet: ${walletAddress}`);
    res.json({ success: true, message: `Wallet ${walletAddress} has been banned` });
  } catch (error) {
    console.error('[admin] Ban wallet error:', error);
    res.status(500).json({ error: 'Failed to ban wallet' });
  }
});

// Admin: Ban IP
app.post('/api/admin/ban/ip', async (req, res) => {
  const { ipAddress, reason, adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!ipAddress) {
    return res.status(400).json({ error: 'IP address required' });
  }
  
  try {
    await pool.query(
      'INSERT INTO banned_ips (ip_address, reason) VALUES ($1, $2) ON CONFLICT (ip_address) DO UPDATE SET reason = $2',
      [ipAddress, reason || 'Violation of terms']
    );
    console.log(`[admin] Banned IP: ${ipAddress}`);
    res.json({ success: true, message: `IP ${ipAddress} has been banned` });
  } catch (error) {
    console.error('[admin] Ban IP error:', error);
    res.status(500).json({ error: 'Failed to ban IP' });
  }
});

// Admin: Unban wallet
app.post('/api/admin/unban/wallet', async (req, res) => {
  const { walletAddress, adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    await pool.query('DELETE FROM banned_wallets WHERE wallet_address = $1', [walletAddress]);
    console.log(`[admin] Unbanned wallet: ${walletAddress}`);
    res.json({ success: true, message: `Wallet ${walletAddress} has been unbanned` });
  } catch (error) {
    console.error('[admin] Unban wallet error:', error);
    res.status(500).json({ error: 'Failed to unban wallet' });
  }
});

// Admin: Unban IP
app.post('/api/admin/unban/ip', async (req, res) => {
  const { ipAddress, adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    await pool.query('DELETE FROM banned_ips WHERE ip_address = $1', [ipAddress]);
    console.log(`[admin] Unbanned IP: ${ipAddress}`);
    res.json({ success: true, message: `IP ${ipAddress} has been unbanned` });
  } catch (error) {
    console.error('[admin] Unban IP error:', error);
    res.status(500).json({ error: 'Failed to unban IP' });
  }
});

// Admin: List bans
app.get('/api/admin/bans', async (req, res) => {
  const { adminKey } = req.query;
  
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const wallets = await pool.query('SELECT * FROM banned_wallets ORDER BY banned_at DESC LIMIT 100');
    const ips = await pool.query('SELECT * FROM banned_ips ORDER BY banned_at DESC LIMIT 100');
    
    res.json({
      bannedWallets: wallets.rows,
      bannedIPs: ips.rows
    });
  } catch (error) {
    console.error('[admin] List bans error:', error);
    res.status(500).json({ error: 'Failed to list bans' });
  }
});
