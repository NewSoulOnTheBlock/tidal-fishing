// On-chain $TIDE payment helpers — TREASURY TRANSFER MODEL.
//
// When the player has a wallet connected AND VITE_TIDE_MINT is set, every gear
// / location purchase TRANSFERS the $TIDE amount from the player's ATA to the
// treasury wallet. This creates a circular economy: players earn $TIDE, spend
// it to unlock gear/maps, and the treasury recycles it for future payouts.
//
// Until the token is deployed, TIDE_MINT will be null and the UI branches that
// depend on `isOnChainPayEnabled()` stay hidden — so this module is a no-op.

import {
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { connection, TIDE_MINT, TIDE_TREASURY, base58Encode } from "./solana.js";
import { signAndSendTransaction, currentPublicKey, signTransaction } from "./wallet.js";
import { fetchSplBalance } from "./token.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const TIDE_DECIMALS = Number(import.meta.env.VITE_TIDE_DECIMALS ?? 6);

/** True if a wallet is connected AND the $TIDE mint is configured. */
export function isOnChainPayEnabled() {
  return Boolean(TIDE_MINT && currentPublicKey());
}

export function paymentConfig() {
  return {
    mint: TIDE_MINT?.toBase58() ?? null,
    model: "transfer_to_treasury",
    treasury: TIDE_TREASURY?.toBase58() ?? null,
    decimals: TIDE_DECIMALS,
    enabled: isOnChainPayEnabled(),
  };
}

/**
 * Transfer `uiAmount` of on-chain $TIDE from the connected wallet to the
 * treasury wallet. Returns the tx signature on success.
 *
 * `uiAmount` is the human-facing $TIDE figure (e.g. 9000). It's converted to
 * raw token units using `VITE_TIDE_DECIMALS` (default 6).
 *
 * The transfer creates a circular economy: players earn $TIDE from fishing,
 * spend it to unlock gear/maps, and the treasury recycles it for future payouts.
 * A memo instruction is attached so block explorers display the purchase
 * reason (`tidal:gear:rods:2`, `tidal:loc:river`, etc.).
 */
export async function payTide(uiAmount, { memo } = {}) {
  if (!isOnChainPayEnabled()) {
    throw new Error("On-chain $TIDE payment is not configured");
  }
  if (!TIDE_TREASURY) {
    throw new Error("Treasury wallet not configured");
  }
  const payer = currentPublicKey();
  if (!payer) throw new Error("Wallet not connected");
  const rawAmount = BigInt(Math.round(uiAmount * 10 ** TIDE_DECIMALS));

  const balance = await fetchSplBalance(payer, TIDE_MINT);
  if (!balance || balance.raw < rawAmount) {
    throw new Error(`Not enough on-chain $TIDE (have ${balance?.ui ?? 0}, need ${uiAmount})`);
  }

  const { address: playerAta, programId: tokenProgram } = await getAssociatedTokenAddress(TIDE_MINT, payer);
  const { address: treasuryAta } = await getAssociatedTokenAddress(TIDE_MINT, TIDE_TREASURY);

  const ixs = [];
  ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  ixs.push(createTransferIx(playerAta, treasuryAta, payer, rawAmount, tokenProgram));
  if (memo) {
    ixs.push(buildMemoIx(memo));
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: payer,
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(...ixs);

  const serialized = tx.serialize({ requireAllSignatures: false });
  let signature;
  try {
    const sigBytes = await signAndSendTransaction(serialized);
    // Convert Uint8Array signature to base58 string
    signature = typeof sigBytes === 'string' ? sigBytes : base58Encode(sigBytes);
  } catch (e) {
    // Wallet doesn't support sign+send — fall back to sign + manual send.
    if (!/signAndSend/.test(e?.message ?? "")) throw e;
    const signed = await signTransaction(serialized);
    signature = await connection.sendRawTransaction(signed, { maxRetries: 3 });
  }

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return signature;
}

// --- minimal SPL Token v1/v2 instruction builders (we deliberately avoid pulling
//     in @solana/spl-token just for two instructions; it adds ~100KB) -------

async function getAssociatedTokenAddress(mint, owner) {
  // Try both Token programs (classic SPL Token and Token-2022)
  const [classicAta] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [token2022Ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  // Check which one exists
  const [classicInfo, t2022Info] = await Promise.all([
    connection.getAccountInfo(classicAta),
    connection.getAccountInfo(token2022Ata),
  ]);
  
  if (t2022Info) {
    return { address: token2022Ata, programId: TOKEN_2022_PROGRAM_ID };
  }
  return { address: classicAta, programId: TOKEN_PROGRAM_ID };
}

function createTransferIx(fromAccount, toAccount, owner, amount, tokenProgram) {
  // SPL Token instruction 3 = Transfer { amount: u64 }
  //   Accounts:
  //     0. [writable] Source token account
  //     1. [writable] Destination token account
  //     2. [signer]   Owner of the source account
  const data = new Uint8Array(9);
  data[0] = 3; // Transfer instruction
  // Write amount as little-endian u64
  const view = new DataView(data.buffer);
  view.setBigUint64(1, amount, true); // true = little-endian
  return new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: fromAccount, isSigner: false, isWritable: true },
      { pubkey: toAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
function buildMemoIx(text) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: new TextEncoder().encode(text),
  });
}
