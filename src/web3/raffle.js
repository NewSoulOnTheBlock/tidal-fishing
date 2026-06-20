// Client API wrapper for the 24-Hour Fish Raffle → Gacha Prize system.
//
// Mirrors src/web3/database.js: every call funnels through apiFetch (timeouts +
// SIWS bearer token). All ticket math + winner selection is server-authoritative;
// these are thin read/write helpers for the "Lucky Catch" shop tab.

import { apiFetch } from '../utils/api.js';

async function jsonOrThrow(res, fallbackMsg) {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(body?.error || fallbackMsg || `Request failed (${res.status})`);
    err.code = body?.code || 'RAFFLE_ERROR';
    err.status = res.status;
    throw err;
  }
  return body;
}

/** Current raffle: countdown, prize machine, totals (+ this wallet's tickets when given). */
export async function getCurrentRaffle(walletAddress = null) {
  const q = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
  const res = await apiFetch(`/api/raffle/current${q}`, { timeoutMs: 10000 });
  return jsonOrThrow(res, 'Could not load the raffle');
}

/** This wallet's tickets, exchangeable fish inventory, entries, and win history. */
export async function getUserRaffle(walletAddress) {
  const q = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
  const res = await apiFetch(`/api/raffle/user${q}`, { auth: true, interactive: false, timeoutMs: 10000 });
  return jsonOrThrow(res, 'Could not load your tickets');
}

/** Past raffles + winners (most recent first). */
export async function getRaffleHistory(limit = 10) {
  const res = await apiFetch(`/api/raffle/history?limit=${encodeURIComponent(limit)}`, { timeoutMs: 10000 });
  const body = await jsonOrThrow(res, 'Could not load past winners');
  return body?.raffles || [];
}

/**
 * Exchange a caught fish (by its server catch id) for weighted raffle tickets.
 * Requires a signed-in session; the server recomputes the ticket value.
 * @returns {Promise<{ok:boolean, ticketsAwarded:number, userTickets:number, totalTickets:number}>}
 */
export async function exchangeFishForTickets(walletAddress, fishId) {
  const res = await apiFetch('/api/raffle/exchange-fish', {
    method: 'POST',
    auth: true,
    interactive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, fishId }),
    timeoutMs: 15000,
  });
  return jsonOrThrow(res, 'Exchange failed');
}
