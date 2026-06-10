// Animated water surface built on the official Three.js Water example, with a
// procedurally generated tileable normal map so no external textures are needed.

import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { CONFIG } from "../data/config.js";

let cachedNormals = null;

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
    this.build();
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
  }

  setSun(direction, color) {
    const u = this.water.material.uniforms;
    u.sunDirection.value.copy(direction).normalize();
    u.sunColor.value.copy(color);
  }

  update(dt) {
    this.water.material.uniforms.time.value += dt * this.params.timeScale;
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
