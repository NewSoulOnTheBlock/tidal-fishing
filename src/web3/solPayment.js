// SOL payment helper - direct Solana native token transfers
// Used as an alternative to $TIDE token payments

import {
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { connection, TIDE_TREASURY } from "./solana.js";
import { signAndSendTransaction, currentPublicKey, signTransaction } from "./wallet.js";

// Base58 encoding for signatures
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes) {
  const alphabet = BASE58_ALPHABET;
  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  if (num === 0n) return alphabet[0];
  let result = '';
  while (num > 0n) {
    result = alphabet[Number(num % 58n)] + result;
    num = num / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = alphabet[0] + result;
  }
  return result;
}

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
 * Transfer SOL from connected wallet to treasury wallet
 * @param {number} solAmount - Amount in SOL (e.g., 0.001)
 * @param {Object} options - { memo?: string }
 * @returns {Promise<string>} Transaction signature
 */
export async function paySol(solAmount, { memo } = {}) {
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
  
  // Transfer instruction
  ixs.push(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: TIDE_TREASURY,
      lamports: Number(lamports),
    })
  );
  
  // Add memo if provided
  if (memo) {
    const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    ixs.push({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(memo, 'utf8'),
    });
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
