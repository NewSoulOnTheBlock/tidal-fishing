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

const app = express();
const PORT = process.env.PORT || 3000;

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

// Start server
app.listen(PORT, () => {
  console.log(`[server] Tidal API listening on port ${PORT}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
  console.log(`[server] Treasury: ${treasuryKeypair ? '✅ Loaded' : '❌ Not configured'}`);
  console.log(`[server] $TIDE Mint: ${TIDE_MINT_STR}`);
});
