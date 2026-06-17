// Single source of truth for the API server base URL plus a timeout-guarded
// fetch. Previously the base URL was resolved four different ways across the
// codebase (two different env-var names + two hostname checks), which made
// misconfiguration easy. Everything now funnels through here.

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

function resolveApiBase() {
  // Explicit override wins. Support both historical env-var names.
  const explicit = ENV.VITE_API_URL || ENV.VITE_API_SERVER_URL;
  if (explicit) return String(explicit).replace(/\/+$/, "");

  // Local dev convenience.
  if (typeof window !== "undefined" &&
      /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return "http://localhost:3000";
  }

  return "https://tidal-fishing.onrender.com";
}

export const API_BASE = resolveApiBase();

// SIWS session hooks, wired in by src/web3/session.js. Kept as setter-injected
// callbacks so this module has no import cycle with the session/wallet layer.
let _getToken = null;
let _reauth = null;

/** Register the session token provider + re-auth callback (called once). */
export function setAuthHooks({ getToken, reauth } = {}) {
  if (getToken) _getToken = getToken;
  if (reauth) _reauth = reauth;
}

/**
 * fetch() with an AbortController timeout so a hung server can never wedge the
 * game's network calls forever. Accepts a path (joined to API_BASE) or a full
 * URL. Options:
 *   - timeoutMs (default 12s)
 *   - auth: true  → for write calls; transparently re-establishes a SIWS
 *                   session and retries once if the server reports it expired.
 * A session bearer token (when present) is always attached. Behaves like fetch
 * otherwise.
 */
export async function apiFetch(path, { timeoutMs = 12000, auth = false, _retried = false, ...options } = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
  const headers = { ...(options.headers || {}) };
  const token = _getToken?.();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });

    if (auth && res.status === 401 && !_retried && _reauth) {
      let code;
      try { code = (await res.clone().json())?.code; } catch { /* ignore */ }
      if (code === 'SESSION_REQUIRED' || code === 'SESSION_INVALID') {
        const ok = await _reauth();
        if (ok) return apiFetch(path, { timeoutMs, auth, _retried: true, ...options });
      }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
