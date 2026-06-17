// Sign-In With Solana (SIWS) session.
//
// One signature when the wallet connects yields a short-lived bearer token that
// authorizes the write endpoints (save / catch / profile / chat). This proves
// the caller actually controls the wallet, so the server no longer trusts the
// `walletAddress` field in a request body on its own.
//
// The token is held in memory + sessionStorage (so a page reload doesn't force
// a re-sign) and attached automatically to API calls via the api.js auth hooks.

import { currentPublicKey, signMessage } from "./wallet.js";
import { apiFetch, setAuthHooks } from "../utils/api.js";

const STORAGE_KEY = "tidal_session_v1";

let _token = null;
let _exp = 0;
let _wallet = null;
let _inflight = null;
let _lastAttempt = 0;
const ATTEMPT_COOLDOWN_MS = 8_000;

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Current valid token, or null if missing/expired (60s safety margin). */
export function getSessionToken() {
  if (_token && Date.now() < _exp - 60_000) return _token;
  return null;
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ t: _token, e: _exp, w: _wallet }));
  } catch { /* sessionStorage unavailable — in-memory only */ }
}

/** Restore a still-valid token for `wallet` from sessionStorage (avoids re-signing on reload). */
export function restoreSession(wallet) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (o && o.w === wallet && typeof o.t === "string" && o.e > Date.now() + 60_000) {
      _token = o.t;
      _exp = o.e;
      _wallet = o.w;
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function clearSession() {
  _token = null;
  _exp = 0;
  _wallet = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Establish a session: prompt the wallet to sign a short login message and
 * exchange it for a bearer token. Deduped (concurrent callers share one prompt)
 * and a no-op when a valid token already exists. Returns true on success.
 */
export async function establishSession() {
  const pk = currentPublicKey();
  if (!pk) return false;
  const wallet = pk.toBase58();

  if (getSessionToken() && _wallet === wallet) return true;
  if (restoreSession(wallet)) return true;
  if (_inflight) return _inflight;
  // After a failure (e.g. the user dismissed the prompt) wait before prompting
  // again so a 30s autosave loop can't spam signature popups.
  if (Date.now() - _lastAttempt < ATTEMPT_COOLDOWN_MS) return false;
  _lastAttempt = Date.now();

  _inflight = (async () => {
    try {
      const issued = Date.now();
      const nonce = crypto?.randomUUID?.() ?? `${issued}-${Math.random().toString(36).slice(2)}`;
      const message =
        `Sign in to Tidal Fishing\n` +
        `wallet: ${wallet}\n` +
        `nonce: ${nonce}\n` +
        `issued: ${issued}`;

      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const signature = toBase64(sigBytes);

      const res = await apiFetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, message, signature }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.token) return false;

      _token = data.token;
      _exp = data.expiresAt || Date.now() + 23 * 60 * 60 * 1000;
      _wallet = wallet;
      persist();
      return true;
    } catch {
      return false;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

// Wire into the fetch layer so tokens attach automatically and authorized
// writes can transparently re-auth on expiry.
setAuthHooks({ getToken: getSessionToken, reauth: establishSession });
