// Read-only token & NFT helpers used by the wallet HUD.
//
// All Phase 1 operations are GET-only against mainnet:
//   - fetchSolBalance(pubkey)      -> SOL balance in lamports
//   - fetchTideBalance(pubkey)     -> $TIDE balance (raw + ui amount) or null
//   - fetchOwnedCount(pubkey, ...) -> # of tokens / NFTs of a given mint
//
// Phase 2 will add the write-side counterparts (mint, transfer, claim, burn).

import { PublicKey } from "@solana/web3.js";
import { connection, TIDE_MINT } from "./solana.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// A mint is owned by exactly one token program; cache the winner per mint so we
// stop issuing two getParsedTokenAccountsByOwner calls on every balance refresh.
const mintProgramCache = new Map(); // mint base58 -> owning program PublicKey

/** Lamports balance of any address. Returns 0 on failure. */
export async function fetchSolBalance(pubkey) {
  try {
    return await connection.getBalance(pubkey, "confirmed");
  } catch (e) {
    console.warn("[tidal] fetchSolBalance failed:", e?.message ?? e);
    return 0;
  }
}

/** Returns { raw: bigint, ui: number, decimals: number } | null if $TIDE not deployed or owner has none. */
export async function fetchTideBalance(pubkey) {
  if (!TIDE_MINT) return null;
  return fetchSplBalance(pubkey, TIDE_MINT);
}

/** Aggregate balance across all token accounts owned by `pubkey` for `mint`. */
export async function fetchSplBalance(pubkey, mint) {
  try {
    const mintKey = mint.toBase58 ? mint.toBase58() : String(mint);
    const cachedProg = mintProgramCache.get(mintKey);
    let accounts;
    if (cachedProg) {
      const r = await connection.getParsedTokenAccountsByOwner(pubkey, { mint, programId: cachedProg });
      accounts = r.value;
    } else {
      const [classic, t22] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(pubkey, { mint, programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(pubkey, { mint, programId: TOKEN_2022_PROGRAM_ID }),
      ]);
      // Cache the owning program on first positive hit (a mint never changes program).
      if (classic.value.length) mintProgramCache.set(mintKey, TOKEN_PROGRAM_ID);
      else if (t22.value.length) mintProgramCache.set(mintKey, TOKEN_2022_PROGRAM_ID);
      accounts = [...classic.value, ...t22.value];
    }
    if (accounts.length === 0) return { raw: 0n, ui: 0, decimals: 0 };
    
    // Deduplicate by account pubkey (some wallets/RPCs may return duplicates)
    const seen = new Set();
    let raw = 0n;
    let decimals = 0;
    for (const acc of accounts) {
      const key = acc.pubkey.toBase58();
      if (seen.has(key)) continue;
      seen.add(key);
      
      const info = acc.account.data.parsed?.info?.tokenAmount;
      if (!info) continue;
      raw += BigInt(info.amount ?? "0");
      decimals = info.decimals ?? decimals;
    }
    const ui = Number(raw) / 10 ** decimals;
    return { raw, ui, decimals };
  } catch (e) {
    console.warn("[tidal] fetchSplBalance failed:", e?.message ?? e);
    return null;
  }
}

export const SOL_DECIMALS = 9;

export function formatSol(lamports, fractionDigits = 4) {
  const v = Number(lamports) / 10 ** SOL_DECIMALS;
  return v.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}

export function formatTokens(amount, decimals, fractionDigits = 2) {
  if (amount == null) return "—";
  const v = typeof amount === "bigint" ? Number(amount) / 10 ** decimals : amount;
  return v.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}
