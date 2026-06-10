// Species tables. Each species defines where/when it bites, its size and value
// rolls, how hard it fights, and how the procedural mesh/SVG should look.
//
// look.shape: 'standard' | 'slim' | 'long' | 'flat' | 'billed'
// look flags: whiskers (barbels), tallDorsal, glow (subtle emissive)

export const RARITIES = {
  common: { id: "common", label: "Common", color: "#aebdca", xp: 12, order: 0, stars: 1, hookMult: 1.15 },
  uncommon: { id: "uncommon", label: "Uncommon", color: "#62d98b", xp: 22, order: 1, stars: 2, hookMult: 1.05 },
  rare: { id: "rare", label: "Rare", color: "#58a6ff", xp: 40, order: 2, stars: 3, hookMult: 0.95 },
  epic: { id: "epic", label: "Epic", color: "#c08bff", xp: 72, order: 3, stars: 4, hookMult: 0.85 },
  legendary: { id: "legendary", label: "Legendary", color: "#ffb13d", xp: 130, order: 4, stars: 5, hookMult: 0.78 },
};

export const TIME_SEGMENTS = ["dawn", "day", "dusk", "night"];

export function getTimeSegment(hours) {
  const h = ((hours % 24) + 24) % 24;
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

export const FISH_SPECIES = [
  // ---------------- Calm Lake ----------------
  {
    id: "bluegill", name: "Bluegill", rarity: "common",
    locations: ["lake"], zones: ["shallow", "mid"], time: ["dawn", "day", "dusk"],
    sizeCm: [10, 26], weightMidKg: 0.3, baseValue: 6,
    fight: { strength: 0.62, surgeEvery: [4.5, 7.5], heft: 0.75, stamina: 9 },
    look: { shape: "standard", colorA: 0x5b87b8, colorB: 0xe2954a, finColor: 0x39597e },
    desc: "A curious little sunfish that nips at anything shiny.",
  },
  {
    id: "perch", name: "Yellow Perch", rarity: "common",
    locations: ["lake", "river"], zones: ["shallow", "mid"], time: ["day"],
    sizeCm: [15, 35], weightMidKg: 0.6, baseValue: 8,
    fight: { strength: 0.7, surgeEvery: [4.5, 7], heft: 0.8, stamina: 9 },
    look: { shape: "standard", colorA: 0x8a9a4a, colorB: 0xd8b53e, finColor: 0xc46a2d },
    desc: "Striped and sociable — where there is one, there are many.",
  },
  {
    id: "carp", name: "Common Carp", rarity: "uncommon",
    locations: ["lake"], zones: ["mid"], time: ["dawn", "day", "dusk", "night"],
    sizeCm: [35, 90], weightMidKg: 4.5, baseValue: 18,
    fight: { strength: 1.0, surgeEvery: [4, 6.5], heft: 1.3, stamina: 12 },
    look: { shape: "standard", colorA: 0x9a7b48, colorB: 0xc7a05a, finColor: 0x6e5631 },
    desc: "An old bruiser of still waters. Stubborn on the line.",
  },
  {
    id: "bass", name: "Largemouth Bass", rarity: "uncommon",
    locations: ["lake"], zones: ["shallow", "mid"], time: ["dawn", "dusk"],
    sizeCm: [25, 60], weightMidKg: 1.8, baseValue: 22,
    fight: { strength: 1.1, surgeEvery: [3.8, 6], heft: 1.0, stamina: 11 },
    look: { shape: "standard", colorA: 0x4d7d4f, colorB: 0xa8c39a, finColor: 0x2f5231 },
    desc: "Ambushes lures at first and last light. Loves a fight.",
  },
  {
    id: "pike", name: "Northern Pike", rarity: "rare",
    locations: ["lake"], zones: ["mid", "deep"], time: ["dawn", "day"],
    sizeCm: [45, 110], weightMidKg: 5.5, baseValue: 45,
    fight: { strength: 1.35, surgeEvery: [3.5, 5.5], heft: 1.4, stamina: 13 },
    look: { shape: "slim", colorA: 0x5e7d4e, colorB: 0xc6d38f, finColor: 0x44603a },
    desc: "A freshwater torpedo with a mouth full of needles.",
  },
  {
    id: "catfish", name: "Channel Catfish", rarity: "rare",
    locations: ["lake", "river"], zones: ["deep"], time: ["dusk", "night"],
    sizeCm: [40, 100], weightMidKg: 6, baseValue: 40,
    fight: { strength: 1.3, surgeEvery: [4, 6.5], heft: 1.55, stamina: 15 },
    look: { shape: "standard", colorA: 0x6b7884, colorB: 0x49525c, finColor: 0x3a424c, whiskers: true },
    desc: "Prowls the dark bottom after sundown. Heavy as a sandbag.",
  },
  {
    id: "koi", name: "Golden Koi", rarity: "epic",
    locations: ["lake"], zones: ["shallow"], time: ["dawn", "day"],
    sizeCm: [30, 70], weightMidKg: 2.5, baseValue: 110,
    fight: { strength: 1.15, surgeEvery: [3.2, 5.5], heft: 1.0, stamina: 14 },
    look: { shape: "standard", colorA: 0xe88330, colorB: 0xf6f1e6, finColor: 0xd95f2b, glow: true },
    desc: "An escaped jewel. Collectors pay handsomely for one.",
  },

  // ---------------- River Bend ----------------
  {
    id: "trout", name: "Rainbow Trout", rarity: "common",
    locations: ["river"], zones: ["shallow", "mid"], time: ["dawn", "day"],
    sizeCm: [20, 50], weightMidKg: 1.2, baseValue: 14,
    fight: { strength: 0.85, surgeEvery: [4, 6.5], heft: 0.85, stamina: 10 },
    look: { shape: "slim", colorA: 0x9fb3c8, colorB: 0xd97b8e, finColor: 0x6e8296 },
    desc: "Quick, clean and beautiful. The river's calling card.",
  },
  {
    id: "grayling", name: "Arctic Grayling", rarity: "uncommon",
    locations: ["river"], zones: ["shallow", "mid"], time: ["day"],
    sizeCm: [25, 45], weightMidKg: 0.9, baseValue: 26,
    fight: { strength: 0.95, surgeEvery: [3.8, 6], heft: 0.85, stamina: 11 },
    look: { shape: "slim", colorA: 0x7d86a8, colorB: 0xb48ccd, finColor: 0x5d6488, tallDorsal: true },
    desc: "Flies a sail-like dorsal fin through the current.",
  },
  {
    id: "eel", name: "River Eel", rarity: "uncommon",
    locations: ["river", "pier"], zones: ["deep"], time: ["night"],
    sizeCm: [60, 150], weightMidKg: 3, baseValue: 30,
    fight: { strength: 1.05, surgeEvery: [2.8, 4.5], heft: 1.0, stamina: 12 },
    look: { shape: "long", colorA: 0x4f6b51, colorB: 0x39503c, finColor: 0x2c3d2f },
    desc: "Writhes like a live wire. Surges constantly — stay calm.",
  },
  {
    id: "salmon", name: "King Salmon", rarity: "rare",
    locations: ["river"], zones: ["mid", "deep"], time: ["dawn", "dusk"],
    sizeCm: [50, 100], weightMidKg: 8, baseValue: 60,
    fight: { strength: 1.5, surgeEvery: [3.5, 5.5], heft: 1.5, stamina: 14 },
    look: { shape: "slim", colorA: 0xa9b6bf, colorB: 0xd96459, finColor: 0x77858d },
    desc: "Born upstream, built like an athlete, fights like one too.",
  },
  {
    id: "goldentrout", name: "Golden Trout", rarity: "epic",
    locations: ["river"], zones: ["shallow"], time: ["dawn"],
    sizeCm: [20, 40], weightMidKg: 0.8, baseValue: 150,
    fight: { strength: 1.1, surgeEvery: [2.8, 4.5], heft: 0.8, stamina: 13 },
    look: { shape: "slim", colorA: 0xf0b53a, colorB: 0xe2703a, finColor: 0xc98e2a, glow: true },
    desc: "Only rises at first light. A living sunbeam.",
  },
  {
    id: "sturgeon", name: "White Sturgeon", rarity: "epic",
    locations: ["river"], zones: ["deep"], time: ["dusk", "night"],
    sizeCm: [80, 200], weightMidKg: 25, baseValue: 170,
    fight: { strength: 1.7, surgeEvery: [3.2, 5], heft: 2.0, stamina: 18 },
    look: { shape: "long", colorA: 0x7a7466, colorB: 0x4e493f, finColor: 0x3e3a32, whiskers: true },
    desc: "A river dinosaur. Older than the bridge you cast from.",
  },

  // ---------------- Coastal Pier ----------------
  {
    id: "mackerel", name: "Atlantic Mackerel", rarity: "common",
    locations: ["pier", "ocean"], zones: ["shallow", "mid"], time: ["day"],
    sizeCm: [25, 45], weightMidKg: 0.8, baseValue: 16,
    fight: { strength: 0.8, surgeEvery: [4, 6.5], heft: 0.8, stamina: 9 },
    look: { shape: "slim", colorA: 0x4a7fa8, colorB: 0x2f4f68, finColor: 0x3a637f },
    desc: "Travels in flashing silver schools just offshore.",
  },
  {
    id: "flounder", name: "Summer Flounder", rarity: "uncommon",
    locations: ["pier"], zones: ["shallow", "mid"], time: ["dawn", "day", "dusk", "night"],
    sizeCm: [30, 65], weightMidKg: 2, baseValue: 30,
    fight: { strength: 0.95, surgeEvery: [4.5, 7], heft: 1.2, stamina: 11 },
    look: { shape: "flat", colorA: 0xb09a6a, colorB: 0x8a7448, finColor: 0x77633e },
    desc: "A living doormat that hugs the sand until dinner swims by.",
  },
  {
    id: "seabass", name: "Black Sea Bass", rarity: "rare",
    locations: ["pier"], zones: ["mid", "deep"], time: ["dusk", "night"],
    sizeCm: [30, 60], weightMidKg: 2.5, baseValue: 55,
    fight: { strength: 1.3, surgeEvery: [3.5, 5.5], heft: 1.2, stamina: 12 },
    look: { shape: "standard", colorA: 0x3d4757, colorB: 0x232a36, finColor: 0x59658a },
    desc: "Ink-dark and moody. Hunts pilings when the sun drops.",
  },
  {
    id: "snapper", name: "Red Snapper", rarity: "rare",
    locations: ["pier", "ocean"], zones: ["deep"], time: ["day"],
    sizeCm: [40, 80], weightMidKg: 4.5, baseValue: 70,
    fight: { strength: 1.4, surgeEvery: [3.5, 5.5], heft: 1.3, stamina: 13 },
    look: { shape: "standard", colorA: 0xd4574a, colorB: 0xf0907f, finColor: 0xa83a30 },
    desc: "Crimson, keen-eyed and worth every cent at market.",
  },

  // ---------------- Deep Ocean ----------------
  {
    id: "mahi", name: "Mahi-Mahi", rarity: "epic",
    locations: ["ocean"], zones: ["mid"], time: ["day"],
    sizeCm: [70, 140], weightMidKg: 12, baseValue: 220,
    fight: { strength: 1.8, surgeEvery: [3, 5], heft: 1.6, stamina: 16 },
    look: { shape: "standard", colorA: 0x3fae6a, colorB: 0xf2d348, finColor: 0x2a8a6e, tallDorsal: true },
    desc: "Neon green-and-gold acrobat. Jumps like it hates the sea.",
  },
  {
    id: "tuna", name: "Bluefin Tuna", rarity: "epic",
    locations: ["ocean"], zones: ["deep"], time: ["dawn", "day", "dusk", "night"],
    sizeCm: [100, 250], weightMidKg: 90, baseValue: 340,
    fight: { strength: 2.0, surgeEvery: [3, 4.8], heft: 2.4, stamina: 22 },
    look: { shape: "slim", colorA: 0x2b4660, colorB: 0xb8c4cc, finColor: 0xe8c84a },
    desc: "A warm-blooded freight train. Bring your best line.",
  },
  {
    id: "swordfish", name: "Swordfish", rarity: "legendary",
    locations: ["ocean"], zones: ["deep"], time: ["night"],
    sizeCm: [150, 300], weightMidKg: 120, baseValue: 650,
    fight: { strength: 2.2, surgeEvery: [2.6, 4.4], heft: 2.3, stamina: 25 },
    look: { shape: "billed", colorA: 0x53677d, colorB: 0x8fa3b8, finColor: 0x394a5c, glow: true },
    desc: "The night fencer of the deep. Few ever land one.",
  },
  {
    id: "marlin", name: "Blue Marlin", rarity: "legendary",
    locations: ["ocean"], zones: ["deep"], time: ["day"],
    sizeCm: [180, 350], weightMidKg: 160, baseValue: 900,
    fight: { strength: 2.4, surgeEvery: [2.6, 4.2], heft: 2.6, stamina: 28 },
    look: { shape: "billed", colorA: 0x2f5fa8, colorB: 0x7fb3e8, finColor: 0x1d3f78, tallDorsal: true, glow: true },
    desc: "The crown of the ocean. A once-in-a-lifetime battle.",
  },
];

export const FISH_BY_ID = Object.fromEntries(FISH_SPECIES.map((f) => [f.id, f]));

export const sizeMid = (sp) => (sp.sizeCm[0] + sp.sizeCm[1]) / 2;
