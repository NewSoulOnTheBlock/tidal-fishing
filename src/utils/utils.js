// Math, random, easing and formatting helpers shared across the game.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(randRange(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const degToRad = (d) => (d * Math.PI) / 180;

export const smoothstep01 = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/**
 * Weighted random pick. `entries` is an array, `getWeight(entry)` returns a
 * non-negative weight. Returns null if every weight is zero.
 */
export function weightedPick(entries, getWeight) {
  let total = 0;
  for (const e of entries) total += Math.max(0, getWeight(e));
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= Math.max(0, getWeight(e));
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

export const formatMoney = (n) => `${Math.round(n).toLocaleString("en-US")} $TIDE`;
export const formatLength = (cm) => `${Math.round(cm)} cm`;
export const formatWeight = (kg) =>
  kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(kg < 10 ? 2 : 1)} kg`;

export function hourToClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const hexToCss = (hex) => `#${hex.toString(16).padStart(6, "0")}`;

/** Minimal pub/sub bus used for cross-module game events. */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }
  emit(event, data) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(data);
  }
}

/** Deep-merge `src` onto `base` (plain objects only; arrays are replaced). */
export function deepMerge(base, src) {
  if (src === null || src === undefined) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (typeof src !== "object" || Array.isArray(src)) return src;
  for (const key of Object.keys(src)) {
    const b = out[key];
    const s = src[key];
    if (b && s && typeof b === "object" && typeof s === "object" && !Array.isArray(b) && !Array.isArray(s)) {
      out[key] = deepMerge(b, s);
    } else {
      out[key] = s;
    }
  }
  return out;
}

/** Dispose all geometries/materials under a root (skips assets flagged shared). */
export function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.userData?.shared) continue;
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture && !v.userData?.shared) v.dispose();
        }
        m.dispose();
      }
    }
  });
}

/** Project a world position to screen pixels. Returns null when behind camera. */
export function projectToScreen(vec3, camera, width, height, out = { x: 0, y: 0 }) {
  const v = vec3.clone().project(camera);
  if (v.z > 1) return null;
  out.x = (v.x * 0.5 + 0.5) * width;
  out.y = (-v.y * 0.5 + 0.5) * height;
  return out;
}
