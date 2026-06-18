// Fishing spot definitions: unlock gates, water/sky/fog mood, ambience flags,
// spawn tables and which environment builder to use.

export const LOCATIONS = [
  {
    id: "lake",
    name: "Calm Lake",
    blurb: "Still green water ringed by pines. The gentlest place to learn the line.",
    unlock: { level: 1, cost: 0 },
    env: "lake",
    water: { color: 0x1f5f53, distortion: 1.7, size: 3.2, timeScale: 0.6 },
    sky: { turbidity: 7, rayleigh: 1.9, mieCoefficient: 0.004, mieDirectionalG: 0.8 },
    fog: { day: 0x9fc3c9, night: 0x0a1422, density: 0.0016 },
    ambience: { waves: 0.3, wind: 0.22, birds: true, crickets: true, gulls: false },
    biteMult: 1.0,
    fishTable: [
      ["bluegill", 32], ["perch", 26], ["carp", 14], ["bass", 13],
      ["pike", 7], ["catfish", 6], ["koi", 2],
    ],
  },
  {
    id: "river",
    name: "River Bend",
    blurb: "Cold mountain water over smooth stones. Trout at noon, salmon at dawn.",
    unlock: { level: 3, cost: 20000 },
    env: "river",
    water: { color: 0x1d6a72, distortion: 2.6, size: 4.2, timeScale: 1.0 },
    sky: { turbidity: 6, rayleigh: 2.2, mieCoefficient: 0.0035, mieDirectionalG: 0.78 },
    fog: { day: 0xa9cdd2, night: 0x0a1620, density: 0.0019 },
    ambience: { waves: 0.45, wind: 0.3, birds: true, crickets: true, gulls: false },
    biteMult: 1.05,
    fishTable: [
      ["trout", 30], ["perch", 18], ["grayling", 16], ["catfish", 10],
      ["salmon", 9], ["eel", 6], ["sturgeon", 3], ["goldentrout", 2],
      ["creekfish_redtrout", 18], ["creekfish_steelblue", 16], ["creekfish_albino", 14],
      ["creekfish_sunrise", 11], ["creekfish_berryplum", 12], ["creekfish_purple", 5],
      ["creekfish_cave", 4],
    ],
  },
  {
    id: "pier",
    name: "Coastal Pier",
    blurb: "Salt wind, crying gulls and barnacled pilings. The sea pays better.",
    unlock: { level: 6, cost: 90000 },
    env: "pier",
    water: { color: 0x10485e, distortion: 3.2, size: 2.6, timeScale: 0.85 },
    sky: { turbidity: 9, rayleigh: 2.6, mieCoefficient: 0.005, mieDirectionalG: 0.82 },
    fog: { day: 0xb6cfd8, night: 0x0a141e, density: 0.0014 },
    ambience: { waves: 0.6, wind: 0.5, birds: false, crickets: false, gulls: true },
    biteMult: 0.95,
    fishTable: [
      ["mackerel", 30], ["flounder", 20], ["eel", 12], ["seabass", 9], ["snapper", 7],
    ],
  },
  {
    id: "ocean",
    name: "Deep Ocean",
    blurb: "Open blue past the shelf, fished from a drifting boat. Monsters live here.",
    unlock: { level: 10, cost: 325000 },
    env: "ocean",
    water: { color: 0x07304d, distortion: 3.8, size: 2.0, timeScale: 1.0 },
    sky: { turbidity: 5, rayleigh: 3.0, mieCoefficient: 0.0045, mieDirectionalG: 0.85 },
    fog: { day: 0xa6c4d8, night: 0x060e1a, density: 0.0011 },
    ambience: { waves: 0.8, wind: 0.7, birds: false, crickets: false, gulls: true },
    biteMult: 0.9,
    fishTable: [
      ["mackerel", 22], ["snapper", 16], ["mahi", 9], ["tuna", 7],
      ["swordfish", 2.2], ["marlin", 1.8],
      ["smokingchicken", 0.05], // jackpot — ~36× rarer than a marlin
    ],
  },
];

export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
