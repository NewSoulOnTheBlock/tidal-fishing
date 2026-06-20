// Pure, side-effect-free catch validation rules — the authoritative anti-cheat
// for /api/player/catch. Kept in its own module so the decision logic can be
// unit-tested without booting the Express server or a database.
//
// The server still owns the SQL (player lookup, the per-window catch counts,
// and the INSERT/ledger update); this module makes the *decision* from those
// counts plus the species catalog entry.

export const FLAT_VALUE_CEIL = 500_000; // fallback ceiling if a species lacks a catalog max

// Server-side anti-farming caps. Set ABOVE the client limits so honest players
// gated by the client never trip these, but a client-bypassing bot is bounded.
export const SERVER_CAPS = {
  perMin: 12,
  perHour: 250,
  perDay: 1200,
  earnHour: 800_000,
  earnDay: 4_000_000,
  // Rarity plausibility caps. Tuned far ABOVE legitimate play, with extra
  // headroom now that premium consumable bait can legitimately raise a fast
  // angler's legendary rate, but still well below automation that claims a rare
  // fish every catch. Earnings caps ($800k/hr, $4M/day — scaled with the 100x
  // payout multiplier) remain the real money backstop, and the reachability
  // gate independently rejects impossible species.
  legendaryHour: 60,
  legendaryDay: 300,
  jackpotDay: 8,
};

function intOr(v, def = 0, min = 0, max = 2_000_000_000) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

const reject = (status, code, error) => ({ ok: false, status, code, error });

/**
 * Decide whether a claimed catch is legitimate and compute the server-authoritative
 * value / size / weight / rarity to persist.
 *
 * @param {object}  args
 * @param {object?} args.cap          catalog entry: { max, jackpot, rarity, sizeMin, sizeMax, weightMax, spawn:{loc:weight} }
 * @param {string}  args.location     claimed location id
 * @param {boolean} args.validLocation whether `location` is a known fishing spot
 * @param {boolean} args.isHotSpot    whether `location` is today's +10% hot spot
 * @param {object}  args.catchData    raw client payload { value, sizeCm, weightKg, ... }
 * @param {object}  args.counts       DB aggregate { m,h,d,eh,ed,lh,ld,js }
 * @param {object} [args.caps]        cap table (defaults to SERVER_CAPS)
 * @returns {{ok:true,value,sizeCm,weightKg,rarity,isJackpot,isLegendary} | {ok:false,status,code,error}}
 */
export function evaluateCatch({ cap, location, validLocation, isHotSpot, catchData = {}, counts = {}, caps = SERVER_CAPS }) {
  if (!cap) return reject(400, 'BAD_SPECIES', 'Unknown species');
  if (!validLocation) return reject(400, 'BAD_LOCATION', 'Invalid location');

  // REACHABILITY GATE — a species can only be credited where it actually spawns.
  const spawn = cap.spawn || {};
  if (!Object.prototype.hasOwnProperty.call(spawn, location)) {
    return reject(400, 'BAD_SPECIES_LOCATION', 'That fish cannot be caught here');
  }

  const hotMult = isHotSpot ? 1.1 : 1;
  const ceiling = Math.ceil((cap.max ?? FLAT_VALUE_CEIL) * 1.02 * hotMult) + 2;
  let value = intOr(catchData.value, 0, 0, ceiling);

  // Server-authoritative rarity (never trust the client's claim).
  const rarity = String(cap.rarity || 'common').slice(0, 20);
  const isLegendary = rarity === 'legendary' || rarity === 'mythic' || rarity === 'ultramythic';
  const isJackpot = !!cap.jackpot;

  const m = Number(counts.m) || 0;
  const h = Number(counts.h) || 0;
  const d = Number(counts.d) || 0;
  const eh = Number(counts.eh) || 0;
  const ed = Number(counts.ed) || 0;
  const lh = Number(counts.lh) || 0;
  const ld = Number(counts.ld) || 0;
  const js = Number(counts.js) || 0;

  if (m >= caps.perMin || h >= caps.perHour || d >= caps.perDay) {
    return reject(429, 'RATE_LIMIT', 'Catch rate limit reached');
  }
  // Rarity plausibility backstop — an impossible streak of the rarest fish.
  if (isJackpot && js >= caps.jackpotDay) {
    return reject(429, 'RARITY_LIMIT', 'Catch rejected');
  }
  if (isLegendary && (lh >= caps.legendaryHour || ld >= caps.legendaryDay)) {
    return reject(429, 'RARITY_LIMIT', 'Catch rejected');
  }

  // Cap credited value to the remaining hourly/daily earnings allowance.
  value = Math.max(0, Math.min(value, caps.earnHour - eh, caps.earnDay - ed));

  // Clamp size/weight to the species' real range (+headroom) so a tampered
  // client cannot fake a record-breaking specimen.
  const sizeHi = (cap.sizeMax ?? 99999) * 1.25 + 5;
  const sizeLo = Math.max(0, (cap.sizeMin ?? 0) * 0.5);
  const sizeCm = Math.min(sizeHi, Math.max(sizeLo, Number(catchData.sizeCm) || 0));
  const weightHi = (cap.weightMax ?? 99999) * 1.5 + 1;
  const weightKg = Math.min(weightHi, Math.max(0, Number(catchData.weightKg) || 0));

  return { ok: true, value, sizeCm, weightKg, rarity, isJackpot, isLegendary };
}
