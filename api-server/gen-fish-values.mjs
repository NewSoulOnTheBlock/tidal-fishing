// Generates fishValues.json — the server-side source of truth the catch
// endpoint trusts. For every species it records:
//   max     : the MAXIMUM plausible $TIDE value of a single catch (value clamp)
//   rarity  : authoritative rarity (the server ignores the client-sent rarity)
//   jackpot : auto-credit flag
//   sizeMin : smallest legal size in cm (size/weight clamp + record integrity)
//   sizeMax : largest legal size in cm
//   spawn   : { location: weight } — the ONLY locations where this species can
//             legitimately be caught, taken straight from the per-location
//             fishTable the client rolls against. A species absent from every
//             fishTable gets an empty spawn map and is therefore UNREACHABLE:
//             the server rejects any claimed catch of it. This is what stops a
//             tampered client from POSTing high-value "fantasy" legendaries
//             (moonfish, blackholefish, …) that normal play can never roll.
//
// Mirrors the exact value formula in src/fish/spawning.js (rollFish):
//   fixedValue: round(baseValue * earnMult)
//   else:       round(baseValue * (0.45 + 0.55 * (size/mid)^2.2) * earnMult)
// evaluated at the largest possible size (maxS) for the ceiling.
//
// Re-run after editing fish or location data:  node gen-fish-values.mjs
import { FISH_SPECIES, sizeMid } from "../src/data/fishData.js";
import { LOCATIONS } from "../src/data/locationData.js";
import { CONFIG } from "../src/data/config.js";
import { writeFileSync } from "node:fs";

const earnMult = CONFIG.economy.earnMultiplier ?? 1;

// Build the reachability map from the live spawn tables: species id -> { loc: weight }.
const spawnBySpecies = {};
for (const loc of LOCATIONS) {
  for (const [id, weight] of loc.fishTable || []) {
    (spawnBySpecies[id] ||= {})[loc.id] = weight;
  }
}

const species = {};

for (const sp of FISH_SPECIES) {
  const [minS, maxS] = sp.sizeCm;
  const mid = sizeMid(sp);
  let maxValue;
  if (sp.fixedValue) {
    maxValue = Math.max(1, Math.round(sp.baseValue * earnMult));
  } else {
    const factor = 0.45 + 0.55 * Math.pow(maxS / mid, 2.2);
    maxValue = Math.max(1, Math.round(sp.baseValue * factor * earnMult));
  }
  // Largest legitimate weight: the rollFish weight formula evaluated at maxS.
  const weightMax = Math.max(0.01, sp.weightMidKg * Math.pow(maxS / mid, 2.9));
  species[sp.id] = {
    max: maxValue,
    jackpot: !!sp.jackpot,
    rarity: sp.rarity,
    sizeMin: minS,
    sizeMax: maxS,
    weightMax: Math.round(weightMax * 100) / 100,
    spawn: spawnBySpecies[sp.id] || {},
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  earnMult,
  locations: LOCATIONS.map((l) => l.id),
  species,
};
writeFileSync(new URL("./fishValues.json", import.meta.url), JSON.stringify(out));

const reachable = Object.values(species).filter((s) => Object.keys(s.spawn).length).length;
const unreachable = Object.keys(species).length - reachable;
console.log(
  `Wrote fishValues.json — ${Object.keys(species).length} species ` +
    `(${reachable} reachable, ${unreachable} unreachable), earnMult=${earnMult}`
);
