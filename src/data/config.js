// Central balance/tuning sheet. Every gameplay-relevant number lives here so
// the feel of the game can be adjusted without touching system code.

export const CONFIG = {
  saveKey: "tidal_save_v1",
  legacySaveKey: "tideline_save_v1",

  water: { level: 0, size: 4000 },

  time: {
    dayLengthSec: 1920, // real seconds for a full 24h cycle (4x slower than the original 480)
    startHour: 8.5,
  },

  // Horizontal distance (m) from the angler that defines each depth band.
  zones: {
    shallowMax: 14,
    midMax: 30,
    labels: { shallow: "Shallow", mid: "Mid", deep: "Deep" },
  },

  cast: {
    minDist: 6,
    baseMaxDist: 34, // multiplied by the equipped rod's castMult
    chargeTime: 1.15, // seconds for the power meter to sweep 0 -> 1
    launchAngleDeg: 38,
    gravity: 9.8,
    aimMaxYawDeg: 58,
    powerCurve: 1.12, // distance = min + (max-min) * power^curve
  },

  bite: {
    waitMin: 7,
    waitMax: 19,
    nibbleChance: 0.65,
    hookWindowBase: 1.05, // scaled down for rarer fish
    retrieveHoldTime: 0.35, // hold-click this long while waiting to retrieve
    retrieveSpeed: 11,
    deepWaitMult: 1.15, // deep water bites take slightly longer
    perfectFrac: 0.3, // tap within the first 30% of the window = a perfect hook
    // active lure jig (a quick tap while waiting)
    jigCooldown: 0.55, // min seconds between jigs
    jigWaitMult: 0.8, // each jig multiplies the remaining wait (faster bite)
    jigNibbleChance: 0.4, // a jig may provoke an immediate teaser nibble
    jigRareStep: 0.06, // rarity weight boost per jig (capped by jigRareMax)
    jigRareMax: 3, // jigs counted toward the rarity boost
  },

  reel: {
    reelRate: 7.0, // catch progress %/s while reeling (x reel, / heft)
    escapeRate: 4.0, // progress %/s lost while resting (x strength)
    tensionGain: 20, // tension %/s while reeling (x strength, / line)
    tensionRecover: 21, // tension %/s recovered while resting
    surgeReelMult: 3.0, // tension multiplier when reeling through a surge
    surgeRestGain: 7, // passive tension %/s during a surge even at rest
    telegraphTime: 0.95,
    surgeDuration: [1.1, 1.9],
    startProgress: 8,
    startTension: 18,
    maxFightTime: 95,
    escapeGraceTime: 2.5,
    minFishDist: 2.2,
    tiredStrengthMult: 0.62, // fish weakens after its stamina runs out
    tiredSurgeSpacing: 1.6,
    // tension "green zone": reward keeping tension in the band, punish over-reel
    sweetLow: 45,
    sweetHigh: 78,
    sweetReelBonus: 1.55, // progress gain x this while reeling inside the band
    overReelTensionMult: 1.4, // tension gain x this while reeling above the band
    // perfect-hook payoff (applied in fight.start when the hook was perfect)
    perfectStartTension: 8, // replaces startTension on a perfect hook
    perfectProgressBonus: 12, // added to startProgress on a perfect hook
    perfectGrace: 1.1, // seconds of surge immunity after a perfect hook
    // active surge dodge (tap during the telegraph)
    dodgeSoften: 0.4, // a dodged surge's strength + duration scale by this
    // near-snap save (release just after tension crosses 100)
    snapSaveWindow: 0.32, // seconds to release in after crossing 100
    snapSaveTension: 80, // tension is dropped to this on a successful save
    snapSavesPerFight: 1, // free saves granted per fight
    // lateral "runs": the fish bolts left or right and you must lean the rod the
    // same way (arrow keys / on-screen ◄ ►). Steer wrong and tension climbs fast.
    run: {
      firstDelay: 3.2, // grace before the fish's first run
      every: [4.5, 7.5], // calm seconds between runs
      telegraph: 0.85, // arrow shows this long before tension starts biting
      duration: [1.5, 2.2], // how long a run lasts
      wrongTensionGain: 19, // tension %/s while NOT leaning into the run (x str / line)
      matchProgress: 1.6, // bonus catch %/s while correctly leaning into a run
      swing: 0.5, // rad/s the fight point eases toward the run side (visual)
      maxAngle: 0.6, // clamp: fight point stays within this many rad of the cast
                     // direction so the rod/line/camera never whip around
    },
    // desktop fight feel: drag the mouse left/right to lean the rod against a run
    // (instead of tapping the ◄ ► buttons). The drag builds a signal that decays
    // back to centre when you stop moving, so you have to actively work the rod.
    mouseSteer: {
      gain: 1 / 105, // pixels of horizontal mouse motion → steer signal
      decay: 7.0, // signal self-centres at this rate/s when the mouse is still
      deadzone: 0.42, // |signal| must exceed this to commit a lean
    },
    // final landing: when the catch bar fills, the fish wallows at the surface
    // and you must PULL BACK (Up / "HEAVE!") to lift it out of the water.
    heaveAutoTime: 7, // safety: auto-lift if the player never heaves (no soft-lock)
  },

  economy: {
    xpBase: 350,
    xpPow: 1.4, // xp to next level = round(xpBase * level^xpPow)
    newSpeciesXpMult: 2,
    startMoney: 0,
    earnMultiplier: 0.1, // global scale on all fish $TIDE value (treasury protection)
  },

  weather: {
    changeEvery: [100, 200], // seconds between weather rolls
    cloudyChance: 0.45,
    cloudyBiteMult: 1.18, // bites come faster under clouds
    cloudyRareBoost: 1.12,
  },

  // Drifting "feeding spots" (visible fish shadows / ripple rings) the player
  // can cast toward for faster bites and a better shot at rarer fish.
  feeding: {
    maxSpots: 3,
    radius: 3.6, // m: how close the bobber must land to count as "in the spot"
    spawnEvery: [5, 11], // seconds between spawn attempts while a slot is free
    ttl: [16, 28], // seconds a spot lives before drifting away
    fade: 1.1, // seconds to fade in/out
    driftSpeed: 0.32, // m/s lateral drift
    biteMult: 1.85, // remaining bite wait is divided by this inside a spot
    rareBoost: 1.6, // rarity weight boost inside a spot
    rippleEvery: [0.9, 1.8], // seconds between ambient feeding ripples
  },

  camera: {
    fov: 58,
    height: 1.85,
    back: 2.7,
    side: 0.55,
    chargeFovDrop: 7,
  },

  quality: {
    high: { pixelRatio: 2, shadows: true, waterTex: 1024 },
    low: { pixelRatio: 1.25, shadows: false, waterTex: 512 },
  },

  autosaveEvery: 25,
};
