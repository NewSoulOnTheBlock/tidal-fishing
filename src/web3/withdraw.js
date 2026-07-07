// Client-side wrappers around treasury withdrawals. The actual on-chain signing
// happens server-side — the treasury private key never reaches the browser.
//
// $SBF withdrawals transfer the token mint. SOL withdrawals spend the same
// server-authoritative earned-fish ledger, convert the requested $SBF-equivalent
// value to live SOL on the server, then transfer native SOL.

import { TIDE_MINT } from "./solana.js";
import { currentPublicKey, signMessage } from "./wallet.js";
import { apiFetch } from "../utils/api.js";

/** True when the client has enough config to even attempt a $SBF withdrawal. */
export function isWithdrawConfigured() {
  return Boolean(TIDE_MINT && currentPublicKey());
}

/** True when the client can request native SOL payouts. */
export function isSolWithdrawConfigured() {
  return Boolean(currentPublicKey());
}

/** Base64-encode a small byte array (signatures are 64 bytes). */
function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function signedWithdrawalRequest({ path, title, currency, amount, bodyExtra = {} }) {
  const recipient = currentPublicKey();
  if (!recipient) throw new Error("Wallet not connected");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

  const recipientStr = recipient.toBase58();
  const nonce = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const issued = Date.now();
  const message =
    `${title}\n` +
    `wallet: ${recipientStr}\n` +
    `currency: ${currency}\n` +
    `amount: ${amount}\n` +
    `nonce: ${nonce}\n` +
    `issued: ${issued}`;

  let signature;
  try {
    const sigBytes = await signMessage(new TextEncoder().encode(message));
    signature = toBase64(sigBytes);
  } catch (e) {
    throw new Error(e?.message?.includes("reject") ? "Withdrawal signature declined" : "Could not sign withdrawal authorization");
  }

  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: recipientStr, amount, message, signature, ...bodyExtra }),
    timeoutMs: 60000,
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body?.error ?? `Withdraw failed (HTTP ${res.status})`);
  }
  return body;
}

/** Withdraw `amount` $SBF from the treasury token account to the connected wallet. */
export async function withdrawTide(amount) {
  const body = await signedWithdrawalRequest({
    path: "/api/withdraw",
    title: "Tidal Fishing withdrawal",
    currency: "SBF",
    amount,
  });
  return body.signature;
}

/**
 * Withdraw a fish-sale balance as native SOL. `amount` is the $SBF-equivalent
 * fish value to consume from the authoritative earned ledger; the server computes
 * the live SOL amount and returns it with the transaction signature.
 */
export async function withdrawSol(amount) {
  return signedWithdrawalRequest({
    path: "/api/withdraw-sol",
    title: "Bull Fish Blitz SOL fish sale",
    currency: "SOL",
    amount,
  });
}
