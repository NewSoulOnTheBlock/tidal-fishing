// Resolve a wallet's `.skr` (Seeker / ANS) domain name for display in the
// "Catch of the Day" banner. The catch-of-the-day is a single wallet shown to
// every client, so resolving once server-side (cached) is far cheaper than
// every browser resolving it.
//
// Defensive by design: the whole module is optional. If @onsol/tldparser or the
// RPC is unavailable, every lookup simply returns null and callers fall back to
// the username / shortened address — the core API is never affected.

import { createRequire } from 'node:module';
import { PublicKey } from '@solana/web3.js';

const require = createRequire(import.meta.url);

const TLD = 'skr';
const POS_TTL_MS = 6 * 60 * 60 * 1000; // resolved name — domains rarely change
const NEG_TTL_MS = 60 * 60 * 1000;     // definitively no .skr domain
const ERR_TTL_MS = 60 * 1000;          // after an RPC error/timeout — retry soon
const LOOKUP_TIMEOUT_MS = 2500;        // never let a slow RPC stall a refresh
const MAX_CACHE = 2000;

export function makeSkrResolver(connection) {
  let parser = null;
  try {
    const { TldParser } = require('@onsol/tldparser');
    parser = new TldParser(connection);
  } catch (e) {
    console.warn('[skr] resolver disabled (tldparser unavailable):', e?.message || e);
  }

  const cache = new Map();    // wallet -> { name: string|null, exp: number }
  const inflight = new Map(); // wallet -> Promise<string|null>

  async function lookup(wallet) {
    let owner;
    try { owner = new PublicKey(wallet); } catch { return null; }
    const domains = await parser.getParsedAllUserDomainsFromTld(owner, TLD);
    if (Array.isArray(domains) && domains.length > 0) {
      // getParsedAllUserDomainsFromTld returns { nameAccount, domain:"name.skr" },
      // sorted alphabetically — take the first as the canonical handle.
      const d = domains[0]?.domain;
      if (typeof d === 'string' && d.trim()) return d.trim().toLowerCase();
    }
    return null;
  }

  function refresh(wallet) {
    if (inflight.has(wallet)) return inflight.get(wallet);
    const p = (async () => {
      let name = null;
      let ttl = NEG_TTL_MS;
      try {
        name = await Promise.race([
          lookup(wallet),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), LOOKUP_TIMEOUT_MS)),
        ]);
        ttl = name ? POS_TTL_MS : NEG_TTL_MS;
      } catch {
        name = null;
        ttl = ERR_TTL_MS; // transient — allow a retry shortly
      } finally {
        inflight.delete(wallet);
      }
      if (cache.size >= MAX_CACHE) {
        const now = Date.now();
        for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
        if (cache.size >= MAX_CACHE) cache.clear();
      }
      cache.set(wallet, { name, exp: Date.now() + ttl });
      return name;
    })();
    inflight.set(wallet, p);
    return p;
  }

  // Non-blocking read: returns the cached name (or null) immediately and kicks
  // off a background refresh on a miss/stale entry. The banner polls every ~60s,
  // so a freshly-changed catch-of-the-day wallet resolves on the next poll.
  function getSkrNameCached(wallet) {
    if (!parser || !wallet) return null;
    const hit = cache.get(wallet);
    if (hit && hit.exp > Date.now()) return hit.name;
    refresh(wallet).catch(() => {});
    return hit ? hit.name : null;
  }

  return { getSkrNameCached, enabled: !!parser };
}
