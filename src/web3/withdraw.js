// Client-side wrapper around POST /api/withdraw. The actual signing happens
// server-side — the treasury private key never reaches the browser.
//
// Treasury Wallet: CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror
// This wallet holds $TIDE reserves that users can withdraw to their connected wallets.

import { TIDE_MINT } from "./solana.js";
import { currentPublicKey } from "./wallet.js";

/** True when the client has enough config to even attempt a withdrawal. */
export function isWithdrawConfigured() {
  return Boolean(TIDE_MINT && currentPublicKey());
}

/**
 * Withdraw `amount` $TIDE from the Tidal treasury to the connected wallet.
 * Returns the tx signature on success.
 */
export async function withdrawTide(amount) {
  const recipient = currentPublicKey();
  if (!recipient) throw new Error("Wallet not connected");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

  // Use Render API server (deployed separately from Vercel)
  const API_URL = import.meta.env.VITE_API_URL || "https://tidal-api.onrender.com";

  const res = await fetch(`${API_URL}/api/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: recipient.toBase58(), amount }),
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
