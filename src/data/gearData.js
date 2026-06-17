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
    { id: "rod_1", name: "Fiberglass Rod", tier: 2, price: 185185, level: 2, castMult: 1.25, control: 1.15, blurb: "Springy and forgiving — casts a third farther." },
    { id: "rod_2", name: "Carbon Pro Rod", tier: 3, price: 370370, level: 5, castMult: 1.55, control: 1.35, blurb: "Featherweight carbon. Deep water is suddenly in range." },
    { id: "rod_3", name: "Titan Master Rod", tier: 4, price: 555556, level: 9, castMult: 1.9, control: 1.6, blurb: "Tournament hardware. Surges feel like ripples." },
    { id: "rod_4", name: "Apex Thunder Rod", tier: 5, price: 740741, level: 12, castMult: 2.15, control: 1.85, blurb: "Lightning-fast response. Deep casts feel effortless." },
    { id: "rod_5", name: "Storm Chaser Rod", tier: 6, price: 925926, level: 15, castMult: 2.45, control: 2.1, blurb: "Built for rough weather. Tames the wildest fish." },
    { id: "rod_6", name: "Typhoon Elite Rod", tier: 7, price: 1111111, level: 18, castMult: 2.75, control: 2.4, blurb: "Competition-grade construction. Casts to the horizon." },
    { id: "rod_7", name: "Quantum Flex Rod", tier: 8, price: 1296296, level: 21, castMult: 3.1, control: 2.7, blurb: "Aerospace materials. Bends impossibly without breaking." },
    { id: "rod_8", name: "Leviathan Rod", tier: 9, price: 1481481, level: 24, castMult: 3.5, control: 3.0, blurb: "Designed for sea monsters. Nothing else compares." },
    { id: "rod_9", name: "Celestial Rod", tier: 10, price: 1666667, level: 27, castMult: 3.9, control: 3.4, blurb: "Blessed by the tides. Fish surrender willingly." },
    { id: "rod_10", name: "Mythril Rod", tier: 11, price: 1851852, level: 30, castMult: 4.3, control: 3.8, blurb: "Forged from starfall metal. Impossibly light, unbreakable." },
    { id: "rod_11", name: "Dragon's Reach Rod", tier: 12, price: 2037037, level: 33, castMult: 4.75, control: 4.2, blurb: "Carved from ancient bone. Legends whisper its name." },
    { id: "rod_12", name: "Void Caller Rod", tier: 13, price: 2222222, level: 36, castMult: 5.2, control: 4.7, blurb: "Draws fish from the abyss itself." },
    { id: "rod_13", name: "Infinity Rod", tier: 14, price: 2407407, level: 39, castMult: 5.7, control: 5.2, blurb: "Transcends physics. Reality bends around it." },
    { id: "rod_14", name: "God's Hand Rod", tier: 15, price: 2592593, level: 42, castMult: 6.3, control: 5.8, blurb: "Crafted by deities. Fish have no choice but to bite." },
    { id: "rod_15", name: "Omega Rod", tier: 16, price: 2777778, level: 45, castMult: 7.0, control: 6.5, blurb: "The final rod. Nothing left to desire." },
    { id: "rod_16", name: "Eternal Tide Rod", tier: 17, price: 2962963, level: 48, castMult: 7.8, control: 7.2, blurb: "Flows with the ocean's heartbeat." },
    { id: "rod_17", name: "Singularity Rod", tier: 18, price: 3148148, level: 51, castMult: 8.7, control: 8.0, blurb: "Warps space. Casts reach other dimensions." },
    { id: "rod_18", name: "Neptune's Wrath", tier: 19, price: 3333333, level: 55, castMult: 10.0, control: 9.0, blurb: "The sea god's personal weapon. Perfection incarnate." },
  ],
  reels: [
    { id: "reel_0", name: "Rusty Reel", tier: 1, price: 0, level: 1, speed: 1.0, blurb: "Squeaks with every crank. Adds character." },
    { id: "reel_1", name: "Standard Reel", tier: 2, price: 185185, level: 2, speed: 1.25, blurb: "Smooth bearings, honest gearing." },
    { id: "reel_2", name: "SmoothDrag Reel", tier: 3, price: 370370, level: 4, speed: 1.55, blurb: "Sealed drag system reels in noticeably faster." },
    { id: "reel_3", name: "Hydra Power Reel", tier: 4, price: 555556, level: 8, speed: 1.95, blurb: "Twin-crank monster. Line comes home in a hurry." },
    { id: "reel_4", name: "Velocity Reel", tier: 5, price: 740741, level: 12, speed: 2.3, blurb: "High-speed gearing. Fish don't stand a chance." },
    { id: "reel_5", name: "Tornado Reel", tier: 6, price: 925926, level: 15, speed: 2.7, blurb: "Cyclone mechanism. Retrieves like a hurricane." },
    { id: "reel_6", name: "Lightning Reel", tier: 7, price: 1111111, level: 18, speed: 3.1, blurb: "Electric-assist motor. Fights feel like play." },
    { id: "reel_7", name: "Thunder Reel", tier: 8, price: 1296296, level: 21, speed: 3.6, blurb: "Dual-motor beast. Line screams home." },
    { id: "reel_8", name: "Maelstrom Reel", tier: 9, price: 1481481, level: 24, speed: 4.1, blurb: "Magnetic levitation. Zero friction." },
    { id: "reel_9", name: "Nova Reel", tier: 10, price: 1666667, level: 27, speed: 4.7, blurb: "Stellar engineering. Pulls stars from the sky." },
    { id: "reel_10", name: "Cosmic Reel", tier: 11, price: 1851852, level: 30, speed: 5.3, blurb: "Gravity well technology. Fish teleport to you." },
    { id: "reel_11", name: "Quantum Reel", tier: 12, price: 2037037, level: 33, speed: 6.0, blurb: "Entanglement mechanics. Instant retrieval." },
    { id: "reel_12", name: "Supernova Reel", tier: 13, price: 2222222, level: 36, speed: 6.8, blurb: "Nuclear-powered. Unstoppable force." },
    { id: "reel_13", name: "Galaxy Reel", tier: 14, price: 2407407, level: 39, speed: 7.7, blurb: "Dimensional folding. Space means nothing." },
    { id: "reel_14", name: "Universe Reel", tier: 15, price: 2592593, level: 42, speed: 8.7, blurb: "Reality itself reels for you." },
    { id: "reel_15", name: "Infinity Reel", tier: 16, price: 2777778, level: 45, speed: 10.0, blurb: "Infinite speed. Fish arrive before they bite." },
    { id: "reel_16", name: "Eternal Reel", tier: 17, price: 2962963, level: 48, speed: 11.5, blurb: "Time-warp mechanism. Past fish, present catch." },
    { id: "reel_17", name: "Void Reel", tier: 18, price: 3148148, level: 51, speed: 13.5, blurb: "Erases distance. Fish simply appear." },
    { id: "reel_18", name: "Poseidon's Wheel", tier: 19, price: 3333333, level: 55, speed: 16.0, blurb: "The ocean god's personal reel. Perfection." },
  ],
  lines: [
    { id: "line_0", name: "Old Twine", tier: 1, price: 0, level: 1, strength: 1.0, blurb: "Snaps if a fish sneezes. Upgrade soon." },
    { id: "line_1", name: "Mono Line", tier: 2, price: 185185, level: 2, strength: 1.3, blurb: "Proper monofilament with real stretch." },
    { id: "line_2", name: "Braided Line", tier: 3, price: 370370, level: 4, strength: 1.65, blurb: "Woven strands shrug off heavy tension." },
    { id: "line_3", name: "Steelweave Line", tier: 4, price: 555556, level: 8, strength: 2.1, blurb: "Practically a cable. Legendary-rated." },
    { id: "line_4", name: "Titanium Line", tier: 5, price: 740741, level: 12, strength: 2.6, blurb: "Military-grade alloy. Monsters can't break it." },
    { id: "line_5", name: "Diamond Thread", tier: 6, price: 925926, level: 15, strength: 3.1, blurb: "Crystal-woven fibers. Sharper than teeth." },
    { id: "line_6", name: "Mithril Line", tier: 7, price: 1111111, level: 18, strength: 3.7, blurb: "Dwarven smithing. Light as air, strong as mountains." },
    { id: "line_7", name: "Adamantium Line", tier: 8, price: 1296296, level: 21, strength: 4.3, blurb: "Unbreakable by mortal means." },
    { id: "line_8", name: "Dragon Scale Line", tier: 9, price: 1481481, level: 24, strength: 5.0, blurb: "Shed scales from ancient wyrms." },
    { id: "line_9", name: "Phoenix Feather Line", tier: 10, price: 1666667, level: 27, strength: 5.8, blurb: "Self-repairing. Burns with eternal strength." },
    { id: "line_10", name: "Starlight Line", tier: 11, price: 1851852, level: 30, strength: 6.7, blurb: "Woven from captured starlight." },
    { id: "line_11", name: "Moonbeam Line", tier: 12, price: 2037037, level: 33, strength: 7.7, blurb: "Lunar essence solidified. Ethereal strength." },
    { id: "line_12", name: "Solar Flare Line", tier: 13, price: 2222222, level: 36, strength: 8.8, blurb: "Plasma contained. Burns anything that touches." },
    { id: "line_13", name: "Cosmic String", tier: 14, price: 2407407, level: 39, strength: 10.0, blurb: "Literal fabric of spacetime." },
    { id: "line_14", name: "Reality Thread", tier: 15, price: 2592593, level: 42, strength: 11.5, blurb: "Holds existence together." },
    { id: "line_15", name: "Infinity Line", tier: 16, price: 2777778, level: 45, strength: 13.5, blurb: "Limitless tensile strength." },
    { id: "line_16", name: "Eternity Line", tier: 17, price: 2962963, level: 48, strength: 16.0, blurb: "Unbreakable across all timelines." },
    { id: "line_17", name: "Void Strand", tier: 18, price: 3148148, level: 51, strength: 19.0, blurb: "Nothingness given form. Cannot break what doesn't exist." },
    { id: "line_18", name: "Leviathan Chain", tier: 19, price: 3333333, level: 55, strength: 23.0, blurb: "Bound Leviathan himself. Unbeatable." },
  ],
  baits: [
    {
      id: "bait_0", name: "Garden Worms", tier: 1, price: 0, level: 1, biteSpeed: 1.0,
      bias: { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 },
      blurb: "Free, wiggly, universally appreciated.",
    },
    {
      id: "bait_1", name: "Fresh Shrimp", tier: 2, price: 185185, level: 3, biteSpeed: 0.88,
      bias: { common: 1, uncommon: 1.5, rare: 1.25, epic: 1, legendary: 1 },
      blurb: "Pickier fish take notice. Slightly faster bites.",
    },
    {
      id: "bait_2", name: "Spinner Lure", tier: 3, price: 370370, level: 6, biteSpeed: 0.8,
      bias: { common: 0.9, uncommon: 1.1, rare: 1.8, epic: 1.5, legendary: 1.2 },
      blurb: "Flash and flutter that rare hunters can't ignore.",
    },
    {
      id: "bait_3", name: "Glowmax Lure", tier: 4, price: 555556, level: 9, biteSpeed: 0.72,
      bias: { common: 0.75, uncommon: 1, rare: 1.5, epic: 2.1, legendary: 2.6 },
      blurb: "Bioluminescent legend-caller. Trophy fish only look up.",
    },
    {
      id: "bait_4", name: "Electric Eel", tier: 5, price: 740741, level: 12, biteSpeed: 0.66,
      bias: { common: 0.7, uncommon: 0.9, rare: 1.7, epic: 2.4, legendary: 3.0 },
      blurb: "Shocking attraction. Big fish can't resist.",
    },
    {
      id: "bait_5", name: "Golden Cricket", tier: 6, price: 925926, level: 15, biteSpeed: 0.61,
      bias: { common: 0.6, uncommon: 0.8, rare: 2.0, epic: 2.8, legendary: 3.5 },
      blurb: "Rare insect. Trophy hunters go wild.",
    },
    {
      id: "bait_6", name: "Dragon Scale Bait", tier: 7, price: 1111111, level: 18, biteSpeed: 0.57,
      bias: { common: 0.5, uncommon: 0.7, rare: 2.2, epic: 3.2, legendary: 4.0 },
      blurb: "Ancient power. Legends can't ignore it.",
    },
    {
      id: "bait_7", name: "Mermaid's Tear", tier: 8, price: 1296296, level: 21, biteSpeed: 0.53,
      bias: { common: 0.4, uncommon: 0.6, rare: 2.4, epic: 3.6, legendary: 4.6 },
      blurb: "Oceanic magic. Epic fish flock.",
    },
    {
      id: "bait_8", name: "Phoenix Feather Fly", tier: 9, price: 1481481, level: 24, biteSpeed: 0.5,
      bias: { common: 0.3, uncommon: 0.5, rare: 2.6, epic: 4.0, legendary: 5.2 },
      blurb: "Eternal flame. Draws myths from the deep.",
    },
    {
      id: "bait_9", name: "Starlight Minnow", tier: 10, price: 1666667, level: 27, biteSpeed: 0.47,
      bias: { common: 0.2, uncommon: 0.4, rare: 2.8, epic: 4.5, legendary: 6.0 },
      blurb: "Cosmic bait. Gods themselves take notice.",
    },
    {
      id: "bait_10", name: "Void Essence", tier: 11, price: 1851852, level: 30, biteSpeed: 0.44,
      bias: { common: 0.15, uncommon: 0.3, rare: 3.0, epic: 5.0, legendary: 6.8 },
      blurb: "Pure nothingness. Irresistible to legends.",
    },
    {
      id: "bait_11", name: "Time Crystal", tier: 12, price: 2037037, level: 33, biteSpeed: 0.42,
      bias: { common: 0.1, uncommon: 0.25, rare: 3.2, epic: 5.6, legendary: 7.7 },
      blurb: "Frozen moment. Fish from all eras bite.",
    },
    {
      id: "bait_12", name: "Chaos Orb", tier: 13, price: 2222222, level: 36, biteSpeed: 0.4,
      bias: { common: 0.08, uncommon: 0.2, rare: 3.5, epic: 6.2, legendary: 8.7 },
      blurb: "Unpredictable power. Only legends dare.",
    },
    {
      id: "bait_13", name: "Divine Ambrosia", tier: 14, price: 2407407, level: 39, biteSpeed: 0.38,
      bias: { common: 0.05, uncommon: 0.15, rare: 3.8, epic: 7.0, legendary: 10.0 },
      blurb: "Food of gods. Mortals can't comprehend.",
    },
    {
      id: "bait_14", name: "Reality Shard", tier: 15, price: 2592593, level: 42, biteSpeed: 0.36,
      bias: { common: 0.03, uncommon: 0.1, rare: 4.2, epic: 7.8, legendary: 11.5 },
      blurb: "Piece of existence. Fish or be fished.",
    },
    {
      id: "bait_15", name: "Infinity Bait", tier: 16, price: 2777778, level: 45, biteSpeed: 0.34,
      bias: { common: 0.02, uncommon: 0.08, rare: 4.6, epic: 8.7, legendary: 13.2 },
      blurb: "Endless possibility. Legendary guaranteed.",
    },
    {
      id: "bait_16", name: "Eternal Soul", tier: 17, price: 2962963, level: 48, biteSpeed: 0.32,
      bias: { common: 0.01, uncommon: 0.05, rare: 5.0, epic: 9.7, legendary: 15.0 },
      blurb: "Life itself. Myths serve themselves up.",
    },
    {
      id: "bait_17", name: "Cosmic Heart", tier: 18, price: 3148148, level: 51, biteSpeed: 0.3,
      bias: { common: 0.005, uncommon: 0.03, rare: 5.5, epic: 11.0, legendary: 17.5 },
      blurb: "Universe's pulse. Creation bites.",
    },
    {
      id: "bait_18", name: "Leviathan Blood", tier: 19, price: 3333333, level: 55, biteSpeed: 0.28,
      bias: { common: 0.001, uncommon: 0.01, rare: 6.0, epic: 12.5, legendary: 20.0 },
      blurb: "Sea god's essence. Only legends exist now.",
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
