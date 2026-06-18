// Realistic distant mountain range built from photogrammetry GLB peaks
// (glyder / snowy / stuart), replacing the old procedural ConeGeometry ring.
//
// Three source models are loaded once, normalised to unit height (centred on
// X/Z, feet at y = 0) and then cloned many times around the FULL horizon to
// compose a continuous, gap-free range. The range is built ONCE and then left
// alone — it is a global backdrop, identical at every location, so travelling
// between areas never reshuffles or rebuilds it.
//
// "No open spaces on the horizon": each ring computes how many peaks it needs
// from the models' real footprint so neighbouring silhouettes always overlap —
// there is never a see-through gap to the sky. A clearly-visible MID ring forms
// the solid mountainous skyline that meets the water's edge; a fainter, taller
// FAR ring sits behind it for depth and fades into the fog/sky.
//
// Clones SHARE the template geometry & materials, so the whole range is a
// handful of geometries uploaded once. A seeded RNG keeps the layout stable.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODELS = {
  glyder: "/models/mountains/glyder.glb",
  snowy: "/models/mountains/snowy.glb",
  stuart: "/models/mountains/stuart.glb",
};

// One global range, full 360°. Each band is a continuous ring; the peak count
// is derived at build time from the models' footprint (see _placeRing) so the
// silhouettes always overlap. `overlap` > 1 packs them tighter than touching.
// Only the two clean alpine scans (snowy + stuart) are used — glyder is omitted
// (it carries a thin scan-spike artifact and a ragged spiky base).
//   FAR  — taller & further, hazy behind the mid ring, fading into the sky.
//          Kept far enough back that even the tallest peak never looms overhead.
//   MID  — the dominant, clearly-visible skyline that meets the waterline.
const BANDS = [
  { keys: ["snowy", "stuart"], rMin: 1380, rMax: 1720, hMin: 360, hMax: 500, sink: 42, overlap: 1.7, offset: 0.0, minCount: 14, maxCount: 64 },
  { keys: ["snowy", "stuart"], rMin: 880, rMax: 1140, hMin: 215, hMax: 320, sink: 14, overlap: 1.7, offset: 0.21, minCount: 16, maxCount: 80 },
];

// Deterministic RNG so the range looks intentional and never changes between
// builds (mulberry32).
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let loader = null;
function gltfLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

const templates = new Map(); // key -> Promise<{ root, footHalf }>

/**
 * Load + normalise a source peak to a unit-tall, X/Z-centred, feet-at-0 group.
 * `footHalf` is the normalised half-footprint (max of X/Z half-extent at unit
 * height) — used to size each ring so its peaks overlap with no horizon gaps.
 */
function loadTemplate(key) {
  if (templates.has(key)) return templates.get(key);
  const p = new Promise((resolve, reject) => {
    gltfLoader().load(
      MODELS[key],
      (gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          if (!o.isMesh) return;
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!m) continue;
            m.fog = true; // atmospheric perspective via scene fog
            m.metalness = 0;
            if (m.roughness !== undefined) m.roughness = 1;
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const h = size.y || 1;
        // centre on X/Z and drop feet to y = 0
        model.position.set(-center.x, -box.min.y, -center.z);
        const root = new THREE.Group();
        root.add(model);
        root.scale.setScalar(1 / h); // unit height; instances re-scale to taste
        const footHalf = (0.5 * Math.max(size.x, size.z)) / h;
        resolve({ root, footHalf });
      },
      undefined,
      (err) => reject(err)
    );
  });
  templates.set(key, p);
  return p;
}

export class MountainRange {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "mountainRange";
    scene.add(this.group);
    this._built = false;
    this.ready = this._build();
  }

  /**
   * Location changes no longer touch the range — it is a fixed global backdrop.
   * Kept for call-site compatibility; building happens once in the constructor.
   */
  setLocation() {
    /* intentionally a no-op: the range is built once and left in place */
  }

  async _build() {
    if (this._built) return;
    const needed = [...new Set(BANDS.flatMap((b) => b.keys))];
    const entries = await Promise.all(
      needed.map((k) => loadTemplate(k).then((t) => [k, t]).catch(() => null))
    );
    if (this._built) return;
    const ready = new Map(entries.filter(Boolean));
    if (!ready.size) return;
    this._clear();
    this._debug = [];
    const rng = makeRng(0x7d4f17);
    for (const band of BANDS) this._placeRing(band, ready, rng);
    this._built = true;
  }

  _placeRing(band, ready, rng) {
    const usable = band.keys.filter((k) => ready.has(k));
    if (!usable.length) return;

    // Worst-case angular half-width: narrowest model, shortest height, largest
    // radius. Spacing the ring tighter than 2× this (scaled by `overlap`)
    // guarantees neighbouring silhouettes overlap → no see-through gaps.
    let minFoot = Infinity;
    for (const k of usable) minFoot = Math.min(minFoot, ready.get(k).footHalf);
    const thetaMin = (minFoot * band.hMin) / band.rMax;
    const step = (2 * thetaMin) / band.overlap;
    let count = Math.ceil((Math.PI * 2) / Math.max(step, 1e-3));
    const capped = count > band.maxCount;
    count = Math.max(band.minCount, Math.min(band.maxCount, count));
    const baseStep = (Math.PI * 2) / count;
    // marginRatio >= 1 means even the worst-case (narrowest/shortest/farthest)
    // peak still spans the full angular step → no horizon gap. Jitter is 0.20
    // of baseStep, so we want margin comfortably above 1.
    if (this._debug) {
      this._debug.push({
        keys: usable,
        minFoot: +minFoot.toFixed(3),
        count,
        capped,
        baseStepDeg: +((baseStep * 180) / Math.PI).toFixed(2),
        worstWidthDeg: +(((2 * thetaMin) * 180) / Math.PI).toFixed(2),
        marginRatio: +((2 * thetaMin) / baseStep).toFixed(2),
      });
    }

    for (let i = 0; i < count; i++) {
      const key = usable[Math.floor(rng() * usable.length)];
      const tmpl = ready.get(key);
      // even spacing + a little jitter (kept well under the overlap margin so
      // coverage is never broken)
      const a = band.offset + (i + 0.5) * baseStep + (rng() - 0.5) * baseStep * 0.2;
      const r = band.rMin + rng() * (band.rMax - band.rMin);
      const h = band.hMin + rng() * (band.hMax - band.hMin);
      const inst = new THREE.Group();
      const clone = tmpl.root.clone(true);
      inst.add(clone);
      inst.scale.setScalar(h);
      inst.position.set(Math.sin(a) * r, -band.sink, Math.cos(a) * r);
      inst.rotation.y = rng() * Math.PI * 2;
      this.group.add(inst);
    }
  }

  _clear() {
    // Remove clones WITHOUT disposing geometry/materials — they are shared with
    // the persistent templates.
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      this.group.remove(this.group.children[i]);
    }
  }
}
