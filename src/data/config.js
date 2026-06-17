// Central balance/tuning sheet. Every gameplay-relevant number lives here so
// the feel of the game can be adjusted without touching system code.

export const CONFIG = {
  saveKey: "tidal_save_v1",
  legacySaveKey: "tideline_save_v1",

  water: { level: 0, size: 4000 },

  time: {
    dayLengthSec: 480, // real seconds for a full 24h cycle
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
    waitMin: 4,
    waitMax: 13,
    nibbleChance: 0.65,
    hookWindowBase: 1.05, // scaled down for rarer fish
    retrieveHoldTime: 0.35, // hold-click this long while waiting to retrieve
    retrieveSpeed: 11,
    deepWaitMult: 1.15, // deep water bites take slightly longer
  },

  reel: {
    reelRate: 13.5, // catch progress %/s while reeling (x reel, / heft)
    escapeRate: 5.5, // progress %/s lost while resting (x strength)
    tensionGain: 26, // tension %/s while reeling (x strength, / line)
    tensionRecover: 21, // tension %/s recovered while resting
    surgeReelMult: 3.4, // tension multiplier when reeling through a surge
    surgeRestGain: 7, // passive tension %/s during a surge even at rest
    telegraphTime: 0.75,
    surgeDuration: [1.1, 1.9],
    startProgress: 8,
    startTension: 18,
    maxFightTime: 55,
    escapeGraceTime: 2.5,
    minFishDist: 2.2,
    tiredStrengthMult: 0.62, // fish weakens after its stamina runs out
    tiredSurgeSpacing: 1.6,
  },

  economy: {
    xpBase: 700,
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
