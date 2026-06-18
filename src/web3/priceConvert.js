// Live SOL <-> $TIDE conversion via the Jupiter Price API v3.
//
// Bait (and anything else priced in SOL) shows a $TIDE alternative price that
// must equal the SOL cost's real market value. Rather than a fixed rate, we ask
// Jupiter for the live USD price of both SOL and $TIDE and derive how many $TIDE
// equal 1 SOL: tidePerSol = usd(SOL) / usd(TIDE).
//
// The result is cached (60s) so the synchronous shop UI can read it instantly;
// `refreshRate()` is fire-and-forget and self-throttles. If Jupiter is ever
// unreachable we fall back to a conservative constant so the shop never breaks.

import { TIDE_MINT_ADDRESS } from "./marketcap.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_URL = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT},${TIDE_MINT_ADDRESS}`;

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8000;

// Only used if the live price can't be fetched at all. Intentionally rough.
const FALLBACK_TIDE_PER_SOL = 4_000_000;

let cachedRate = 0; // $TIDE per 1 SOL; 0 = not yet loaded
let cachedAt = 0;
let inflight = null;

/** True once a live rate has been fetched at least once. */
export function isRateLoaded() {
  return cachedRate > 0;
}

/** Current $TIDE-per-SOL rate (live cache, or the fallback if never loaded). */
export function tidePerSol() {
  return cachedRate > 0 ? cachedRate : FALLBACK_TIDE_PER_SOL;
}

/** Convert a SOL amount to its live $TIDE-equivalent, rounded to a whole token. */
export function solToTideLive(solAmount) {
  const v = Number(solAmount);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(1, Math.round(v * tidePerSol()));
}

/**
 * Refresh the cached rate from Jupiter. Resolves to the ($TIDE per SOL) rate.
 * Self-throttling: returns the cache immediately while it's fresh, and dedupes
 * concurrent callers onto a single in-flight request.
 */
export async function refreshRate() {
  if (cachedRate > 0 && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRate;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      let data;
      try {
        const res = await fetch(JUPITER_URL, {
          signal: ctrl.signal,
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } finally {
        clearTimeout(t);
      }
      const solUsd = Number(data?.[SOL_MINT]?.usdPrice);
      const tideUsd = Number(data?.[TIDE_MINT_ADDRESS]?.usdPrice);
      if (solUsd > 0 && tideUsd > 0) {
        cachedRate = solUsd / tideUsd;
        cachedAt = Date.now();
      }
    } catch (err) {
      console.warn("[priceConvert] Jupiter rate failed:", err?.message || err);
    } finally {
      inflight = null;
    }
    return tidePerSol();
  })();

  return inflight;
}
