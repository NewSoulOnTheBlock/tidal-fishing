// Loads a GLB voxel character and mounts it as the angler's body on the casting
// rig, so it turns with the player's aim. The model is static (no skeleton or
// animation), so we simply normalise it — centre on X/Z, drop the feet to y = 0,
// scale to a target height — then apply a facing yaw and a small position offset
// so the procedural rod sits in front of the body.
//
// Model: "Reisen Inaba - Touhou Voxel Model" by Staycalm182 (Sketchfab),
// licensed CC-BY-4.0. Attribution is shown in the title-screen footer.
//
// Placement is intentionally runtime-tunable (see window.__angler in main.js):
// the model's authored facing/scale can't be known up front, so values can be
// nudged live in the console and then baked into DEFAULTS below.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const DEFAULTS = {
  url: "/models/angler.glb",
  height: 1.9, // world units, feet-to-head, after scaling
  yawDeg: 180, // face -Z (away from the over-the-shoulder camera) by default
  x: -0.12, // lateral nudge to line the rod up with the hand
  y: 0, // feet sit at the rig / player spot
  z: -0.08, // sit just behind the rod
};

export function createAnglerBody(parent, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  // root: tunable transform (position + yaw + height scale)
  // norm: normalises the model to 1 unit tall, centred on X/Z, feet at y = 0
  const root = new THREE.Group();
  root.name = "anglerBody";
  const norm = new THREE.Group();
  root.add(norm);
  parent.add(root);

  function applyTransform() {
    root.position.set(cfg.x, cfg.y, cfg.z);
    root.rotation.y = THREE.MathUtils.degToRad(cfg.yawDeg);
    root.scale.setScalar(cfg.height);
  }
  applyTransform();

  const ctrl = {
    root,
    config: cfg,
    loaded: false,
    setVisible(v) {
      root.visible = !!v;
    },
    setConfig(patch = {}) {
      Object.assign(cfg, patch);
      applyTransform();
      return { ...cfg };
    },
    dispose() {
      parent.remove(root);
      root.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
          else m?.dispose?.();
        }
      });
    },
  };

  const loader = new GLTFLoader();
  loader.load(
    cfg.url,
    (gltf) => {
      const model = gltf.scene;
      const holder = new THREE.Group();
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
        `[angler] body loaded — model ${ctrl.modelSize.w}×${ctrl.modelSize.h}×${ctrl.modelSize.d}u, ` +
          `rendered ${cfg.height}u tall. Tune via __angler.setConfig({ yawDeg, height, x, y, z }).`
      );
    },
    undefined,
    (err) => {
      console.warn("[angler] failed to load body model:", err);
    }
  );

  return ctrl;
}
