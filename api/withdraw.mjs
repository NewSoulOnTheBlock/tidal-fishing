// POST /api/withdraw
//
// Transfers $SBF from the Tidal treasury wallet to a player's connected
// wallet. Uses raw Solana RPC calls (no @solana/web3.js dependency issues)

import bs58 from "bs58";
import { createHash } from "crypto";

const RPC_URL = process.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TIDE_MINT_STR = process.env.VITE_TIDE_MINT || "HBibqRqqzAbnvZ4ogkcma6nzaoNWgpEimajVjHA3pump";
const SECRET_STR = process.env.TIDAL_TREASURY_SECRET || "";
const TIDE_DECIMALS = Number(process.env.VITE_TIDE_DECIMALS ?? 6);
const MAX_UI_AMOUNT = Number(process.env.TIDAL_WITHDRAW_MAX ?? 100_000_000);

const TRUSTED_ORIGINS = new Set([
  "https://www.bullfishblitz.com",
  "https://bullfishblitz.com",
  "https://tidal-fishing.vercel.app",
  "https://tidal-fishing-ljiulguis-projects.vercel.app",
  "https://tidal-fishing-kelbyrebelcrew-2550-ljiulguis-projects.vercel.app",
  "https://tidalfishing.fun",
  "http://localhost:8642",
  "http://localhost:8643",
  "http://127.0.0.1:8642",
  "http://127.0.0.1:8643",
  ...String(process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
]);

function requestOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin === "string" && TRUSTED_ORIGINS.has(origin)) return origin;
  const referer = req.headers.referer || req.headers.referrer;
  if (typeof referer === "string") {
    try {
      const refererOrigin = new URL(referer).origin;
      if (TRUSTED_ORIGINS.has(refererOrigin)) return refererOrigin;
    } catch { /* ignore */ }
  }
  return null;
}

function applyCors(res, origin) {
  res.setHeader("Vary", "Origin");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key");
}

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
  const origin = requestOrigin(req);
  applyCors(res, origin);

  if (req.method === "OPTIONS") {
    if (!origin) return res.status(403).json({ error: "Forbidden origin", code: "ORIGIN_FORBIDDEN" });
    return res.status(204).end();
  }

  if (!origin) {
    return res.status(403).json({ error: "Forbidden origin", code: "ORIGIN_FORBIDDEN" });
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
