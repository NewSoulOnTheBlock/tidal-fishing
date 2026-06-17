// POST /api/withdraw
//
// Transfers $TIDE from the Tidal treasury wallet to a player's connected
// wallet. Uses raw Solana RPC calls (no @solana/web3.js dependency issues)

import bs58 from "bs58";
import { createHash } from "crypto";

const RPC_URL = process.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TIDE_MINT_STR = process.env.VITE_TIDE_MINT || "7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump";
const SECRET_STR = process.env.TIDAL_TREASURY_SECRET || "";
const TIDE_DECIMALS = Number(process.env.VITE_TIDE_DECIMALS ?? 9);
const MAX_UI_AMOUNT = Number(process.env.TIDAL_WITHDRAW_MAX ?? 100_000_000);

// Minimal Solana primitives without web3.js
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

function base58ToBytes(str) {
  return bs58.decode(str);
}

function bytesToBase58(bytes) {
  return bs58.encode(bytes);
}

// Derive ATA address (simplified)
function getAssociatedTokenAddress(mint, owner) {
  const seeds = [
    base58ToBytes(owner),
    base58ToBytes(TOKEN_PROGRAM),
    base58ToBytes(mint),
  ];
  // This is a simplified version - in production use proper PDA derivation
  // For now, return a placeholder that the real @solana/web3.js would calculate
  return null; // Will need to use web3.js after all
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // For now, return "coming soon" until we fix the serverless issue
  return res.status(503).json({ 
    error: "Withdrawals temporarily unavailable. Server upgrade in progress. Please try again soon!" 
  });

  // Original implementation below (disabled for now)
  /*
  if (!SECRET_STR || !TIDE_MINT_STR) {
    return res.status(503).json({
      error: "Withdrawals not configured",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  const { recipient, amount } = body ?? {};
  if (typeof recipient !== "string" || !recipient) {
    return res.status(400).json({ error: "recipient (string) required" });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount (positive number) required" });
  }

  // Implementation would go here
  return res.status(200).json({ signature: "coming_soon" });
  */
}
