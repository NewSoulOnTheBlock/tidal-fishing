// Pure, side-effect-free ticket math for the 24-Hour Fish Raffle.
// Converts a server-recorded catch (rarity + size + weight) into raffle tickets.
// Kept dependency-free so it can be unit-tested without a DB or the gacha API —
// the same module the routes import is the one the tests exercise.
//
//   ticketValue = floor(sizeWeight * rarityMultiplier)
//
// "sizeWeight" is the base value derived from how BIG the fish is (weight is the
// primary driver, length a secondary one); the rarity multiplier then makes rare
// fish worth dramatically more, exactly as the design calls for.

// Rarity multipliers. Tidal has a 7th tier ("ultramythic") above mythic, scaled
// past it so the rarest catches dominate the prize pool.
export const RARITY_MULTIPLIERS = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 5,
  epic: 10,
  legendary: 25,
  mythic: 50,
  ultramythic: 100,
});

// Base "size weight" tuning. A typical common creekfish (~0.3 kg, ~18 cm) earns
// ~9 base tickets; a 30 kg / 150 cm bruiser earns ~240 before rarity. These are
// deliberately gentle so commons still count but rares/legendaries pull away.
export const TICKETS_PER_KG = 6;
export const TICKETS_PER_CM = 0.4;
export const MIN_TICKETS = 1;

/**
 * Multiplier for a rarity string (case-insensitive). Unknown rarities fall back
 * to the common (1x) multiplier so a tampered/legacy value can never inflate a
 * ticket count.
 * @param {string} rarity
 * @returns {number}
 */
export function rarityMultiplier(rarity) {
  const key = String(rarity || 'common').toLowerCase();
  return RARITY_MULTIPLIERS[key] ?? RARITY_MULTIPLIERS.common;
}

/**
 * Base "size weight" from a fish's physical dimensions (no rarity applied yet).
 * @param {{weightKg?:number,sizeCm?:number}} fish
 * @returns {number} non-negative real
 */
export function sizeWeight({ weightKg = 0, sizeCm = 0 } = {}) {
  const w = Math.max(0, Number(weightKg) || 0);
  const l = Math.max(0, Number(sizeCm) || 0);
  return w * TICKETS_PER_KG + l * TICKETS_PER_CM;
}

/**
 * Raffle tickets awarded for exchanging a single fish.
 *   tickets = max(MIN_TICKETS, floor(sizeWeight * rarityMultiplier))
 * @param {{rarity?:string,weightKg?:number,sizeCm?:number}} fish
 * @returns {number} integer >= MIN_TICKETS
 */
export function calcTickets(fish = {}) {
  const base = sizeWeight(fish);
  const mult = rarityMultiplier(fish.rarity);
  const tickets = Math.floor(base * mult);
  return Math.max(MIN_TICKETS, tickets);
}
