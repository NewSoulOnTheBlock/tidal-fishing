// Realistic distant mountain range built from photogrammetry GLB peaks
// (glyder / snowy / stuart), replacing the old procedural ConeGeometry ring.
//
// Three source models are loaded once, normalised to unit height (centred on
// X/Z, feet at y = 0) and then cloned many times around the horizon — at
// varied radius, height, rotation and a little vertical sink — to compose a
// layered range. Clones SHARE the template geometry & materials, so a whole
// range is cheap (a handful of draw calls, geometry uploaded once per model).
//
// Atmospheric perspective comes for free: every material keeps `fog = true`, so
// the scene's FogExp2 fades far peaks toward the sky colour, exactly like the
// cones it replaces — only now the silhouettes are real mountains.
//
// Placement is per-location (setLocation) and async-safe: a load token guards
// against a peak resolving after the player has already travelled elsewhere.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { randRange, pick } from "../utils/utils.js";

const MODELS = {
  glyder: "/models/mountains/glyder.glb",
  snowy: "/models/mountains/snowy.glb",
  stuart: "/models/mountains/stuart.glb",
};

// Per-location range recipes. Each entry is one "band" of peaks; stacking a far
// + near band gives the range real depth. Angles are measured so a≈π faces the
// camera's view direction (−Z), where the player looks while casting, so the
// grandest peaks sit in front of them.
const RANGES = {
  lake: [
    { keys: ["glyder", "snowy", "stuart"], count: 7, rMin: 880, rMax: 1080, hMin: 240, hMax: 380, arc: [0, Math.PI * 2], sink: 14 },
    { keys: ["snowy", "stuart", "glyder"], count: 9, rMin: 600, rMax: 790, hMin: 120, hMax: 230, arc: [0, Math.PI * 2], sink: 8 },
  ],
  river: [
    { keys: ["snowy", "stuart", "glyder"], count: 7, rMin: 900, rMax: 1100, hMin: 280, hMax: 430, arc: [0, Math.PI * 2], sink: 16 },
    { keys: ["stuart", "snowy"], count: 9, rMin: 620, rMax: 820, hMin: 150, hMax: 270, arc: [0, Math.PI * 2], sink: 8 },
  ],
  pier: [
    { keys: ["snowy", "stuart", "glyder"], count: 6, rMin: 950, rMax: 1180, hMin: 260, hMax: 420, arc: [Math.PI * 0.55, Math.PI * 1.45], sink: 18 },
    { keys: ["stuart", "snowy"], count: 5, rMin: 780, rMax: 940, hMin: 150, hMax: 260, arc: [Math.PI * 0.6, Math.PI * 1.4], sink: 10 },
  ],
  ocean: [
    // open water — only a faint, very distant range hugging the back horizon
    { keys: ["snowy", "stuart"], count: 6, rMin: 1350, rMax: 1750, hMin: 200, hMax: 360, arc: [Math.PI * 0.42, Math.PI * 1.58], sink: 40 },
  ],
};

let loader = null;
function gltfLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

const templates = new Map(); // key -> Promise<{ root, height }>

/** Load + normalise a source peak to a unit-tall, X/Z-centred, feet-at-0 group. */
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
        resolve({ root, height: 1 });
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
    this._token = 0;
    this._env = null;
  }

  /** Swap the range to a location's recipe (keyed by loc.env). */
  setLocation(loc) {
    const envKey = (loc && loc.env) || "lake";
    if (envKey === this._env) return;
    this._env = envKey;
    const token = ++this._token;
    this._clear();

    const bands = RANGES[envKey] || RANGES.lake;
    const needed = [...new Set(bands.flatMap((b) => b.keys))];

    Promise.all(needed.map((k) => loadTemplate(k).then((t) => [k, t]).catch(() => null)))
      .then((entries) => {
        if (token !== this._token) return; // travelled away mid-load
        const ready = new Map(entries.filter(Boolean));
        if (!ready.size) return;
        for (const band of bands) this._placeBand(band, ready, token);
      });
  }

  _placeBand(band, ready, token) {
    const { keys, count, rMin, rMax, hMin, hMax, arc, sink = 8 } = band;
    const [a0, a1] = arc;
    const usable = keys.filter((k) => ready.has(k));
    if (!usable.length) return;
    for (let i = 0; i < count; i++) {
      if (token !== this._token) return;
      const key = pick(usable);
      const tmpl = ready.get(key);
      const a = a0 + ((i + 0.5) / count) * (a1 - a0) + randRange(-0.14, 0.14);
      const r = randRange(rMin, rMax);
      const h = randRange(hMin, hMax);
      const inst = new THREE.Group();
      const clone = tmpl.root.clone(true);
      inst.add(clone);
      inst.scale.setScalar(h);
      inst.position.set(Math.sin(a) * r, -sink, Math.cos(a) * r);
      inst.rotation.y = randRange(0, Math.PI * 2);
      this.group.add(inst);
    }
  }

  _clear() {
    // Remove clones WITHOUT disposing geometry/materials — they are shared with
    // the persistent templates and reused by the next location.
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      this.group.remove(this.group.children[i]);
    }
  }
}
