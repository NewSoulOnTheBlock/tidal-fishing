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

  // Animated-character (VRM) state — null for static GLB characters.
  let vrm = null;
  let mixer = null;
  let idleAction = null;
  let castAction = null;
  let handBone = null; // VRM rod-gripping hand bone (for anchoring the rod mesh)

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

  // Tear down any active animation mixer/VRM. Called before every (re)load so a
  // character swap never leaves a stale mixer ticking.
  function disposeAnim() {
    if (mixer) {
      mixer.removeEventListener("finished", onCastFinished);
      mixer.stopAllAction();
      mixer = null;
    }
    idleAction = null;
    castAction = null;
    handBone = null;
    vrm = null;
  }

  // Normalise a loaded model subtree to 1 unit tall, centred on X/Z with feet at
  // y = 0, and mount it under `norm`. Shared by the GLB and VRM load paths.
  function mountModel(model) {
    clearModel();
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
  }

  // Cast clip is a one-shot; when it finishes, ease back into the idle loop.
  function onCastFinished(e) {
    if (e.action === castAction) crossFadeToIdle(0.35);
  }

  function crossFadeToIdle(fade = 0.3) {
    if (!idleAction) return;
    if (castAction) castAction.fadeOut(fade);
    idleAction.reset();
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.fadeIn(fade).play();
  }

  // Dispatch to the right loader for the current character.
  function load() {
    ++loadToken;
    ctrl.loaded = false;
    disposeAnim();
    if (cfg.vrm) loadVRM(loadToken);
    else loadGLB(loadToken);
  }

  function loadGLB(token) {
    gltfLoader().load(
      cfg.url,
      (gltf) => {
        if (token !== loadToken) return; // superseded by a newer load
        mountModel(gltf.scene);
      },
      undefined,
      (err) => {
        if (token === loadToken) console.warn("[angler] failed to load body model:", err);
      }
    );
  }

  // Animated VRM character: load the avatar, retarget its Mixamo idle/cast clips
  // onto the humanoid skeleton, and drive them with an AnimationMixer. three-vrm
  // and the (heavy) FBX retargeter are imported dynamically so they only ship to
  // players who actually pick an animated character.
  async function loadVRM(token) {
    try {
      const [{ VRMLoaderPlugin, VRMUtils }, { loadMixamoAnimation }] = await Promise.all([
        import("@pixiv/three-vrm"),
        import("./mixamoRig.js"),
      ]);
      if (token !== loadToken) return;

      const vloader = new GLTFLoader();
      vloader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await vloader.loadAsync(cfg.url);
      if (token !== loadToken) return;

      const loaded = gltf.userData?.vrm;
      if (!loaded) throw new Error("file contains no VRM data");

      VRMUtils.removeUnnecessaryVertices?.(gltf.scene);
      VRMUtils.combineSkeletons?.(gltf.scene);
      // VRM 0.x avatars face +Z; rotate 180° so they face -Z like the GLB bodies.
      VRMUtils.rotateVRM0?.(loaded);

      vrm = loaded;
      if (vrm.lookAt) vrm.lookAt.autoUpdate = false; // don't head-track the camera
      mountModel(vrm.scene);

      // The hand that grips the rod. main.js anchors the procedural rod mesh to
      // this bone's world position each frame so the pole stays in-hand through
      // the whole cast (the Mixamo clip swings the arm, so a fixed mount drifts
      // off-centre). Default to the right hand (matches the rod's +X mount);
      // a character can override via `rodHand`.
      const gripBone = cfg.rodHand || "rightHand";
      handBone =
        vrm.humanoid?.getRawBoneNode?.(gripBone) ||
        vrm.humanoid?.getNormalizedBoneNode?.(gripBone) ||
        null;

      mixer = new THREE.AnimationMixer(vrm.scene);
      mixer.addEventListener("finished", onCastFinished);

      const anims = cfg.anims || {};
      if (anims.idle) {
        const clip = await loadMixamoAnimation(anims.idle, vrm);
        if (token !== loadToken) return;
        idleAction = mixer.clipAction(clip);
        idleAction.play();
      }
      if (anims.cast) {
        const clip = await loadMixamoAnimation(anims.cast, vrm);
        if (token !== loadToken) return;
        castAction = mixer.clipAction(clip);
        castAction.setLoop(THREE.LoopOnce, 1);
        castAction.clampWhenFinished = true;
      }
    } catch (err) {
      if (token === loadToken) console.warn("[angler] failed to load VRM body:", err);
    }
  }

  const ctrl = {
    root,
    config: cfg,
    loaded: false,
    setVisible(v) {
      root.visible = !!v;
    },
    // Advance the animation each frame (no-op for static GLB characters). Called
    // from the game loop with the frame delta in seconds.
    update(dt) {
      if (mixer) mixer.update(dt);
      if (vrm) vrm.update(dt);
    },
    // World position of the rod-gripping hand (VRM bodies only), written into
    // `target`. Returns `target` when available, else null (static voxel bodies)
    // so the caller falls back to the rod's default rig mount. Must be called
    // after update(dt) so the bone reflects the current animated pose.
    getGripWorld(target) {
      if (!handBone) return null;
      handBone.updateWorldMatrix(true, false);
      return handBone.getWorldPosition(target);
    },
    // Play the one-shot cast animation, then auto-return to idle. No-op until an
    // animated character's cast clip has loaded.
    playCast() {
      if (!castAction) return;
      if (idleAction) idleAction.fadeOut(0.15);
      castAction.reset();
      castAction.setLoop(THREE.LoopOnce, 1);
      castAction.clampWhenFinished = true;
      castAction.fadeIn(0.15).play();
    },
    playIdle() {
      crossFadeToIdle(0.3);
    },
    // Re-pick which hand bone the rod anchors to (VRM only). Exposed for live
    // tuning via window.__angler.setRodHand('leftHand'|'rightHand').
    setRodHand(name) {
      cfg.rodHand = name;
      if (vrm) {
        handBone =
          vrm.humanoid?.getRawBoneNode?.(name) ||
          vrm.humanoid?.getNormalizedBoneNode?.(name) ||
          handBone;
      }
      return name;
    },
    // Fine placement tuning of the CURRENT model (does not reload).
    setConfig(patch = {}) {
      Object.assign(cfg, patch);
      applyTransform();
      return { ...cfg };
    },
    // Swap to a different character (id string or config object). Reloads the
    // model and adopts that character's placement defaults.
    setCharacter(character) {
      const next = normaliseChar(character);
      if (!next.url) return { ...cfg };
      const sameModel = next.url === cfg.url;
      // Rebuild config from scratch so per-character fields (vrm/anims) from the
      // previous character don't leak onto the next one.
      for (const k of Object.keys(cfg)) delete cfg[k];
      Object.assign(cfg, BASE, next);
      applyTransform();
      if (!sameModel || !holder) load();
      return { ...cfg };
    },
    dispose() {
      disposeAnim();
      clearModel();
      parent.remove(root);
    },
  };

  if (cfg.url) load();
  return ctrl;
}

// Accept either a character id, a full character config, or undefined.
function normaliseChar(character) {
  if (!character) return { ...getCharacter(DEFAULT_CHARACTER) };
  if (typeof character === "string") return { ...getCharacter(character) };
  return { ...character };
}
