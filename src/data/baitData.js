// Consumable bait. ONE bait is spent per Pro cast (see economy.consumeBait), so
// bait is the wager chip of Bull Fish Blitz: players buy bait with ETH, cast it,
// then win by selling whatever fish that bait odds table produces.
//
// Hybrid mode:
// - Tiers 1–3 are fast server/provably-fair bait packs for smooth gameplay.
// - Tiers 4–6 are premium Gamba-ready wager tiers for the on-chain chance layer.
//
// Rarity model: every tier carries `rarityOdds`, the per-cast chance to land AT
// LEAST a given rarity. The spawner (fish/spawning.js) rolls these rarest-first
// and the first hit wins; otherwise the catch is common. Location still bounds
// what species can appear, so good bait lifts odds without letting a lake spawn
// an ocean-only leviathan.

import { baitLook } from "./gearLooks.js";

export const BAIT_SETTLEMENT = {
  SERVER: "server-provably-fair",
  GAMBA: "gamba-premium",
};

export const BAIT_RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
  ultramythic: "Ultra Mythic",
};

const odds = (rarity, chance, multiplier, label) => ({ rarity, chance, multiplier, label });

export const BAITS = [
  {
    id: "bait_basic", name: "Basic Grubs", tier: 1,
    solPrice: 0.001, biteSpeed: 1.0,
    settlement: BAIT_SETTLEMENT.SERVER,
    rarityOdds: { uncommon: 0.18, rare: 0.06 },
    wagerOdds: [
      odds("common", 0.76, 0.55, "Small keepers"),
      odds("uncommon", 0.18, 0.9, "Decent bite"),
      odds("rare", 0.06, 1.65, "Rare splash"),
    ],
    blurb: "Low-stakes ETH bait. Mostly commons, with a clean shot at a rare fish.",
    lookIdx: 0,
  },
  {
    id: "bait_fine", name: "Fine Shrimp", tier: 2,
    solPrice: 0.003, biteSpeed: 0.92,
    settlement: BAIT_SETTLEMENT.SERVER,
    rarityOdds: { uncommon: 0.24, rare: 0.12, epic: 0.025 },
    wagerOdds: [
      odds("common", 0.64, 0.45, "Table fish"),
      odds("uncommon", 0.24, 0.8, "Clean keeper"),
      odds("rare", 0.095, 1.45, "Rare hit"),
      odds("epic", 0.025, 3.2, "Epic pull"),
    ],
    blurb: "Second-tier bait with enough scent to bring rare and occasional epic fish in.",
    lookIdx: 3,
  },
  {
    id: "bait_prime", name: "Prime Spinners", tier: 3,
    solPrice: 0.006, biteSpeed: 0.84,
    settlement: BAIT_SETTLEMENT.SERVER,
    rarityOdds: { uncommon: 0.28, rare: 0.18, epic: 0.06, legendary: 0.008 },
    wagerOdds: [
      odds("common", 0.552, 0.35, "Base catch"),
      odds("uncommon", 0.26, 0.75, "Keeper"),
      odds("rare", 0.12, 1.4, "Rare fish"),
      odds("epic", 0.06, 2.8, "Epic run"),
      odds("legendary", 0.008, 8.0, "Legendary spark"),
    ],
    blurb: "The top smooth-play tier: stronger rare odds while still settling fast off-chain.",
    lookIdx: 6,
  },
  {
    id: "bait_exotic", name: "Exotic Lures", tier: 4,
    solPrice: 0.01, biteSpeed: 0.76,
    settlement: BAIT_SETTLEMENT.GAMBA,
    rarityOdds: { uncommon: 0.32, rare: 0.22, epic: 0.10, legendary: 0.025, mythic: 0.003 },
    wagerOdds: [
      odds("common", 0.437, 0.2, "Burned cast"),
      odds("uncommon", 0.26, 0.65, "Keeper"),
      odds("rare", 0.175, 1.2, "Rare strike"),
      odds("epic", 0.10, 2.4, "Epic fish"),
      odds("legendary", 0.025, 6.5, "Legendary hit"),
      odds("mythic", 0.003, 18, "Mythic flash"),
    ],
    blurb: "Hybrid premium bait. Gamba-ready odds with a real mythic tail risk.",
    lookIdx: 10,
  },
  {
    id: "bait_mythic", name: "Mythic Chum", tier: 5,
    solPrice: 0.015, biteSpeed: 0.68,
    settlement: BAIT_SETTLEMENT.GAMBA,
    rarityOdds: { uncommon: 0.34, rare: 0.25, epic: 0.14, legendary: 0.05, mythic: 0.012, ultramythic: 0.002 },
    wagerOdds: [
      odds("common", 0.386, 0.1, "Dead water"),
      odds("uncommon", 0.24, 0.55, "Keeper"),
      odds("rare", 0.17, 1.05, "Rare run"),
      odds("epic", 0.14, 2.1, "Epic pull"),
      odds("legendary", 0.05, 3.6, "Legendary surge"),
      odds("mythic", 0.012, 9, "Mythic bite"),
      odds("ultramythic", 0.002, 30, "Ultra jackpot"),
    ],
    blurb: "High-volatility bait for mythic hunters. Bigger misses, bigger fish.",
    lookIdx: 14,
  },
  {
    id: "bait_celestial", name: "Celestial Essence", tier: 6,
    solPrice: 0.025, biteSpeed: 0.6,
    settlement: BAIT_SETTLEMENT.GAMBA,
    rarityOdds: { uncommon: 0.36, rare: 0.28, epic: 0.18, legendary: 0.075, mythic: 0.025, ultramythic: 0.006 },
    wagerOdds: [
      odds("common", 0.339, 0, "No bite / bust"),
      odds("uncommon", 0.21, 0.34, "Keeper"),
      odds("rare", 0.165, 0.76, "Rare fish"),
      odds("epic", 0.18, 1.4, "Epic catch"),
      odds("legendary", 0.075, 3, "Legendary fish"),
      odds("mythic", 0.025, 7, "Mythic beast"),
      odds("ultramythic", 0.006, 24, "Celestial jackpot"),
    ],
    blurb: "The VIP high-roller bait. Built for Gamba-settled jackpot casts.",
    lookIdx: 18,
  },
];

