// Loads a GLB voxel character and mounts it as the angler's body on the casting
// rig, so it turns with the player's aim. Models are static (no skeleton or
// animation), so we simply normalise each one — centre on X/Z, drop the feet to
// y = 0, scale to a target height — then apply a facing yaw and a small position
// offset so the procedural rod sits in front of the body.
//
// The character is chosen during onboarding (see characters.js); the body can be
// swapped live with setCharacter() when the player picks a different one.
//
// Placement is runtime-tunable (see window.__angler in main.js): a model's
// authored facing/scale can't always be known up front, so values can be nudged
// live in the console and then baked into characters.js.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getCharacter, DEFAULT_CHARACTER } from "../data/characters.js";

const BASE = {
  height: 1.6, // world units, feet-to-head, after scaling
  yawDeg: 180, // face -Z (away from the over-the-shoulder camera) by default
  x: 0,
  y: 0,
  z: 0,
};

let loader = null;
function gltfLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

export function createAnglerBody(parent, character) {
  const cfg = { ...BASE, ...normaliseChar(character) };

  // root: tunable transform (position + yaw + height scale)
  // norm: normalises the loaded model to 1 unit tall, centred on X/Z, feet at 0
  const root = new THREE.Group();
  root.name = "anglerBody";
  const norm = new THREE.Group();
  root.add(norm);
  parent.add(root);

  let holder = null; // current loaded-model subtree (swapped on setCharacter)
  let loadToken = 0; // guards against an older load resolving after a newer one

  function applyTransform() {
    root.position.set(cfg.x, cfg.y, cfg.z);
    root.rotation.y = THREE.MathUtils.degToRad(cfg.yawDeg);
    root.scale.setScalar(cfg.height);
  }
  applyTransform();

  function clearModel() {
    if (!holder) return;
    norm.remove(holder);
    holder.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      }
    });
    holder = null;
  }

  function load(url) {
    const token = ++loadToken;
    ctrl.loaded = false;
    gltfLoader().load(
      url,
      (gltf) => {
        // A newer character was requested while this was loading — drop it.
        if (token !== loadToken) return;
        clearModel();
        const model = gltf.scene;
        holder = new THREE.Group();
        holder.add(model);

        // world AABB of the imported model (accounts for its own node transforms)
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const h = size.y || 1;

        // centre on X/Z and drop feet to y = 0 within the holder
        holder.position.set(-center.x, -box.min.y, -center.z);
        // normalise to exactly 1 unit tall; root.scale then sets the real height
        norm.scale.setScalar(1 / h);
        norm.add(holder);

        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = false;
            o.frustumCulled = false;
          }
        });

        ctrl.loaded = true;
        ctrl.modelSize = { w: +size.x.toFixed(3), h: +size.y.toFixed(3), d: +size.z.toFixed(3) };
        console.info(
          `[angler] ${cfg.id || "body"} loaded — model ${ctrl.modelSize.w}×${ctrl.modelSize.h}×` +
            `${ctrl.modelSize.d}u, rendered ${cfg.height}u tall. ` +
            `Tune via __angler.setConfig({ yawDeg, height, x, y, z }).`
        );
      },
      undefined,
      (err) => {
        if (token === loadToken) console.warn("[angler] failed to load body model:", err);
      }
    );
  }

  const ctrl = {
    root,
    config: cfg,
    loaded: false,
    setVisible(v) {
      root.visible = !!v;
    },
    // Fine placement tuning of the CURRENT model (does not reload).
    setConfig(patch = {}) {
      Object.assign(cfg, patch);
      applyTransform();
      return { ...cfg };
    },
    // Swap to a different character (id string or config object). Reloads the GLB
    // and adopts that character's placement defaults.
    setCharacter(character) {
      const next = normaliseChar(character);
      if (!next.url) return { ...cfg };
      const sameModel = next.url === cfg.url;
      Object.assign(cfg, BASE, next);
      applyTransform();
      if (!sameModel || !holder) load(cfg.url);
      return { ...cfg };
    },
    dispose() {
      clearModel();
      parent.remove(root);
    },
  };

  if (cfg.url) load(cfg.url);
  return ctrl;
}

// Accept either a character id, a full character config, or undefined.
function normaliseChar(character) {
  if (!character) return { ...getCharacter(DEFAULT_CHARACTER) };
  if (typeof character === "string") return { ...getCharacter(character) };
  return { ...character };
}
