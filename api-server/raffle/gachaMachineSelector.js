// Pure selection of which gacha machine a new raffle awards.
//
// Per product spec: enumerate every card TYPE the gacha offers, take the
// CHEAPEST pack within each type, and randomly shuffle through those cheapest
// packs each cycle. This caps the house's per-draw USDC cost while still rotating
// the prize across every collection the machine carries.
//
// Pure + dependency-free so the selection rule is unit-testable in isolation.

/**
 * Derive a card "type" key from a machine code by stripping a trailing price
 * suffix. e.g. "pokemon_50"/"pokemon_250" -> "pokemon"; "sports" -> "sports";
 * "elite_100" -> "elite". Falls back to the whole code when there's no suffix.
 * @param {string} code
 * @returns {string}
 */
export function cardType(code = '') {
  const raw = String(code).trim().toLowerCase();
  const stripped = raw.replace(/[_-]?\d+$/, '');
  return stripped || raw;
}

/** Whether a machine has any inventory. Unknown stock is treated as available. */
function hasStock(stock) {
  if (stock === undefined || stock === null) return true;
  if (typeof stock !== 'object') return true;
  const vals = Object.values(stock);
  if (vals.length === 0) return true;
  return vals.some((n) => Number(n) > 0);
}

/**
 * The cheapest open, in-stock, public machine for each card type.
 * @param {Array<object>} machines   machine configs (from /api/machines)
 * @param {Set<string>} [openCodes]  codes currently open (from /api/status);
 *                                   when omitted, open-state is not filtered.
 * @returns {Array<object>} one machine per card type (the cheapest of each)
 */
export function cheapestPerType(machines = [], openCodes = null) {
  const byType = new Map();
  for (const m of machines) {
    if (!m || !m.code) continue;
    if (m.public === false) continue;
    if (openCodes && !openCodes.has(m.code)) continue;
    if (!hasStock(m.stock)) continue;
    const type = cardType(m.code);
    const price = Number(m.price);
    if (!Number.isFinite(price)) continue;
    const cur = byType.get(type);
    if (!cur || price < Number(cur.price)) byType.set(type, m);
  }
  return [...byType.values()];
}

/**
 * Randomly choose one cheapest-per-type machine.
 * @param {Array<object>} machines
 * @param {object} [opts]
 * @param {Set<string>} [opts.openCodes]
 * @param {() => number} [opts.rng]  defaults to Math.random; inject for tests
 * @returns {object|null}  the chosen machine, or null when nothing is eligible
 */
export function pickPrizeMachine(machines = [], { openCodes = null, rng = Math.random } = {}) {
  const pool = cheapestPerType(machines, openCodes);
  if (pool.length === 0) return null;
  // Stable order (by type/code) so a seeded rng is fully reproducible.
  pool.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const r = Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
  const idx = Math.min(pool.length - 1, Math.floor(r * pool.length));
  return pool[idx];
}
