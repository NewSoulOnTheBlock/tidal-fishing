// SOL payment helper - direct Solana native token transfers
// Used as an alternative to $TIDE token payments

import {
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { connection, TIDE_TREASURY, base58Encode } from "./solana.js";
import { signAndSendTransaction, currentPublicKey, signTransaction } from "./wallet.js";

// Conversion rate: 1 SOL = X $TIDE
// Adjust based on your token economics
const SOL_TO_TIDE_RATE = 50000; // 1 SOL = 50,000 $TIDE
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Convert $TIDE amount to SOL equivalent
 * @param {number} tideAmount - Amount in $TIDE
 * @returns {number} Amount in SOL
 */
export function tideToSol(tideAmount) {
  return tideAmount / SOL_TO_TIDE_RATE;
}

/**
 * Convert SOL amount to $TIDE equivalent
 * @param {number} solAmount - Amount in SOL
 * @returns {number} Amount in $TIDE
 */
export function solToTide(solAmount) {
  return solAmount * SOL_TO_TIDE_RATE;
}

/**
 * Get the conversion rate
 * @returns {number} How much $TIDE equals 1 SOL
 */
export function getConversionRate() {
  return SOL_TO_TIDE_RATE;
}

/**
 * Transfer SOL from connected wallet to the treasury wallet, optionally splitting
 * a portion to a second recipient.
 * @param {number} solAmount - Total amount in SOL (e.g., 0.001)
 * @param {Object} options
 * @param {string} [options.memo]
 * @param {{to: (PublicKey|string), ratio?: number}} [options.split] - Send
 *   `ratio` (0..1, default 0.5) of the total to `to`; the remainder goes to the
 *   treasury. The payer is still debited the same total `solAmount`.
 * @returns {Promise<string>} Transaction signature
 */
export async function paySol(solAmount, { memo, split } = {}) {
  if (!TIDE_TREASURY) {
    throw new Error("Treasury wallet not configured");
  }
  
  const payer = currentPublicKey();
  if (!payer) throw new Error("Wallet not connected");
  
  // Convert SOL to lamports
  const lamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  
  // Check balance
  const balance = await connection.getBalance(payer);
  const requiredWithFee = lamports + 10_000n; // Add 0.00001 SOL for fees
  
  if (BigInt(balance) < requiredWithFee) {
    const required = Number(requiredWithFee) / LAMPORTS_PER_SOL;
    const have = balance / LAMPORTS_PER_SOL;
    throw new Error(`Not enough SOL (have ${have.toFixed(6)}, need ${required.toFixed(6)})`);
  }
  
  const ixs = [];
  
  // Set compute budget
  ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));

  // Optionally split a portion to a second recipient; the remainder (and the
  // full amount when there's no split) goes to the treasury. Total debited from
  // the payer is unchanged.
  let splitLamports = 0n;
  let splitKey = null;
  if (split && split.to) {
    splitKey = split.to instanceof PublicKey ? split.to : new PublicKey(split.to);
    const ratio = Number.isFinite(split.ratio) ? Math.min(1, Math.max(0, split.ratio)) : 0.5;
    splitLamports = BigInt(Math.floor(Number(lamports) * ratio));
    if (splitKey.equals(TIDE_TREASURY)) { splitKey = null; splitLamports = 0n; } // no-op self-split
  }
  const treasuryLamports = lamports - splitLamports;

  // Transfer the treasury portion (the full amount when there's no split).
  if (treasuryLamports > 0n) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: TIDE_TREASURY,
        lamports: Number(treasuryLamports),
      })
    );
  }

  // Transfer the split portion to the secondary recipient.
  if (splitKey && splitLamports > 0n) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: splitKey,
        lamports: Number(splitLamports),
      })
    );
  }
  
  // Add memo if provided
  if (memo) {
    const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    ixs.push(new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: new TextEncoder().encode(memo),
    }));
  }
  
  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: payer,
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(...ixs);
  
  // Sign and send
  const serialized = tx.serialize({ requireAllSignatures: false });
  let signature;
  
  try {
    const sigBytes = await signAndSendTransaction(serialized);
    signature = typeof sigBytes === 'string' ? sigBytes : base58Encode(sigBytes);
  } catch (e) {
    if (!/signAndSend/.test(e?.message ?? "")) throw e;
    const signed = await signTransaction(serialized);
    signature = await connection.sendRawTransaction(signed, { maxRetries: 3 });
  }
  
  // Confirm
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  
  return signature;
}

/**
 * Check if SOL payment is available (wallet connected)
 */
export function isSolPayEnabled() {
  return Boolean(currentPublicKey() && TIDE_TREASURY);
}

/**
 * Format SOL amount for display
 * @param {number} solAmount - Amount in SOL
 * @returns {string} Formatted string like "0.001 SOL"
 */
export function formatSol(solAmount) {
  if (solAmount >= 1) {
    return `${solAmount.toFixed(3)} SOL`;
  } else if (solAmount >= 0.001) {
    return `${solAmount.toFixed(4)} SOL`;
  } else {
    return `${solAmount.toFixed(6)} SOL`;
  }
}
