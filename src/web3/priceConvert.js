// Live ETH <-> USDG conversion for Robinhood Chain game pricing. The legacy
// function names keep existing shop/economy code working during migration.

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8000;
const FALLBACK_TIDE_PER_SOL = 3500; // USDG per ETH fallback
let cachedRate = 0;
let cachedAt = 0;
let inflight = null;

export function isRateLoaded() { return cachedRate > 0; }
export function tidePerSol() { return cachedRate > 0 ? cachedRate : FALLBACK_TIDE_PER_SOL; }
export function solToTideLive(ethAmount) { const v = Number(ethAmount); return Number.isFinite(v) && v > 0 ? Math.max(1, Math.round(v * tidePerSol())) : 0; }
export function tideToSolLive(usdgAmount) { const v = Number(usdgAmount); return Number.isFinite(v) && v > 0 ? v / tidePerSol() : 0; }

export async function refreshRate() {
  if (cachedRate > 0 && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRate;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { signal: ctrl.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const ethUsd = Number(data?.ethereum?.usd);
        if (ethUsd > 0) { cachedRate = ethUsd; cachedAt = Date.now(); }
      } finally { clearTimeout(t); }
    } catch (err) { console.warn("[priceConvert] ETH/USD rate failed:", err?.message || err); }
    finally { inflight = null; }
    return tidePerSol();
  })();
  return inflight;
}
