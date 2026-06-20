// Central Solana RPC client + on-chain config for Tidal.
//
// Network: mainnet-beta (live). Override with VITE_SOLANA_RPC_URL for a private
// RPC (Helius / QuickNode / Triton) — public endpoints rate-limit aggressively.
//
// Phase 1 is READ-ONLY: balance lookups + NFT inventory. No write transactions
// are signed without an explicit user confirm modal (Phase 2+).

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

const DEFAULT_RPC = clusterApiUrl("mainnet-beta");

export const NETWORK = "mainnet-beta";
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || DEFAULT_RPC;
export const EXPLORER_BASE = "https://solscan.io";

// On-chain Tidal mints. These addresses are set in Phase 2 when the $TIDE
// token + cNFT trees are deployed. For now we expose a single source of truth.
//
// Override via env (VITE_TIDE_MINT, VITE_GEAR_COLLECTION) for staging tests.
const RAW_TIDE_MINT = import.meta.env.VITE_TIDE_MINT || "CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump";
const RAW_GEAR_COLLECTION = import.meta.env.VITE_GEAR_COLLECTION || "";
const RAW_CATCH_TREE = import.meta.env.VITE_CATCH_TREE || "";

// Treasury wallet that holds $TIDE tokens for user withdrawals
const RAW_TIDE_TREASURY = import.meta.env.VITE_TIDE_TREASURY || "CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror";

export const TIDE_MINT = parsePubkeyOrNull(RAW_TIDE_MINT);
export const GEAR_COLLECTION = parsePubkeyOrNull(RAW_GEAR_COLLECTION);
export const CATCH_TREE = parsePubkeyOrNull(RAW_CATCH_TREE);
export const TIDE_TREASURY = parsePubkeyOrNull(RAW_TIDE_TREASURY);

function parsePubkeyOrNull(s) {
  if (!s) return null;
  try {
    return new PublicKey(s);
  } catch {
    console.warn("[tidal] invalid pubkey in env:", s);
    return null;
  }
}

export const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  disableRetryOnRateLimit: false,
});

export function explorerAddressUrl(address) {
  return `${EXPLORER_BASE}/account/${address}`;
}

export function explorerTxUrl(sig) {
  return `${EXPLORER_BASE}/tx/${sig}`;
}

export function shortAddress(addr, head = 4, tail = 4) {
  const s = typeof addr === "string" ? addr : addr?.toBase58?.();
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// Base58 encoder (Bitcoin/Solana alphabet). Used to stringify the raw signature
// bytes that some wallet adapters return from signAndSend. Lives here so the
// $TIDE and SOL payment paths share one implementation instead of duplicating it.
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58Encode(bytes) {
  let num = 0n;
  for (const byte of bytes) num = num * 256n + BigInt(byte);
  let result = num === 0n ? BASE58_ALPHABET[0] : "";
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = BASE58_ALPHABET[0] + result;
  }
  return result;
}
