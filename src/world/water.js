// Animated water surface built on the official Three.js Water example, with a
// procedurally generated tileable normal map so no external textures are needed.

import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { CONFIG } from "../data/config.js";

let cachedNormals = null;
let sparkleTex = null;
const GLITTER_WHITE = new THREE.Color(0xffffff);

function makeSparkleTexture() {
  if (sparkleTex) return sparkleTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,244,214,0.6)");
  g.addColorStop(1, "rgba(255,244,214,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  sparkleTex = new THREE.CanvasTexture(c);
  sparkleTex.userData.shared = true;
  return sparkleTex;
}

// A twinkling streak of specular glints laid along the sun's reflection path on
// the water. Additive, so it lights up under the bloom pass and gives the
// surface that million-diamonds shimmer toward the sun.
class SunGlitter {
  constructor(scene, count = 220) {
    this.count = count;
    this.length = 150;
    this.positions = new Float32Array(count * 3);
    this.seeds = new Float32Array(count * 3); // along, lateral, phase
    for (let i = 0; i < count; i++) {
      this.seeds[i * 3] = Math.pow(Math.random(), 0.7); // bias near camera
      this.seeds[i * 3 + 1] = (Math.random() - 0.5) * 2;
      this.seeds[i * 3 + 2] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.PointsMaterial({
      map: makeSparkleTexture(),
      size: 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xfff2d2,
      fog: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this._dir = new THREE.Vector2(0, -1);
  }

  update(dt, sunDir, dayFactor, sunColor, cameraPos, waterY) {
    const up = sunDir ? Math.max(0, sunDir.y) : 0;
    const vis = Math.max(0, dayFactor) * Math.min(1, up * 2.2);
    if (vis <= 0.01) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    // horizontal direction toward the sun (the glitter path)
    this._dir.set(sunDir.x, sunDir.z);
    if (this._dir.lengthSq() < 1e-4) this._dir.set(0, -1);
    this._dir.normalize();
    const px = this._dir.x, pz = this._dir.y;
    const perpX = -pz, perpZ = px;
    const cx = cameraPos ? cameraPos.x : 0;
    const cz = cameraPos ? cameraPos.z : 0;
    const t = performance.now() * 0.001;
    const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const along = this.seeds[i * 3];
      const lat = this.seeds[i * 3 + 1] * (1 - along) * 9;
      const d = along * this.length + 4;
      p[i * 3] = cx + px * d + perpX * lat;
      p[i * 3 + 1] = waterY + 0.06;
      p[i * 3 + 2] = cz + pz * d + perpZ * lat;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    // collective twinkle from a couple of phase-shifted sines
    const tw = 0.5 + 0.5 * Math.sin(t * 7.0);
    this.mat.opacity = vis * (0.45 + tw * 0.45);
    if (sunColor) this.mat.color.copy(sunColor).lerp(GLITTER_WHITE, 0.4);
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * Generates a tileable water normal map from layered value noise drawn to a
 * canvas. Quality is plenty for a stylized surface and avoids CDN texture
 * dependencies entirely.
 */
function generateWaterNormals(size = 256) {
  if (cachedNormals) return cachedNormals;

  // tileable height field from summed sine pseudo-noise
  const height = new Float32Array(size * size);
  const octaves = [
    { fx: 2, fy: 3, amp: 1.0, px: 1.7, py: 4.2 },
    { fx: 5, fy: 4, amp: 0.55, px: 2.9, py: 0.8 },
    { fx: 9, fy: 8, amp: 0.3, px: 5.1, py: 2.3 },
    { fx: 16, fy: 17, amp: 0.18, px: 0.4, py: 3.7 },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      let h = 0;
      for (const o of octaves) {
        h += Math.sin(u * o.fx + o.px + Math.cos(v * o.fy + o.py)) * o.amp;
        h += Math.cos(v * o.fy * 0.7 + o.px + Math.sin(u * o.fx * 1.3)) * o.amp * 0.6;
      }
      height[y * size + x] = h;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = inv * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.userData.shared = true;
  cachedNormals = tex;
  return tex;
}

export class WaterSurface {
  constructor(scene, quality = "high") {
    this.scene = scene;
    this.quality = quality;
    this.params = { color: 0x1f5f53, distortion: 1.7, size: 3.2, timeScale: 0.6 };
    this.water = null;
    this._baseColor = new THREE.Color(this.params.color);
    this._moodColor = new THREE.Color();
    this._deepNight = new THREE.Color(0x081f2a);
    this.build();
    this.glitter = new SunGlitter(scene);
  }

  build() {
    const texSize = CONFIG.quality[this.quality]?.waterTex ?? 1024;
    const geometry = new THREE.PlaneGeometry(CONFIG.water.size, CONFIG.water.size);
    const water = new Water(geometry, {
      textureWidth: texSize,
      textureHeight: texSize,
      waterNormals: generateWaterNormals(),
      sunDirection: new THREE.Vector3(0.3, 0.8, 0.2),
      sunColor: 0xffffff,
      waterColor: this.params.color,
      distortionScale: this.params.distortion,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = CONFIG.water.level;
    water.material.uniforms.size.value = this.params.size;
    this.scene.add(water);
    this.water = water;
  }

  setParams(p) {
    this.params = { ...this.params, ...p };
    const u = this.water.material.uniforms;
    u.waterColor.value.setHex(this.params.color);
    u.distortionScale.value = this.params.distortion;
    u.size.value = this.params.size;
    this._baseColor.setHex(this.params.color);
  }

  setSun(direction, color) {
    const u = this.water.material.uniforms;
    u.sunDirection.value.copy(direction).normalize();
    u.sunColor.value.copy(color);
  }

  update(dt, env) {
    this.water.material.uniforms.time.value += dt * this.params.timeScale;
    if (env) {
      // depth/mood colour: rich teal by day, deep midnight blue at night, with
      // a touch of livelier chop motion as the light fades
      const f = Math.max(0, Math.min(1, env.dayFactor));
      this._moodColor.copy(this._deepNight).lerp(this._baseColor, 0.35 + f * 0.65);
      this.water.material.uniforms.waterColor.value.copy(this._moodColor);
      this.water.material.uniforms.distortionScale.value =
        this.params.distortion * (1 + (1 - f) * 0.25);
      this.glitter.update(dt, env.sunDir, env.dayFactor, env.sunColor, env.cameraPos, CONFIG.water.level);
    }
  }

  setQuality(quality) {
    if (quality === this.quality) return;
    this.quality = quality;
    const old = this.water;
    this.scene.remove(old);
    // free GPU resources of the old reflection target + material
    old.material.uniforms.mirrorSampler.value?.dispose?.();
    old.material.dispose();
    old.geometry.dispose();
    this.build();
  }
}
