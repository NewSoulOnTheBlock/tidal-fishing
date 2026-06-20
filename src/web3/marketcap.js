// $TIDE market data: live price + market cap for the title-screen dashboard.
//
// Primary source: DexScreener (returns marketCap/fdv directly, CORS-open).
// Fallback:       Jupiter Price API v3 (price only) × on-chain-style supply.
//
// Both are public, key-less HTTP endpoints. Failures are swallowed and surfaced
// as a null return so the UI can simply hide itself.
//
// Note: the mint is read from the same env var as web3/solana.js but is NOT
// imported from there — keeping this module free of the @solana/web3.js graph
// avoids perturbing Rollup's wallet-chunk tree-shaking for a tiny price widget.

export const TIDE_MINT_ADDRESS =
  import.meta.env.VITE_TIDE_MINT || "CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump";

const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${TIDE_MINT_ADDRESS}`;
const JUPITER_URL = `https://lite-api.jup.ag/price/v3?ids=${TIDE_MINT_ADDRESS}`;

// pump.fun tokens mint a fixed 1,000,000,000 supply. Used only to estimate FDV
// from the Jupiter fallback price when DexScreener is unavailable.
const PUMPFUN_SUPPLY = 1_000_000_000;

const REQUEST_TIMEOUT_MS = 8000;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fromDexScreener() {
  const data = await fetchJson(DEXSCREENER_URL);
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  if (!pairs.length) return null;

  // Prefer the deepest-liquidity pair for the most representative numbers.
  const best = pairs
    .slice()
    .sort((a, b) => (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0))[0];

  const priceUsd = Number(best?.priceUsd);
  const marketCap = Number(best?.marketCap) || Number(best?.fdv);
  if (!Number.isFinite(marketCap) || marketCap <= 0) return null;

  return {
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
    marketCap,
    change24h: Number(best?.priceChange?.h24),
    symbol: best?.baseToken?.symbol || "TIDE",
    source: "dexscreener",
  };
}

async function fromJupiter() {
  const data = await fetchJson(JUPITER_URL);
  const entry = data?.[TIDE_MINT_ADDRESS];
  const priceUsd = Number(entry?.usdPrice);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  return {
    priceUsd,
    marketCap: priceUsd * PUMPFUN_SUPPLY,
    change24h: Number(entry?.priceChange24h),
    symbol: "TIDE",
    source: "jupiter",
  };
}

// Returns { priceUsd, marketCap, change24h, symbol, source } or null on failure.
export async function fetchTideMarket() {
  if (!TIDE_MINT_ADDRESS) return null;
  try {
    const ds = await fromDexScreener();
    if (ds) return ds;
  } catch (err) {
    console.warn("[marketcap] DexScreener failed, trying Jupiter:", err?.message || err);
  }
  try {
    return await fromJupiter();
  } catch (err) {
    console.warn("[marketcap] Jupiter fallback failed:", err?.message || err);
    return null;
  }
}

// Compact money formatting: 13275.54 -> "$13.3K", 2_400_000 -> "$2.4M".
export function formatUsdCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

// Price formatting that keeps small token prices readable (sub-cent precision).
export function formatUsdPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  // Very small: trim to ~3 significant figures after the leading zeros.
  return `$${v.toPrecision(3)}`;
}
