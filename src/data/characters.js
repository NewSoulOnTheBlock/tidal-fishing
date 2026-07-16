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

const PIKACHU_CAST_SOUNDS = [
  "/sfx/pikachu-1.mp3",
  "/sfx/pikachu-2.mp3",
  "/sfx/pikachu-3.mp3",
  "/sfx/pikachu-4.mp3",
];

export const CHARACTERS = [
  {
    id: "robin-hood",
    name: "Robin Hood",
    emoji: "🏹",
    blurb: "Sherwood's legendary outlaw-angler — precise casts, clean steals, and big green-water catches.",
    url: "/models/characters/robin-hood.glb",
    glbAnims: true,
    anims: {
      idle: "/anim/fishing-idle.fbx",
      cast: "/anim/fishing-cast.fbx",
    },
    height: 1.8,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },
  {
    id: "little-john",
    name: "Little John",
    emoji: "🪵",
    blurb: "Robin's towering right hand. Built like a bridge and calm enough to land monsters.",
    url: "/models/characters/little-john.glb",
    glbAnims: true,
    anims: {
      idle: "/anim/fishing-idle.fbx",
      cast: "/anim/fishing-cast.fbx",
    },
    height: 1.9,
    yawDeg: 180,
    x: 0,
    y: 0,
    z: 0,
  },
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
    // Free first-session playable character supplied as two FBX files: the idle
    // FBX provides the visible rig/model + looping idle, and the cast FBX plays
    // once every time the player releases a cast.
    id: "bonk",
    name: "Bonk",
    emoji: "🐟",
    blurb: "Bull Fish Blitz's free Bonk angler — unlocked for every player from their first cast.",
    url: "/models/characters/bonk-idle.fbx",
    fbx: true,
    anims: {
      cast: "/models/characters/bonk-cast.fbx",
    },
    height: 1.8,
    yawDeg: 180,
    x: 0,
    // Bonk's FBX rig origin sits too high on the dock with the shared default.
    // Lower only this character so the feet plant on the player spot instead of floating.
    y: -0.9,
    z: 0,
  },
  {
    // Free first-session playable character supplied as two FBX files: the idle
    // FBX provides the visible rig/model + looping idle, and the cast FBX plays
    // once every time the player releases a cast.
    id: "fwog",
    name: "Fwog",
    emoji: "🐸",
    blurb: "Fwog joins the pier — a free angler unlocked for every player immediately.",
    url: "/models/characters/fwog-idle.fbx",
    fbx: true,
    anims: {
      cast: "/models/characters/fwog-cast.fbx",
    },
    height: 1.8,
    yawDeg: 180,
    x: 0,
    // Fwog's FBX origin also floats above the dock; lower only this character.
    y: -0.9,
    z: 0,
  },
  {
    // Free first-session playable character supplied as two FBX files. Start with
    // the corrected dock/pier offset used by the other custom FBX rigs so it does
    // not float above the player spot.
    id: "tung-tung-tung-sahur",
    name: "Tung Tung Tung Sahur",
    emoji: "🪵",
    blurb: "Tung Tung Tung Sahur joins the pier — a free angler unlocked for every player immediately.",
    url: "/models/characters/tung-tung-tung-sahur-idle.fbx",
    fbx: true,
    anims: {
      cast: "/models/characters/tung-tung-tung-sahur-cast.fbx",
    },
    height: 1.8,
    yawDeg: 180,
    x: 0,
    y: -0.9,
    z: 0,
  },
  {
    // Animated VRM character (vs the static GLB/FBX bodies above). The avatar loads
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

  // ---- Premium Anglers (purchasable in Shop → Anglers for $SBF) ----------
  // Animated VRM avatars that reuse the shared Mixamo fishing clips. They must
  // be unlocked (price below) before they can be selected as the player body.
  ...premiumAngler("shadow", "Shadow", "🦔", "The ultimate life form — now chasing the ultimate catch.", {
    castSounds: [
      "/sfx/shadow-1.mp3",
      "/sfx/shadow-2.mp3",
      "/sfx/shadow-3.mp3",
      "/sfx/shadow-4.mp3",
    ],
  }),
  ...premiumAngler("goku", "Goku", "🥋", "Powering up for an over-9000 lunker. Kamehame-haul!", {
    castSounds: [
      "/sfx/goku-1.mp3",
      "/sfx/goku-2.mp3",
      "/sfx/goku-3.mp3",
      "/sfx/goku-4.mp3",
    ],
  }),
  ...premiumAngler("vegeta", "Vegeta", "🧤", "The Prince of all Anglers. His pride won't let one get away."),
  ...premiumAngler("pikachu-rockstar", "Pikachu (Rock Star)", "⚡", "Electric riffs and electric hooksets.", {
    castSounds: PIKACHU_CAST_SOUNDS,
  }),
  ...premiumAngler("pikachu-phd", "Pikachu (PhD)", "⚡", "A doctorate in ichthyology. Probably.", {
    castSounds: PIKACHU_CAST_SOUNDS,
  }),
  ...premiumAngler("pikachu-libre", "Pikachu (Libre)", "⚡", "Masked luchador of the lake. ¡Olé!", {
    castSounds: PIKACHU_CAST_SOUNDS,
  }),
  ...premiumAngler("rick", "Rick Sanchez", "🧪", "Interdimensional genius — *burp* — the fish don't stand a chance.", {
    castSounds: [
      "/sfx/rick-1.mp3",
      "/sfx/rick-2.mp3",
      "/sfx/rick-3.mp3",
      "/sfx/rick-4.mp3",
    ],
  }),
  ...premiumAngler("luffy", "Luffy", "👒", "The straw-hatted captain. He's gonna be King of the Anglers!"),
  ...premiumAngler("link", "Link", "🗡️", "The Hero of Hyrule — courage enough to reel in any leviathan.", {
    castSounds: [
      "/sfx/link-1.mp3",
      "/sfx/link-2.mp3",
      "/sfx/link-3.mp3",
      "/sfx/link-4.mp3",
      "/sfx/link-5.mp3",
    ],
  }),
  ...premiumAngler("zelda", "Zelda", "👑", "Princess of Hyrule. Wisdom guides every perfect cast."),
  ...premiumAngler("daphne", "Daphne", "💜", "The Scooby gang's glamour sleuth — on the case of the missing lunker."),
  ...premiumAngler("velma", "Velma", "👓", "Jinkies! Where there's a clue, there's a catch."),
  ...premiumAngler("bender", "Bender", "🤖", "Bite my shiny metal lure! Reeling 'em in with pure attitude.", {
    castSounds: [
      "/sfx/bender-1.mp3",
      "/sfx/bender-2.mp3",
      "/sfx/bender-3.mp3",
      "/sfx/bender-4.mp3",
    ],
  }),
  ...premiumAngler("cj", "CJ", "🚲", "Grove Street's finest. Ah, here we go again — straight to the big catch."),
];

export const DEFAULT_CHARACTER = "robin-hood";

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
