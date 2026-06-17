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
// DATABASE ENDPOINTS
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
        level = $2,
        xp = $3,
        money = $4,
        total_catches = $5,
        total_earned = $6,
        perfect_hooks = $7,
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
