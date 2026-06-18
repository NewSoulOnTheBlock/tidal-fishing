// Spawn weighting and fish instance rolls. Pure functions: context in,
// fish instance out.

import { CONFIG } from "../data/config.js";
import { FISH_BY_ID, RARITIES, getTimeSegment, sizeMid } from "../data/fishData.js";
import { clamp, lerp, randRange, weightedPick } from "../utils/utils.js";

/**
 * Picks a species for the current cast.
 * ctx: { location, zone, hours, weather, bait, rareBoost }
 *
 * If the bait carries `rarityOdds` (consumable bait), a TARGET rarity is rolled
 * rarest-first, then clamped into the rarity band the LOCATION offers and
 * snapped to the nearest tier present there. So cheaper bait lands the low end
 * of a location's band while pricier bait reaches its top tier — and a location
 * still bounds what can ever appear (a lake never yields an ocean leviathan, so
 * server-side reachability checks always pass). Falls back to the legacy
 * `bias`-weighted roll when no `rarityOdds` are present.
 */
export function rollSpecies(ctx) {
  const segment = getTimeSegment(ctx.hours);
  const cloudy = ctx.weather === "cloudy";

  // Environment-only weight (zone + time-of-day) — rarity handled separately.
  const envWeight = (entry, ignoreZone) => {
    const [id, base] = entry;
    const sp = FISH_BY_ID[id];
    if (!sp) return 0;
    let w = base;
    if (!sp.zones.includes(ctx.zone)) {
      if (!ignoreZone) return 0;
      w *= 0.2;
    }
    if (!sp.time.includes(segment)) w *= 0.32;
    return w;
  };

  const odds = ctx.bait?.rarityOdds;
  if (odds) {
    // Boost applied to rare+ target odds from weather + jig/feeding spot.
    const rareMult =
      (cloudy ? CONFIG.weather.cloudyRareBoost : 1) *
      (ctx.rareBoost && ctx.rareBoost !== 1 ? ctx.rareBoost : 1);

    // The location bands which rarities exist (lake = common→rare, ocean =
    // mythic→ultramythic, …). Collect the rarity tiers actually present here.
    const presentOrders = new Set();
    for (const e of ctx.location.fishTable) {
      const sp = FISH_BY_ID[e[0]];
      if (sp) presentOrders.add(RARITIES[sp.rarity].order);
    }
    if (presentOrders.size === 0) return FISH_BY_ID[ctx.location.fishTable[0][0]];
    const orders = [...presentOrders].sort((a, b) => a - b);
    const minO = orders[0];
    const maxO = orders[orders.length - 1];

    // Roll a TARGET rarity, rarest tier first; the first tier whose odds beat a
    // random roll wins, otherwise common.
    const ladder = ["ultramythic", "mythic", "legendary", "epic", "rare", "uncommon"];
    let targetOrder = 0; // common
    for (const r of ladder) {
      let chance = odds[r] || 0;
      if (chance <= 0) continue;
      if (RARITIES[r].order >= 2) chance *= rareMult; // amplify rare+ only
      if (Math.random() < chance) {
        targetOrder = RARITIES[r].order;
        break;
      }
    }

    // Clamp the target into the location's band, then snap to the nearest tier
    // that actually exists here: cheaper bait lands the band's low end, pricier
    // bait its high end — without a lake ever coughing up an ocean leviathan.
    targetOrder = Math.max(minO, Math.min(maxO, targetOrder));
    let bestOrder = orders[0];
    let bestDist = Infinity;
    for (const o of orders) {
      const d = Math.abs(o - targetOrder);
      if (d < bestDist) {
        bestDist = d;
        bestOrder = o;
      }
    }

    const pickAtOrder = (ord, ignoreZone) =>
      weightedPick(ctx.location.fishTable, (e) => {
        const sp = FISH_BY_ID[e[0]];
        if (!sp || RARITIES[sp.rarity].order !== ord) return 0;
        return envWeight(e, ignoreZone);
      });

    const entry =
      pickAtOrder(bestOrder, false) ||
      pickAtOrder(bestOrder, true) ||
      weightedPick(ctx.location.fishTable, (e) => envWeight(e, true)) ||
      ctx.location.fishTable[0];
    return FISH_BY_ID[entry[0]];
  }

  // ---- Legacy bias-weighted path (fallback) ----
  const weightFor = (entry, ignoreZone) => {
    const [id] = entry;
    const sp = FISH_BY_ID[id];
    if (!sp) return 0;
    let w = envWeight(entry, ignoreZone);
    if (w <= 0) return 0;
    if (ctx.bait?.bias) w *= ctx.bait.bias[sp.rarity] ?? 1;
    if (cloudy && RARITIES[sp.rarity].order >= 2) w *= CONFIG.weather.cloudyRareBoost;
    if (ctx.rareBoost && ctx.rareBoost !== 1 && RARITIES[sp.rarity].order >= 2) w *= ctx.rareBoost;
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
  const earnMult = CONFIG.economy.earnMultiplier ?? 1;
  const value = sp.fixedValue
    ? Math.max(1, Math.round(sp.baseValue * earnMult))
    : Math.max(1, Math.round(sp.baseValue * (0.45 + 0.55 * Math.pow(sizeCm / mid, 2.2)) * earnMult));
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
  wait *= ctx.bait?.biteSpeed ?? 1;
  wait /= ctx.location.biteMult;
  if (ctx.weather === "cloudy") wait /= CONFIG.weather.cloudyBiteMult;
  if (ctx.zone === "deep") wait *= CONFIG.bite.deepWaitMult;
  // casting into a feeding spot brings bites in much faster
  if (ctx.spotBonus?.biteMult) wait /= ctx.spotBonus.biteMult;
  return clamp(wait, 3, 30);
}
