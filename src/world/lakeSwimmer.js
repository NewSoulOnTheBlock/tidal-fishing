import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CONFIG } from "../data/config.js";
import { disposeObject3D } from "../core/disposal.js";
import { randRange } from "../utils/utils.js";

const MODEL_URL = "/models/wildlife/lake-swimmer.glb";
const WATER_Y = CONFIG.water.level;

/**
 * Rare ambient lake creature. It is intentionally non-interactive: a mood piece
 * that occasionally glides through visible water, dives, and disappears again.
 */
export class LakeSwimmer {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "lake-swimmer";
    this.root.visible = false;
    this.scene.add(this.root);

    this.model = null;
    this.enabled = false;
    this.loaded = false;
    this.loading = false;
    this.active = false;
    this.timer = randRange(8, 18);
    this.t = 0;
    this.duration = 12;
    this.radius = 18;
    this.center = new THREE.Vector3(0, WATER_Y - 0.18, -24);
    this.startAngle = 0;
    this.arc = Math.PI * 0.8;
    this.dir = 1;
    this._lastSplash = 0;
  }

  setLocation(loc) {
    this.enabled = loc?.id === "lake";
    if (!this.enabled) {
      this.active = false;
      this.root.visible = false;
      this.timer = randRange(10, 24);
      return;
    }
    this.load();
    this.timer = Math.min(this.timer, randRange(4, 12));
  }

  load() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        this.loading = false;
        const model = gltf.scene;
        this._normalize(model);
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false;
        });
        this.root.add(model);
        this.model = model;
        this.loaded = true;
      },
      undefined,
      (err) => {
        this.loading = false;
        console.warn("[lake-swimmer] failed to load model:", err?.message || err);
      }
    );
  }

  _normalize(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const target = 11.0;
    const scale = target / maxDim;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    // This GLB is already built as a horizontal fish along its local Z axis.
    // Keep it flat so players see the top of the bull head while it swims.
    model.rotation.set(0, 0, THREE.MathUtils.degToRad(4));
  }

  _beginPass() {
    if (!this.loaded || !this.enabled) return;
    this.active = true;
    this.t = 0;
    this.duration = randRange(10, 18);
    this.radius = randRange(14, 24);
    this.center.set(randRange(-4, 4), WATER_Y - randRange(0.12, 0.36), randRange(-18, -34));
    this.startAngle = randRange(Math.PI * 0.1, Math.PI * 0.9);
    this.arc = randRange(Math.PI * 0.55, Math.PI * 1.05);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.root.visible = true;
    this._lastSplash = -2;
  }

  update(dt, effects = null) {
    if (!this.enabled) return;
    if (!this.loaded) {
      this.load();
      return;
    }

    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) this._beginPass();
      return;
    }

    this.t += dt;
    const k = Math.min(this.t / this.duration, 1);
    if (k >= 1) {
      this.active = false;
      this.root.visible = false;
      this.timer = randRange(24, 55);
      return;
    }

    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const a = this.startAngle + this.dir * this.arc * ease;
    const bob = Math.sin(k * Math.PI) * 0.42;
    const tail = Math.sin(this.t * 7.5) * 0.12;
    const x = this.center.x + Math.cos(a) * this.radius;
    const z = this.center.z + Math.sin(a) * this.radius * 0.45;
    const y = this.center.y + bob;

    this.root.position.set(x, y, z);
    this.root.rotation.y = -a + (this.dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) + tail;
    this.root.rotation.z = Math.sin(this.t * 2.4) * 0.08;

    // Small surface tells: a ripple when it first breaks the water and one near
    // the dive, but not every frame.
    if (effects && (k < 0.08 || k > 0.88) && this.t - this._lastSplash > 1.4) {
      this._lastSplash = this.t;
      effects.ripple(this.root.position, 1.6, 0.55);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    disposeObject3D(this.root);
    this.model = null;
  }
}
