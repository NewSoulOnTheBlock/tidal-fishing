// Pure, deterministic, auditable weighted winner selection for the raffle.
//
// Given the per-user ticket totals and a random seed, it ALWAYS picks the same
// winner — so the draw can be independently re-verified after the fact from the
// data we persist (the seed + total ticket count + the ordered entry ledger).
//
// More tickets = higher chance, and EVERY ticket counts: a user holding 1 ticket
// out of 100 still has exactly a 1% chance. Winner selection happens only here,
// server-side; the client never rolls.

import crypto from 'node:crypto';

/** Cryptographically-strong 256-bit hex seed for a draw. */
export function makeSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Aggregate raw entries into per-user ticket totals, in a STABLE order
 * (ascending userId) so range assignment is reproducible for audit.
 * @param {Array<{userId:(number|string),tickets:number}>} entries
 * @returns {Array<{userId:(number|string),tickets:number}>}
 */
export function aggregate(entries = []) {
  const totals = new Map();
  for (const e of entries) {
    const id = e.userId;
    const t = Math.max(0, Math.floor(Number(e.tickets) || 0));
    if (t <= 0) continue;
    totals.set(id, (totals.get(id) || 0) + t);
  }
  return [...totals.entries()]
    .map(([userId, tickets]) => ({ userId, tickets }))
    .sort((a, b) => {
      // Numeric-aware stable sort (player ids are integers here).
      const an = Number(a.userId);
      const bn = Number(b.userId);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.userId) < String(b.userId) ? -1 : String(a.userId) > String(b.userId) ? 1 : 0;
    });
}

/**
 * Convert a hex seed + total ticket count into a winning ticket index in
 * [0, total). Uses the full 256-bit seed mod total — the modulo bias is
 * negligible (< 2^-200) for any realistic ticket count.
 * @param {string} seedHex
 * @param {number} total
 * @returns {number|null}
 */
export function winningTicket(seedHex, total) {
  const t = Math.floor(Number(total) || 0);
  if (t <= 0) return null;
  const clean = String(seedHex).replace(/^0x/i, '');
  const seedInt = BigInt('0x' + (clean || '0'));
  return Number(seedInt % BigInt(t));
}

/**
 * Select the raffle winner from a list of (userId, tickets) entries.
 *
 * @param {Array<{userId:(number|string),tickets:number}>} entries
 * @param {string} [seedHex] random seed; defaults to a fresh secure seed
 * @returns {null | {
 *   winnerUserId:(number|string),
 *   winningTicket:number,
 *   totalTickets:number,
 *   seed:string,
 *   ranges:Array<{userId:(number|string),start:number,end:number,tickets:number}>
 * }}  null when there are no tickets at all (empty raffle).
 */
export function selectWinner(entries = [], seedHex = makeSeed()) {
  const agg = aggregate(entries);
  const totalTickets = agg.reduce((s, e) => s + e.tickets, 0);
  if (totalTickets <= 0) return null;

  const ticket = winningTicket(seedHex, totalTickets);
  const ranges = [];
  let cursor = 0;
  let winnerUserId = null;
  for (const e of agg) {
    const start = cursor;
    const end = cursor + e.tickets; // half-open [start, end)
    ranges.push({ userId: e.userId, start, end, tickets: e.tickets });
    if (winnerUserId === null && ticket >= start && ticket < end) {
      winnerUserId = e.userId;
    }
    cursor = end;
  }
  return { winnerUserId, winningTicket: ticket, totalTickets, seed: String(seedHex), ranges };
}
