// Consumable bait. ONE bait is spent per cast (see economy.consumeBait), so bait
// is the core money sink of the loop. Each tier carries TWO independent prices:
//   - `solPrice`: the real on-chain SOL cost (kept low; cheapest is 0.001 each).
//   - `tidePrice`: a FIXED in-game $TIDE cost on a fishing-earnings scale, so the
//     game stays playable with currency the player earns. This is intentionally
//     NOT derived from the live SOL value — anchoring it to the real token's
//     market price made bait cost tens of thousands of earned $TIDE and priced
//     f2p players out of the core loop entirely.
//
// Rarity model: every tier carries `rarityOdds`, the per-cast chance to land
// AT LEAST a given rarity. The spawner (fish/spawning.js) rolls these
// rarest-first and the first hit wins; otherwise the catch is common. Pricier
// bait shifts those odds up across the board. Location still bounds which
// species actually exist, so good bait lifts your odds without letting a lake
// suddenly cough up an ocean leviathan.

import { baitLook } from "./gearLooks.js";

export const BAITS = [
  {
    id: "bait_basic", name: "Basic Grubs", tier: 1,
    solPrice: 0.001, tidePrice: 400, biteSpeed: 1.0,
    rarityOdds: { uncommon: 0.20, rare: 0.10 },
    blurb: "A cup of wrigglers. Mostly commons — the odd uncommon or rare slips through.",
    lookIdx: 0,
  },
  {
    id: "bait_fine", name: "Fine Shrimp", tier: 2,
    solPrice: 0.003, tidePrice: 1200, biteSpeed: 0.92,
    rarityOdds: { uncommon: 0.28, rare: 0.15, epic: 0.05 },
    blurb: "Fresh shrimp the pickier fish notice. A real shot at epics.",
    lookIdx: 3,
  },
  {
    id: "bait_prime", name: "Prime Spinners", tier: 3,
    solPrice: 0.006, tidePrice: 2400, biteSpeed: 0.84,
    rarityOdds: { uncommon: 0.34, rare: 0.21, epic: 0.10, legendary: 0.02 },
    blurb: "Flash and flutter that rare hunters can't ignore. Legendaries start to circle.",
    lookIdx: 6,
  },
  {
    id: "bait_exotic", name: "Exotic Lures", tier: 4,
    solPrice: 0.01, tidePrice: 4000, biteSpeed: 0.76,
    rarityOdds: { uncommon: 0.40, rare: 0.27, epic: 0.16, legendary: 0.05, mythic: 0.012 },
    blurb: "Bioluminescent trophy-callers. Even myths take a peek.",
    lookIdx: 10,
  },
  {
    id: "bait_mythic", name: "Mythic Chum", tier: 5,
    solPrice: 0.015, tidePrice: 6500, biteSpeed: 0.68,
    rarityOdds: { uncommon: 0.46, rare: 0.33, epic: 0.22, legendary: 0.10, mythic: 0.03, ultramythic: 0.006 },
    blurb: "A forbidden recipe. Ultra-myths get curious.",
    lookIdx: 14,
  },
  {
    id: "bait_celestial", name: "Celestial Essence", tier: 6,
    solPrice: 0.025, tidePrice: 11000, biteSpeed: 0.6,
    rarityOdds: { uncommon: 0.52, rare: 0.40, epic: 0.28, legendary: 0.15, mythic: 0.06, ultramythic: 0.015 },
    blurb: "A pinch of captured starlight. The deep's rarest answer the call.",
    lookIdx: 18,
  },
];

// Attach a distinct cosmetic look (drives the floating bobber/lure in 3D).
for (const b of BAITS) b.look = baitLook(b.lookIdx);

export const BAIT_BY_ID = Object.fromEntries(BAITS.map((b) => [b.id, b]));
export const DEFAULT_BAIT_ID = BAITS[0].id;

/** Bait the player is gifted on a fresh save. 0 = no starter bait; every player
 *  must buy bait before they can cast — affordable with the starter $TIDE grant
 *  (see config.economy.startMoney) or with SOL. */
export const STARTER_BAIT_QTY = 0;

/** Per-bait stat lines for the shop UI. */
export function baitStatLines(b) {
  const odds = Object.entries(b.rarityOdds)
    .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${Math.round(v * 100)}%`)
    .join(" · ");
  const bite = b.biteSpeed === 1 ? "normal" : `+${Math.round((1 - b.biteSpeed) * 100)}% faster bites`;
  return [`Bite speed ${bite}`, odds];
}
