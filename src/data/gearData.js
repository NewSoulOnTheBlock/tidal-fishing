// Gear catalog. Three upgradeable categories, each with tiers. Tier 0 is the
// free starter gear. (Bait is no longer permanent gear — it's a per-cast
// consumable; see data/baitData.js.)
//
// rods:  castMult  -> multiplies max cast distance
//        control   -> tames surge tension spikes during the fight
// reels: speed     -> multiplies reel-in (catch progress) rate
// lines: strength  -> divides tension gain (effectively a higher snap threshold)
//
// Every item also carries a cosmetic `look` (colour + shape variant) attached
// below from gearLooks.js, so equipping gear visibly changes the rod, reel and
// line in the 3D rig.

import { gearLook } from "./gearLooks.js";

export const GEAR = {
  rods: [
    { id: "rod_0", name: "Bamboo Rod", tier: 1, price: 0, level: 1, castMult: 1.0, control: 1.0, blurb: "Grandpa's hand-me-down. It works. Mostly." },
    { id: "rod_1", name: "Fiberglass Rod", tier: 2, price: 17647, level: 2, castMult: 1.25, control: 1.15, blurb: "Springy and forgiving — casts a third farther." },
    { id: "rod_2", name: "Carbon Pro Rod", tier: 3, price: 35294, level: 5, castMult: 1.55, control: 1.35, blurb: "Featherweight carbon. Deep water is suddenly in range." },
    { id: "rod_3", name: "Titan Master Rod", tier: 4, price: 52941, level: 9, castMult: 1.9, control: 1.6, blurb: "Pro-grade hardware. Surges feel like ripples." },
    { id: "rod_4", name: "Apex Thunder Rod", tier: 5, price: 70588, level: 12, castMult: 2.15, control: 1.85, blurb: "Lightning-fast response. Deep casts feel effortless." },
    { id: "rod_5", name: "Storm Chaser Rod", tier: 6, price: 88235, level: 15, castMult: 2.45, control: 2.1, blurb: "Built for rough weather. Tames the wildest fish." },
    { id: "rod_6", name: "Typhoon Elite Rod", tier: 7, price: 105882, level: 18, castMult: 2.75, control: 2.4, blurb: "Competition-grade construction. Casts to the horizon." },
    { id: "rod_7", name: "Quantum Flex Rod", tier: 8, price: 123529, level: 21, castMult: 3.1, control: 2.7, blurb: "Aerospace materials. Bends impossibly without breaking." },
    { id: "rod_8", name: "Leviathan Rod", tier: 9, price: 141176, level: 24, castMult: 3.5, control: 3.0, blurb: "Designed for sea monsters. Nothing else compares." },
    { id: "rod_9", name: "Celestial Rod", tier: 10, price: 158824, level: 27, castMult: 3.9, control: 3.4, blurb: "Blessed by the tides. Fish surrender willingly." },
    { id: "rod_10", name: "Mythril Rod", tier: 11, price: 176471, level: 30, castMult: 4.3, control: 3.8, blurb: "Forged from starfall metal. Impossibly light, unbreakable." },
    { id: "rod_11", name: "Dragon's Reach Rod", tier: 12, price: 194118, level: 33, castMult: 4.75, control: 4.2, blurb: "Carved from ancient bone. Legends whisper its name." },
    { id: "rod_12", name: "Void Caller Rod", tier: 13, price: 211765, level: 36, castMult: 5.2, control: 4.7, blurb: "Draws fish from the abyss itself." },
    { id: "rod_13", name: "Infinity Rod", tier: 14, price: 229412, level: 39, castMult: 5.7, control: 5.2, blurb: "Transcends physics. Reality bends around it." },
    { id: "rod_14", name: "God's Hand Rod", tier: 15, price: 247059, level: 42, castMult: 6.3, control: 5.8, blurb: "Crafted by deities. Fish have no choice but to bite." },
    { id: "rod_15", name: "Omega Rod", tier: 16, price: 264706, level: 45, castMult: 7.0, control: 6.5, blurb: "The final rod. Nothing left to desire." },
    { id: "rod_16", name: "Eternal Tide Rod", tier: 17, price: 282353, level: 48, castMult: 7.8, control: 7.2, blurb: "Flows with the ocean's heartbeat." },
    { id: "rod_17", name: "Singularity Rod", tier: 18, price: 300000, level: 51, castMult: 8.7, control: 8.0, blurb: "Warps space. Casts reach other dimensions." },
    { id: "rod_18", name: "Neptune's Wrath", tier: 19, price: 317647, level: 55, castMult: 10.0, control: 9.0, blurb: "The sea god's personal weapon. Perfection incarnate." },
  ],
  reels: [
    { id: "reel_0", name: "Rusty Reel", tier: 1, price: 0, level: 1, speed: 1.0, blurb: "Squeaks with every crank. Adds character." },
    { id: "reel_1", name: "Standard Reel", tier: 2, price: 17647, level: 2, speed: 1.25, blurb: "Smooth bearings, honest gearing." },
    { id: "reel_2", name: "SmoothDrag Reel", tier: 3, price: 35294, level: 4, speed: 1.55, blurb: "Sealed drag system reels in noticeably faster." },
    { id: "reel_3", name: "Hydra Power Reel", tier: 4, price: 52941, level: 8, speed: 1.95, blurb: "Twin-crank monster. Line comes home in a hurry." },
    { id: "reel_4", name: "Velocity Reel", tier: 5, price: 70588, level: 12, speed: 2.3, blurb: "High-speed gearing. Fish don't stand a chance." },
    { id: "reel_5", name: "Tornado Reel", tier: 6, price: 88235, level: 15, speed: 2.7, blurb: "Cyclone mechanism. Retrieves like a hurricane." },
    { id: "reel_6", name: "Lightning Reel", tier: 7, price: 105882, level: 18, speed: 3.1, blurb: "Electric-assist motor. Fights feel like play." },
    { id: "reel_7", name: "Thunder Reel", tier: 8, price: 123529, level: 21, speed: 3.6, blurb: "Dual-motor beast. Line screams home." },
    { id: "reel_8", name: "Maelstrom Reel", tier: 9, price: 141176, level: 24, speed: 4.1, blurb: "Magnetic levitation. Zero friction." },
    { id: "reel_9", name: "Nova Reel", tier: 10, price: 158824, level: 27, speed: 4.7, blurb: "Stellar engineering. Pulls stars from the sky." },
    { id: "reel_10", name: "Cosmic Reel", tier: 11, price: 176471, level: 30, speed: 5.3, blurb: "Gravity well technology. Fish teleport to you." },
    { id: "reel_11", name: "Quantum Reel", tier: 12, price: 194118, level: 33, speed: 6.0, blurb: "Entanglement mechanics. Instant retrieval." },
    { id: "reel_12", name: "Supernova Reel", tier: 13, price: 211765, level: 36, speed: 6.8, blurb: "Nuclear-powered. Unstoppable force." },
    { id: "reel_13", name: "Galaxy Reel", tier: 14, price: 229412, level: 39, speed: 7.7, blurb: "Dimensional folding. Space means nothing." },
    { id: "reel_14", name: "Universe Reel", tier: 15, price: 247059, level: 42, speed: 8.7, blurb: "Reality itself reels for you." },
    { id: "reel_15", name: "Infinity Reel", tier: 16, price: 264706, level: 45, speed: 10.0, blurb: "Infinite speed. Fish arrive before they bite." },
    { id: "reel_16", name: "Eternal Reel", tier: 17, price: 282353, level: 48, speed: 11.5, blurb: "Time-warp mechanism. Past fish, present catch." },
    { id: "reel_17", name: "Void Reel", tier: 18, price: 300000, level: 51, speed: 13.5, blurb: "Erases distance. Fish simply appear." },
    { id: "reel_18", name: "Poseidon's Wheel", tier: 19, price: 317647, level: 55, speed: 16.0, blurb: "The ocean god's personal reel. Perfection." },
  ],
  lines: [
    { id: "line_0", name: "Old Twine", tier: 1, price: 0, level: 1, strength: 1.0, blurb: "Snaps if a fish sneezes. Upgrade soon." },
    { id: "line_1", name: "Mono Line", tier: 2, price: 17647, level: 2, strength: 1.3, blurb: "Proper monofilament with real stretch." },
    { id: "line_2", name: "Braided Line", tier: 3, price: 35294, level: 4, strength: 1.65, blurb: "Woven strands shrug off heavy tension." },
    { id: "line_3", name: "Steelweave Line", tier: 4, price: 52941, level: 8, strength: 2.1, blurb: "Practically a cable. Legendary-rated." },
    { id: "line_4", name: "Titanium Line", tier: 5, price: 70588, level: 12, strength: 2.6, blurb: "Military-grade alloy. Monsters can't break it." },
    { id: "line_5", name: "Diamond Thread", tier: 6, price: 88235, level: 15, strength: 3.1, blurb: "Crystal-woven fibers. Sharper than teeth." },
    { id: "line_6", name: "Mithril Line", tier: 7, price: 105882, level: 18, strength: 3.7, blurb: "Dwarven smithing. Light as air, strong as mountains." },
    { id: "line_7", name: "Adamantium Line", tier: 8, price: 123529, level: 21, strength: 4.3, blurb: "Unbreakable by mortal means." },
    { id: "line_8", name: "Dragon Scale Line", tier: 9, price: 141176, level: 24, strength: 5.0, blurb: "Shed scales from ancient wyrms." },
    { id: "line_9", name: "Phoenix Feather Line", tier: 10, price: 158824, level: 27, strength: 5.8, blurb: "Self-repairing. Burns with eternal strength." },
    { id: "line_10", name: "Starlight Line", tier: 11, price: 176471, level: 30, strength: 6.7, blurb: "Woven from captured starlight." },
    { id: "line_11", name: "Moonbeam Line", tier: 12, price: 194118, level: 33, strength: 7.7, blurb: "Lunar essence solidified. Ethereal strength." },
    { id: "line_12", name: "Solar Flare Line", tier: 13, price: 211765, level: 36, strength: 8.8, blurb: "Plasma contained. Burns anything that touches." },
    { id: "line_13", name: "Cosmic String", tier: 14, price: 229412, level: 39, strength: 10.0, blurb: "Literal fabric of spacetime." },
    { id: "line_14", name: "Reality Thread", tier: 15, price: 247059, level: 42, strength: 11.5, blurb: "Holds existence together." },
    { id: "line_15", name: "Infinity Line", tier: 16, price: 264706, level: 45, strength: 13.5, blurb: "Limitless tensile strength." },
    { id: "line_16", name: "Eternity Line", tier: 17, price: 282353, level: 48, strength: 16.0, blurb: "Unbreakable across all timelines." },
    { id: "line_17", name: "Void Strand", tier: 18, price: 300000, level: 51, strength: 19.0, blurb: "Nothingness given form. Cannot break what doesn't exist." },
    { id: "line_18", name: "Leviathan Chain", tier: 19, price: 317647, level: 55, strength: 23.0, blurb: "Bound Leviathan himself. Unbeatable." },
  ],
};

// Attach a per-tier cosmetic look to every gear item.
for (const cat of ["rods", "reels", "lines"]) {
  GEAR[cat].forEach((item, i) => {
    item.look = gearLook(cat, i);
  });
}

export const GEAR_CATS = [
  { key: "rods", label: "Rods", equipKey: "rods" },
  { key: "reels", label: "Reels", equipKey: "reels" },
  { key: "lines", label: "Lines", equipKey: "lines" },
];

export function gearStatLines(catKey, item) {
  switch (catKey) {
    case "rods":
      return [`Cast distance ×${item.castMult.toFixed(2)}`, `Fight control ×${item.control.toFixed(2)}`];
    case "reels":
      return [`Reel speed ×${item.speed.toFixed(2)}`];
    case "lines":
      return [`Line strength ×${item.strength.toFixed(2)}`];
    default:
      return [];
  }
}
