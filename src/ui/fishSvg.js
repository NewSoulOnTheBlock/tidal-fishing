// Shared inline-SVG fish silhouette used by the catch card, journal and shop.
// If a species' look has an `image` field, the SVG is replaced with an <img>
// of that asset (used by special hand-crafted species like the Smoking
// Chicken Fish).

import { hexToCss } from "../utils/utils.js";

export function fishSVG(look, extraClass = "") {
  if (look?.image) {
    return `<img class="fish-svg fish-img ${extraClass}" src="${look.image}" alt="" draggable="false" />`;
  }
  const body = hexToCss(look.colorA);
  const fins = hexToCss(look.finColor);
  const accent = hexToCss(look.colorB);
  return `
  <svg class="fish-svg shape-${look.shape} ${extraClass}" viewBox="0 0 100 80" aria-hidden="true">
    <path fill="${fins}" d="M36 26 L48 8 L58 24 Z" />
    <path fill="${fins}" d="M40 56 L50 71 L57 54 Z" />
    <path fill="${body}" d="M6 40 C 20 16, 52 12, 72 32 L 93 18 L 87 40 L 93 62 L 72 48 C 52 68, 20 64, 6 40 Z" />
    <path fill="${accent}" opacity="0.55" d="M14 46 C 28 58, 52 60, 68 47 C 52 56, 28 54, 14 46 Z" />
    <circle cx="23" cy="35" r="4.6" fill="#0b1118" />
    <circle cx="21.6" cy="33.4" r="1.5" fill="#cfe8ff" />
  </svg>`;
}
