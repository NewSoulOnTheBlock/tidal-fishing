// Tiny client-side TTL cache for public, read-only GET JSON endpoints.
//
// Several widgets (the leaderboard panel + the chat medal flair) hit the same
// public /api/leaderboard view. This caches the parsed JSON per-URL for a short
// TTL and de-dupes concurrent in-flight requests so we don't fire redundant
// queries when multiple callers want the same data within a few seconds.
//
// Only use this for PUBLIC, non-authenticated responses that are identical for
// every viewer — never for per-wallet/private data.

import { apiFetch } from "./api.js";

const cache = new Map(); // url -> { t: number, data: any, inflight: Promise|null }

export async function cachedGetJson(url, ttlMs = 30000) {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit) {
    if (hit.data !== undefined && now - hit.t < ttlMs) return hit.data;
    if (hit.inflight) return hit.inflight; // coalesce concurrent callers
  }

  const inflight = (async () => {
    const res = await apiFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache.set(url, { t: Date.now(), data, inflight: null });
    return data;
  })();

  cache.set(url, { t: hit?.t ?? 0, data: hit?.data, inflight });
  try {
    return await inflight;
  } catch (e) {
    cache.delete(url); // don't poison the cache on failure
    throw e;
  }
}

/** Drop a cached entry (or everything) — call after a write that invalidates it. */
export function invalidateCache(url) {
  if (url) cache.delete(url);
  else cache.clear();
}
