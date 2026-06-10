// Gear catalog. Four categories, four tiers each. Tier 0 is starting gear.
//
// rods:  castMult  -> multiplies max cast distance
//        control   -> tames surge tension spikes during the fight
// reels: speed     -> multiplies reel-in (catch progress) rate
// lines: strength  -> divides tension gain (effectively a higher snap threshold)
// baits: biteSpeed -> multiplies bite wait time (lower = faster bites)
//        bias      -> per-rarity spawn weight multipliers

export const GEAR = {
  rods: [
    { id: "rod_0", name: "Bamboo Rod", tier: 1, price: 0, level: 1, castMult: 1.0, control: 1.0, blurb: "Grandpa's hand-me-down. It works. Mostly." },
    { id: "rod_1", name: "Fiberglass Rod", tier: 2, price: 180, level: 2, castMult: 1.25, control: 1.15, blurb: "Springy and forgiving — casts a third farther." },
    { id: "rod_2", name: "Carbon Pro Rod", tier: 3, price: 950, level: 5, castMult: 1.55, control: 1.35, blurb: "Featherweight carbon. Deep water is suddenly in range." },
    { id: "rod_3", name: "Titan Master Rod", tier: 4, price: 4200, level: 9, castMult: 1.9, control: 1.6, blurb: "Tournament hardware. Surges feel like ripples." },
  ],
  reels: [
    { id: "reel_0", name: "Rusty Reel", tier: 1, price: 0, level: 1, speed: 1.0, blurb: "Squeaks with every crank. Adds character." },
    { id: "reel_1", name: "Standard Reel", tier: 2, price: 150, level: 2, speed: 1.25, blurb: "Smooth bearings, honest gearing." },
    { id: "reel_2", name: "SmoothDrag Reel", tier: 3, price: 800, level: 4, speed: 1.55, blurb: "Sealed drag system reels in noticeably faster." },
    { id: "reel_3", name: "Hydra Power Reel", tier: 4, price: 3600, level: 8, speed: 1.95, blurb: "Twin-crank monster. Line comes home in a hurry." },
  ],
  lines: [
    { id: "line_0", name: "Old Twine", tier: 1, price: 0, level: 1, strength: 1.0, blurb: "Snaps if a fish sneezes. Upgrade soon." },
    { id: "line_1", name: "Mono Line", tier: 2, price: 120, level: 2, strength: 1.3, blurb: "Proper monofilament with real stretch." },
    { id: "line_2", name: "Braided Line", tier: 3, price: 700, level: 4, strength: 1.65, blurb: "Woven strands shrug off heavy tension." },
    { id: "line_3", name: "Steelweave Line", tier: 4, price: 3200, level: 8, strength: 2.1, blurb: "Practically a cable. Legendary-rated." },
  ],
  baits: [
    {
      id: "bait_0", name: "Garden Worms", tier: 1, price: 0, level: 1, biteSpeed: 1.0,
      bias: { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 },
      blurb: "Free, wiggly, universally appreciated.",
    },
    {
      id: "bait_1", name: "Fresh Shrimp", tier: 2, price: 200, level: 3, biteSpeed: 0.88,
      bias: { common: 1, uncommon: 1.5, rare: 1.25, epic: 1, legendary: 1 },
      blurb: "Pickier fish take notice. Slightly faster bites.",
    },
    {
      id: "bait_2", name: "Spinner Lure", tier: 3, price: 900, level: 6, biteSpeed: 0.8,
      bias: { common: 0.9, uncommon: 1.1, rare: 1.8, epic: 1.5, legendary: 1.2 },
      blurb: "Flash and flutter that rare hunters can't ignore.",
    },
    {
      id: "bait_3", name: "Glowmax Lure", tier: 4, price: 3800, level: 9, biteSpeed: 0.72,
      bias: { common: 0.75, uncommon: 1, rare: 1.5, epic: 2.1, legendary: 2.6 },
      blurb: "Bioluminescent legend-caller. Trophy fish only look up.",
    },
  ],
};

export const GEAR_CATS = [
  { key: "rods", label: "Rods", equipKey: "rods" },
  { key: "reels", label: "Reels", equipKey: "reels" },
  { key: "lines", label: "Lines", equipKey: "lines" },
  { key: "baits", label: "Bait", equipKey: "baits" },
];

export function gearStatLines(catKey, item) {
  switch (catKey) {
    case "rods":
      return [`Cast distance ×${item.castMult.toFixed(2)}`, `Fight control ×${item.control.toFixed(2)}`];
    case "reels":
      return [`Reel speed ×${item.speed.toFixed(2)}`];
    case "lines":
      return [`Line strength ×${item.strength.toFixed(2)}`];
    case "baits": {
      const biasBits = Object.entries(item.bias)
        .filter(([, v]) => v !== 1)
        .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ×${v}`);
      return [
        `Bite speed ${item.biteSpeed === 1 ? "normal" : `+${Math.round((1 - item.biteSpeed) * 100)}%`}`,
        biasBits.length ? biasBits.join(", ") : "No rarity bias",
      ];
    }
    default:
      return [];
  }
}
