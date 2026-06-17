// Client-side wrapper around POST /api/withdraw. The actual signing happens
// server-side — the treasury private key never reaches the browser.
//
// Treasury Wallet: CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror
// This wallet holds $TIDE reserves that users can withdraw to their connected wallets.

import { TIDE_MINT } from "./solana.js";
import { currentPublicKey, signMessage } from "./wallet.js";
import { apiFetch } from "../utils/api.js";

/** True when the client has enough config to even attempt a withdrawal. */
export function isWithdrawConfigured() {
  return Boolean(TIDE_MINT && currentPublicKey());
}

/** Base64-encode a small byte array (signatures are 64 bytes). */
function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Withdraw `amount` $TIDE from the Tidal treasury to the connected wallet.
 *
 * The server requires a wallet signature proving ownership of the recipient
 * address. We build a short, human-readable, single-use authorization message,
 * ask the wallet to sign it, and send the signature alongside the request.
 * Returns the tx signature on success.
 */
export async function withdrawTide(amount) {
  const recipient = currentPublicKey();
  if (!recipient) throw new Error("Wallet not connected");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

  const recipientStr = recipient.toBase58();

  // Build the authorization message the wallet will display + sign.
  const nonce = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const issued = Date.now();
  const message =
    `Tidal Fishing withdrawal\n` +
    `wallet: ${recipientStr}\n` +
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

  // 60s timeout: the server signs AND confirms the on-chain transfer before
  // responding, so allow generous time but never hang the UI forever.
  const res = await apiFetch("/api/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: recipientStr, amount, message, signature }),
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
  return body.signature;
}
