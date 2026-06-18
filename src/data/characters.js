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
    // R2-D2 cycles through a few astromech sounds, one per cast (in order).
    castSounds: [
      "/sfx/r2d2-tritone.mp3",
      "/sfx/r2d2-scream.mp3",
      "/sfx/r2d2-whistle.mp3",
    ],
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
    // Squirtle cycles through a handful of voice clips, one per cast (in order).
    castSounds: [
      "/sfx/squirtle-1.mp3",
      "/sfx/squirtle-2.mp3",
      "/sfx/squirtle-3.mp3",
      "/sfx/squirtle-4.mp3",
      "/sfx/squirtle-5.mp3",
    ],
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
    // Naruto cycles through his voice lines, one per cast (in order).
    castSounds: [
      "/sfx/naruto-cast.mp3",
      "/sfx/naruto-2.mp3",
      "/sfx/naruto-3.mp3",
      "/sfx/naruto-4.mp3",
    ],
    height: 1.8,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },

  // ---- Premium Anglers (purchasable in Shop → Anglers for $TIDE) ----------
  // Animated VRM avatars that reuse the shared Mixamo fishing clips. They must
  // be unlocked (price below) before they can be selected as the player body.
  ...premiumAngler("shadow", "Shadow", "🦔", "The ultimate life form — now chasing the ultimate catch."),
  ...premiumAngler("goku", "Goku", "🥋", "Powering up for an over-9000 lunker. Kamehame-haul!"),
  ...premiumAngler("vegeta", "Vegeta", "🧤", "The Prince of all Anglers. His pride won't let one get away."),
  ...premiumAngler("pikachu-rockstar", "Pikachu (Rock Star)", "⚡", "Electric riffs and electric hooksets."),
  ...premiumAngler("pikachu-phd", "Pikachu (PhD)", "⚡", "A doctorate in ichthyology. Probably."),
  ...premiumAngler("pikachu-libre", "Pikachu (Libre)", "⚡", "Masked luchador of the lake. ¡Olé!"),
  ...premiumAngler("rick", "Rick Sanchez", "🧪", "Interdimensional genius — *burp* — the fish don't stand a chance."),
  ...premiumAngler("luffy", "Luffy", "👒", "The straw-hatted captain. He's gonna be King of the Anglers!"),
  ...premiumAngler("link", "Link", "🗡️", "The Hero of Hyrule — courage enough to reel in any leviathan."),
  ...premiumAngler("zelda", "Zelda", "👑", "Princess of Hyrule. Wisdom guides every perfect cast."),
];

export const DEFAULT_CHARACTER = "r2d2";

/** Build a premium animated-VRM angler entry that reuses the shared fishing clips. */
function premiumAngler(id, name, emoji, blurb, extra = {}) {
  return [
    {
      id,
      name,
      emoji,
      blurb,
      url: `/models/characters/${id}.vrm`,
      vrm: true,
      anims: { idle: "/anim/fishing-idle.fbx", cast: "/anim/fishing-cast.fbx" },
      premium: true,
      price: 100000,
      solPrice: 1,
      height: 1.8,
      yawDeg: 180,
      x: 0,
      y: 0,
      z: 0,
      ...extra,
    },
  ];
}

/** Premium anglers only (what the Shop → Anglers tab lists). */
export const PREMIUM_ANGLERS = CHARACTERS.filter((c) => c.premium);

const BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/** Resolve a character config by id, falling back to the default. */
export function getCharacter(id) {
  return BY_ID[id] || BY_ID[DEFAULT_CHARACTER] || CHARACTERS[0];
}
