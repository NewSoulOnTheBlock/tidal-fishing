// Playable voxel characters — the body the player fishes as. Chosen during
// onboarding (right after naming) and changeable later from the Profile.
//
// Each entry is a static GLB voxel model served from /models/characters/.
// The angler-body loader (anglerBody.js) normalises every model to a unit
// height, centres it on X/Z and drops its feet to y = 0, so the only
// per-model placement we store here is the rendered `height` (world units)
// and `yawDeg` (which way it faces). `x`/`y`/`z` nudge it relative to the rod.
//
// All values are runtime-tunable via window.__angler.setConfig({...}) so they
// can be eyeballed on a real device and then baked back in here.
//
// NOTE: several of these models depict third-party characters (R2-D2,
// Squirtle). They are bundled here as player-chosen skins; review the IP
// position before any commercial release.

export const CHARACTERS = [
  {
    id: "r2d2",
    name: "R2-D2",
    emoji: "🤖",
    blurb: "Astromech angler. Beep-boop, big catches.",
    url: "/models/characters/r2d2.glb",
    height: 1.3,
    yawDeg: 180,
    x: -0.12,
    y: 0,
    z: -0.08,
  },
  {
    id: "reisen",
    name: "Reisen",
    emoji: "🐰",
    blurb: "Lunar rabbit with a sharp eye for fish.",
    url: "/models/characters/reisen.glb",
    height: 1.8,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },
  {
    id: "chibi",
    name: "Chibi Hero",
    emoji: "🧑",
    blurb: "Pint-sized voxel adventurer, all heart.",
    url: "/models/characters/chibi.glb",
    height: 1.7,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },
  {
    id: "squirtle",
    name: "Squirtle",
    emoji: "🐢",
    blurb: "Water-type turtle — a natural by the lake.",
    url: "/models/characters/squirtle.glb",
    height: 1.2,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },
  {
    // Animated VRM character (vs the static GLB voxels above). The avatar loads
    // through anglerBody.js's VRM path; the two Mixamo FBX clips are retargeted
    // onto its humanoid skeleton (idle loops, cast plays once per cast).
    id: "naruto",
    name: "Naruto",
    emoji: "🍥",
    blurb: "Hidden Leaf's number-one knucklehead — believe it!",
    url: "/models/characters/naruto.vrm",
    vrm: true,
    anims: {
      idle: "/anim/fishing-idle.fbx",
      cast: "/anim/fishing-cast.fbx",
    },
    castSound: "/sfx/naruto-cast.mp3",
    height: 1.8,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },
];

export const DEFAULT_CHARACTER = "r2d2";

const BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/** Resolve a character config by id, falling back to the default. */
export function getCharacter(id) {
  return BY_ID[id] || BY_ID[DEFAULT_CHARACTER] || CHARACTERS[0];
}