// Attach a distinct cosmetic look (drives the floating bobber/lure in 3D).
for (const b of BAITS) b.look = baitLook(b.lookIdx);

export const BAIT_BY_ID = Object.fromEntries(BAITS.map((b) => [b.id, b]));
export const DEFAULT_BAIT_ID = BAITS[0].id;

/** Bait the player is gifted on a fresh save. 0 = no starter bait; wagering-mode
 * players must buy bait before they can cast. */
export const STARTER_BAIT_QTY = 0;

export function baitSettlementLabel(b) {
  return b?.settlement === BAIT_SETTLEMENT.GAMBA
    ? "Hybrid: Gamba premium cast"
    : "Hybrid: server/provably-fair pack";
}

export function baitExpectedMultiplier(b) {
  return (b?.wagerOdds || []).reduce((sum, o) => sum + o.chance * o.multiplier, 0);
}

export function baitRtpLabel(b) {
  return `${Math.round(baitExpectedMultiplier(b) * 1000) / 10}% RTP target`;
}

export function baitOddsLines(b) {
  return (b?.wagerOdds || []).map((o) => {
    const rarity = BAIT_RARITY_LABELS[o.rarity] || o.rarity;
    const chance = `${Math.round(o.chance * 1000) / 10}%`;
    const mult = `${o.multiplier}×`;
    return `${rarity} ${chance} · ${mult}`;
  });
}

/** Per-bait stat lines for the shop UI. */
export function baitStatLines(b) {
  const rareOdds = Object.entries(b.rarityOdds)
    .map(([k, v]) => `${BAIT_RARITY_LABELS[k] || k} ${Math.round(v * 1000) / 10}%`)
    .join(" · ");
  const bite = b.biteSpeed === 1 ? "normal" : `+${Math.round((1 - b.biteSpeed) * 100)}% faster bites`;
  return [
    baitSettlementLabel(b),
    `ETH wager ${b.solPrice} per bait`,
    baitRtpLabel(b),
    `Bite speed ${bite}`,
    `Rare ladder: ${rareOdds}`,
    `Payout odds: ${baitOddsLines(b).join(" · ")}`,
  ];
}
