// Spawn weighting and fish instance rolls. Pure functions: context in,
// fish instance out.

import { CONFIG } from "../data/config.js";
import { FISH_BY_ID, RARITIES, getTimeSegment, sizeMid } from "../data/fishData.js";
import { clamp, lerp, randRange, weightedPick } from "../utils/utils.js";

/**
 * Picks a species for the current cast.
 * ctx: { location, zone, hours, weather, bait }
 */
export function rollSpecies(ctx) {
  const segment = getTimeSegment(ctx.hours);
  const cloudy = ctx.weather === "cloudy";

  const weightFor = (entry, ignoreZone) => {
    const [id, base] = entry;
    const sp = FISH_BY_ID[id];
    if (!sp) return 0;
    let w = base;
    if (!sp.zones.includes(ctx.zone)) {
      if (!ignoreZone) return 0;
      w *= 0.2;
    }
    if (!sp.time.includes(segment)) w *= 0.32;
    w *= ctx.bait.bias[sp.rarity] ?? 1;
    if (cloudy && RARITIES[sp.rarity].order >= 2) w *= CONFIG.weather.cloudyRareBoost;
    return w;
  };

  let entry = weightedPick(ctx.location.fishTable, (e) => weightFor(e, false));
  if (!entry) entry = weightedPick(ctx.location.fishTable, (e) => weightFor(e, true));
  if (!entry) entry = ctx.location.fishTable[0];
  return FISH_BY_ID[entry[0]];
}

/** Rolls a full fish instance (size, weight, value, xp, fight profile). */
export function rollFish(ctx) {
  const sp = rollSpecies(ctx);
  const [minS, maxS] = sp.sizeCm;
  // skew toward small: big specimens are rare
  const roll = Math.pow(Math.random(), 1.8);
  const sizeCm = Math.round(lerp(minS, maxS, roll) * 10) / 10;
  const mid = sizeMid(sp);
  const sizeNorm = (sizeCm - minS) / (maxS - minS);

  const weightKg = Math.max(0.01, sp.weightMidKg * Math.pow(sizeCm / mid, 2.9));
  const value = sp.fixedValue
    ? sp.baseValue
    : Math.round(sp.baseValue * (0.45 + 0.55 * Math.pow(sizeCm / mid, 2.2)));
  const rarity = RARITIES[sp.rarity];
  const xp = Math.round(rarity.xp * (0.75 + 0.5 * (sizeCm / mid)));

  return {
    speciesId: sp.id,
    name: sp.name,
    rarity: sp.rarity,
    sizeCm,
    weightKg: Math.round(weightKg * 100) / 100,
    value,
    xp,
    sizeNorm,
    jackpot: !!sp.jackpot,
    fight: {
      strength: sp.fight.strength * (0.85 + 0.35 * sizeNorm),
      surgeEvery: sp.fight.surgeEvery,
      heft: sp.fight.heft,
      stamina: sp.fight.stamina,
    },
    hookWindow: CONFIG.bite.hookWindowBase * rarity.hookMult * (sp.hookWindowMult ?? 1),
    stars: rarity.stars,
  };
}

/** Seconds until the next bite given location, bait, weather and depth. */
export function rollBiteWait(ctx) {
  let wait = randRange(CONFIG.bite.waitMin, CONFIG.bite.waitMax);
  wait *= ctx.bait.biteSpeed;
  wait /= ctx.location.biteMult;
  if (ctx.weather === "cloudy") wait /= CONFIG.weather.cloudyBiteMult;
  if (ctx.zone === "deep") wait *= CONFIG.bite.deepWaitMult;
  return clamp(wait, 2, 25);
}
