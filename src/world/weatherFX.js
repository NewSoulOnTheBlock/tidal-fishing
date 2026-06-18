// Precipitation & mist. Three crossfading emitters — slanted rain streaks, soft
// drifting snow, and low-lying mist banks — all boxed around the camera so they
// follow the player. Driven from main's weather state; rain also kicks ripples
// onto the water through an injected callback so the surface reacts to the storm.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { randRange, lerp, clamp } from "../utils/utils.js";

const WATER_Y = CONFIG.water.level;
const BOX = { x: 46, y: 34, z: 46 };

let mistTex = null;
function makeMistTexture() {
  if (mistTex) return mistTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.5)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  mistTex = new THREE.CanvasTexture(c);
  mistTex.userData.shared = true;
  return mistTex;
}

export class WeatherFX {
  constructor(scene, { onRipple } = {}) {
    this.scene = scene;
    this.onRipple = onRipple;
    this.mode = "none"; // none | rain | snow
    this.rainTarget = 0;
    this.snowTarget = 0;
    this.mistTarget = 0;
    this.rain = 0;
    this.snow = 0;
    this.mist = 0;
    this._rippleT = 0;

    this.rainSys = this.buildRain(700);
    this.snowSys = this.buildSnow(520);
    this.mistSys = this.buildMist(10);
    scene.add(this.rainSys.obj, this.snowSys.obj, this.mistSys.group);
  }

  buildRain(n) {
    const positions = new Float32Array(n * 2 * 3);
    const speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = randRange(-BOX.x, BOX.x);
      const y = randRange(-2, BOX.y);
      const z = randRange(-BOX.z, BOX.z);
      speeds[i] = randRange(34, 52);
      const len = randRange(0.7, 1.4);
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x + 0.18 * len;
      positions[i * 6 + 4] = y + len;
      positions[i * 6 + 5] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xaecbe0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });
    const obj = new THREE.LineSegments(geo, mat);
    obj.frustumCulled = false;
    obj.visible = false;
    return { obj, geo, mat, positions, speeds, n };
  }

  buildSnow(n) {
    const positions = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = randRange(-BOX.x, BOX.x);
      positions[i * 3 + 1] = randRange(-2, BOX.y);
      positions[i * 3 + 2] = randRange(-BOX.z, BOX.z);
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.18,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false;
    obj.visible = false;
    return { obj, geo, mat, positions, seeds, n };
  }

  buildMist(n) {
    const group = new THREE.Group();
    const tex = makeMistTexture();
    const banks = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: 0xdfeaf0,
        fog: false,
      });
      const s = new THREE.Sprite(mat);
      const sc = randRange(18, 40);
      s.scale.set(sc, sc * 0.5, 1);
      s.position.set(randRange(-40, 40), WATER_Y + randRange(0.5, 3), randRange(-44, 6));
      s.userData = { speed: randRange(0.4, 1.2), base: randRange(0.25, 0.6) };
      group.add(s);
      banks.push(s);
    }
    group.visible = false;
    return { group, banks };
  }

  /** @param {"none"|"rain"|"snow"} mode @param {number} intensity 0..1 */
  setMode(mode, intensity = 1) {
    this.mode = mode;
    this.rainTarget = mode === "rain" ? clamp(intensity, 0, 1) : 0;
    this.snowTarget = mode === "snow" ? clamp(intensity, 0, 1) : 0;
  }

  /** Independent low mist (e.g. dawn over water). */
  setMist(intensity) {
    this.mistTarget = clamp(intensity, 0, 1);
  }

  update(dt, cameraPos) {
    this.rain = lerp(this.rain, this.rainTarget, 1 - Math.exp(-2 * dt));
    this.snow = lerp(this.snow, this.snowTarget, 1 - Math.exp(-2 * dt));
    this.mist = lerp(this.mist, this.mistTarget, 1 - Math.exp(-1.2 * dt));

    const cx = cameraPos ? cameraPos.x : 0;
    const cz = cameraPos ? cameraPos.z : 0;

    // ---- rain ----
    const r = this.rainSys;
    if (this.rain > 0.01) {
      r.obj.visible = true;
      r.mat.opacity = this.rain * 0.6;
      r.obj.position.set(cx, 0, cz);
      const p = r.positions;
      for (let i = 0; i < r.n; i++) {
        const fall = r.speeds[i] * dt;
        p[i * 6 + 1] -= fall;
        p[i * 6 + 4] -= fall;
        p[i * 6] += 4 * dt;
        p[i * 6 + 3] += 4 * dt;
        if (p[i * 6 + 1] < -3) {
          const x = randRange(-BOX.x, BOX.x);
          const z = randRange(-BOX.z, BOX.z);
          const len = randRange(0.7, 1.4);
          p[i * 6] = x; p[i * 6 + 1] = BOX.y; p[i * 6 + 2] = z;
          p[i * 6 + 3] = x + 0.18 * len; p[i * 6 + 4] = BOX.y + len; p[i * 6 + 5] = z;
        }
      }
      r.geo.attributes.position.needsUpdate = true;

      // splatter ripples onto the water
      if (this.onRipple) {
        this._rippleT -= dt;
        if (this._rippleT <= 0) {
          this._rippleT = lerp(0.12, 0.03, this.rain);
          this.onRipple(cx + randRange(-16, 16), cz + randRange(-22, 4));
        }
      }
    } else if (r.obj.visible) {
      r.obj.visible = false;
    }

    // ---- snow ----
    const s = this.snowSys;
    if (this.snow > 0.01) {
      s.obj.visible = true;
      s.mat.opacity = this.snow * 0.9;
      s.obj.position.set(cx, 0, cz);
      const t = performance.now() * 0.001;
      const p = s.positions;
      for (let i = 0; i < s.n; i++) {
        p[i * 3 + 1] -= 3.2 * dt;
        p[i * 3] += Math.sin(t * 0.8 + s.seeds[i]) * 0.9 * dt;
        p[i * 3 + 2] += Math.cos(t * 0.6 + s.seeds[i]) * 0.6 * dt;
        if (p[i * 3 + 1] < -2) {
          p[i * 3] = randRange(-BOX.x, BOX.x);
          p[i * 3 + 1] = BOX.y;
          p[i * 3 + 2] = randRange(-BOX.z, BOX.z);
        }
      }
      s.geo.attributes.position.needsUpdate = true;
    } else if (s.obj.visible) {
      s.obj.visible = false;
    }

    // ---- mist ----
    const m = this.mistSys;
    if (this.mist > 0.01) {
      m.group.visible = true;
      m.group.position.set(cx, 0, cz);
      for (const b of m.banks) {
        b.position.x += b.userData.speed * dt;
        if (b.position.x > 46) b.position.x = -46;
        b.material.opacity = b.userData.base * this.mist;
      }
    } else if (m.group.visible) {
      m.group.visible = false;
    }
  }

  dispose() {
    this.scene.remove(this.rainSys.obj, this.snowSys.obj, this.mistSys.group);
    this.rainSys.geo.dispose();
    this.rainSys.mat.dispose();
    this.snowSys.geo.dispose();
    this.snowSys.mat.dispose();
    for (const b of this.mistSys.banks) b.material.dispose();
  }
}
