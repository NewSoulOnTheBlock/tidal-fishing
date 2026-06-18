// Per-tier cosmetic "looks" for every gear item: a distinct colour + shape so
// each rod / reel / line / bait reads differently in the 3D rig and the shop.
//
// This module is pure data + integer colour math (no THREE). It is consumed by:
//   - casting.js  -> rod (colour + silhouette), reel (new mesh), line (colour + sag)
//   - bobber.js   -> bait (float / spinner / orb shapes + colours)
//   - gearData.js -> attaches the resulting look onto every GEAR item
//
// Colours are 0xRRGGBB integers. Shapes are plain numeric parameters that the
// renderers turn into geometry. Tiers run 0..18 (19 per category) and ascend
// thematically: natural -> metal -> energy -> cosmic.

const N = 19;

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
const darken = (c, f) => mix(c, 0x000000, f);
const lighten = (c, f) => mix(c, 0xffffff, f);

const clampIdx = (i) => Math.max(0, Math.min(N - 1, i | 0));
const u01 = (i) => clampIdx(i) / (N - 1);

// Family buckets give each block of tiers a clearly different silhouette:
// 0 classic, 1 sport, 2 crystal, 3 cosmic.
const familyOf = (i) => (i < 4 ? 0 : i < 9 ? 1 : i < 14 ? 2 : 3);

// --- colour ramps (19 each) -------------------------------------------------

const ROD_COLORS = [
  0xb5853f, 0x6fa0ad, 0x2c2c33, 0x9aa3ad, 0xf0b73a, 0x46618f, 0x2f8a7d,
  0x7b5be0, 0x2f6b5a, 0x46c6e6, 0xc6d2e2, 0xa23a2c, 0x4a2f7a, 0x16cfd0,
  0xf2e0a0, 0xc01540, 0x1fa6a6, 0x5a4be0, 0x12b0a8,
];

const REEL_COLORS = [
  0x8a5a3a, 0x9aa1a8, 0xd8b24a, 0x4a8f86, 0xe0c24a, 0x5876a8, 0xe2d24a,
  0x8a6be0, 0x46a0c0, 0xb0d8ea, 0x7a5be0, 0x46d0c0, 0xe06a3a, 0x6ad0e0,
  0xf0e2a0, 0xd8d8e0, 0x46c0a8, 0x3a2f6a, 0x14a0a0,
];

const LINE_COLORS = [
  0xb09a6a, 0xdde8ee, 0x9aa6ae, 0xb8c4cc, 0xd0d8e0, 0xbfe0ea, 0xc6d4dc,
  0xd8dde2, 0xa86a4a, 0xe07a3a, 0xc6d8ea, 0xc0c0e8, 0xf0a03a, 0x8ad0e0,
  0xb0e0d0, 0xd8e0ea, 0xe0e0f0, 0x6a5be0, 0x14b0a8,
];

const BAIT_BODY = [
  0x8a5a3a, 0xe88a7a, 0xc6cdd4, 0x6ae08a, 0xe0d24a, 0xe0b84a, 0xc0504a,
  0x6ad0e0, 0xe07a3a, 0xc6d8ea, 0x4a2f7a, 0x6ad0d0, 0xe06a3a, 0xf0e2a0,
  0xb0e0d0, 0xd8e0ea, 0xe0c84a, 0xe04a7a, 0xc0143a,
];

const BAIT_ACCENT = [
  0xe23b3b, 0xffd24d, 0xffe27a, 0x9bffb0, 0xfff07a, 0xffe07a, 0xff7a6a,
  0x7af0ff, 0xffae5a, 0xeaf2ff, 0xb07aff, 0x7affef, 0xff9a5a, 0xfff4c0,
  0xd0ffe8, 0xf0f4ff, 0xffe88a, 0xff7ab0, 0xff4a6a,
];

// --- per-category look builders ---------------------------------------------

export function rodLook(i) {
  i = clampIdx(i);
  const u = u01(i);
  const color = ROD_COLORS[i];
  const glow = i >= 9;
  return {
    color,
    handle: darken(color, 0.62),
    accent: lighten(color, 0.38),
    glow,
    glowI: glow ? 0.22 + u * 0.5 : 0,
    lenScale: 0.94 + u * 0.34, // longer at higher tiers
    thickScale: 1.16 - u * 0.34, // slimmer at higher tiers
    family: familyOf(i),
    wraps: 2 + Math.min(4, Math.floor(i / 4)), // accent wraps along the blank
    tipBead: familyOf(i) >= 2,
  };
}

export function reelLook(i) {
  i = clampIdx(i);
  const u = u01(i);
  const color = REEL_COLORS[i];
  const glow = i >= 9;
  return {
    color,
    rim: lighten(color, 0.42),
    handle: darken(color, 0.5),
    glow,
    glowI: glow ? 0.24 + u * 0.5 : 0,
    spoolR: 0.05 + u * 0.03,
    spoolW: 0.05 + u * 0.022,
    discR: 0.07 + u * 0.035,
    family: familyOf(i),
  };
}

export function lineLook(i) {
  i = clampIdx(i);
  const u = u01(i);
  return {
    color: LINE_COLORS[i],
    opacity: 0.45 + u * 0.4,
    glow: i >= 9,
    sagMult: 1.15 - u * 0.7, // higher tiers hang tauter (straighter silhouette)
  };
}

export function baitLook(i) {
  i = clampIdx(i);
  const u = u01(i);
  const body = BAIT_BODY[i];
  const accent = BAIT_ACCENT[i];
  const shape = i < 2 ? "float" : i < 6 ? "spinner" : "orb";
  return {
    shape,
    body,
    accent,
    bottom: lighten(body, 0.28),
    stick: 0xe2b53b,
    glow: i >= 6,
    glowI: i >= 6 ? 0.4 + u * 0.6 : 0.3,
    scale: 1 + u * 0.25,
  };
}

export function gearLook(catKey, i) {
  switch (catKey) {
    case "rods":
      return rodLook(i);
    case "reels":
      return reelLook(i);
    case "lines":
      return lineLook(i);
    case "baits":
      return baitLook(i);
    default:
      return null;
  }
}

/** Primary swatch colour for a look (used by the shop UI). */
export function lookSwatch(look) {
  if (!look) return 0x8a8f98;
  return look.color ?? look.body ?? 0x8a8f98;
}
