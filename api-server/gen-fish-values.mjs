// Generates fishValues.json — the server-side source of truth for the MAXIMUM
// plausible $TIDE value of a single catch per species. The server clamps every
// client-reported catch value to this ceiling so a tampered client cannot mint
// withdrawable $TIDE out of thin air.
//
// Mirrors the exact value formula in src/fish/spawning.js (rollFish):
//   fixedValue: round(baseValue * earnMult)
//   else:       round(baseValue * (0.45 + 0.55 * (size/mid)^2.2) * earnMult)
// evaluated at the largest possible size (maxS) for the ceiling.
//
// Re-run after editing fish data:  node gen-fish-values.mjs
import { FISH_SPECIES, sizeMid } from "../src/data/fishData.js";
import { CONFIG } from "../src/data/config.js";
import { writeFileSync } from "node:fs";

const earnMult = CONFIG.economy.earnMultiplier ?? 1;
const species = {};

for (const sp of FISH_SPECIES) {
  const [, maxS] = sp.sizeCm;
  const mid = sizeMid(sp);
  let maxValue;
  if (sp.fixedValue) {
    maxValue = Math.max(1, Math.round(sp.baseValue * earnMult));
  } else {
    const factor = 0.45 + 0.55 * Math.pow(maxS / mid, 2.2);
    maxValue = Math.max(1, Math.round(sp.baseValue * factor * earnMult));
  }
  species[sp.id] = { max: maxValue, jackpot: !!sp.jackpot, rarity: sp.rarity };
}

const out = { generatedAt: new Date().toISOString(), earnMult, species };
writeFileSync(new URL("./fishValues.json", import.meta.url), JSON.stringify(out));
console.log(`Wrote fishValues.json — ${Object.keys(species).length} species, earnMult=${earnMult}`);
