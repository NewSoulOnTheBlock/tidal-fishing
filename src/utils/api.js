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

/**
 * fetch() with an AbortController timeout so a hung server can never wedge the
 * game's network calls forever. Accepts a path (joined to API_BASE) or a full
 * URL. Extra option `timeoutMs` (default 12s). Behaves like fetch otherwise.
 */
export async function apiFetch(path, { timeoutMs = 12000, ...options } = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
