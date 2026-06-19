// Pooled particle & ambience effects: splashes, expanding ripples, floating
// motes (fireflies at night) and occasional bird flocks. Capped pool sizes
// keep draw calls and allocation pressure low.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { randRange, clamp, lerp } from "../utils/utils.js";

const WATER_Y = CONFIG.water.level;

function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.userData.shared = true;
  return tex;
}

const SPLASH_PARTICLES = 26;

class SplashBurst {
  constructor(scene, dotTex) {
    this.positions = new Float32Array(SPLASH_PARTICLES * 3);
    this.velocities = new Float32Array(SPLASH_PARTICLES * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.16,
      map: dotTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      color: 0xdcf2ff,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.life = 0;
    this.maxLife = 0.7;
  }

  fire(pos, strength) {
    this.life = this.maxLife;
    for (let i = 0; i < SPLASH_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.35 * strength;
      this.positions[i * 3] = pos.x + Math.cos(a) * r * 0.4;
      this.positions[i * 3 + 1] = WATER_Y + 0.05;
      this.positions[i * 3 + 2] = pos.z + Math.sin(a) * r * 0.4;
      this.velocities[i * 3] = Math.cos(a) * randRange(0.4, 1.6) * strength;
      this.velocities[i * 3 + 1] = randRange(1.6, 3.6) * strength;
      this.velocities[i * 3 + 2] = Math.sin(a) * randRange(0.4, 1.6) * strength;
    }
    this.mat.size = 0.13 * clamp(strength, 0.6, 1.8);
    this.geo.attributes.position.needsUpdate = true;
    this.points.visible = true;
  }

  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.points.visible = false;
      return;
    }
    for (let i = 0; i < SPLASH_PARTICLES; i++) {
      this.velocities[i * 3 + 1] -= 7.5 * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    this.mat.opacity = (this.life / this.maxLife) * 0.9;
    this.geo.attributes.position.needsUpdate = true;
  }
}

class Ripple {
  constructor(scene, geo) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xcfeaf5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.t = 1;
    this.dur = 1.2;
    this.maxScale = 3;
  }

  fire(pos, maxScale, dur) {
    this.t = 0;
    this.dur = dur;
    this.maxScale = maxScale;
    this.mesh.position.set(pos.x, WATER_Y + 0.025, pos.z);
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    const s = lerp(0.35, this.maxScale, 1 - Math.pow(1 - this.t, 2));
    this.mesh.scale.setScalar(s);
    this.mat.opacity = Math.pow(1 - this.t, 1.7) * 0.55;
    if (this.t >= 1) this.mesh.visible = false;
  }
}

class BirdFlock {
  constructor(scene, color) {
    this.group = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.55, 0.08, 0.12, 0.55, 0.08, -0.12]), 3)
    );
    wingGeo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    this.wingGeo = wingGeo;
    this.mat = mat;
    this.birds = [];
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const bird = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat);
      const r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1;
      bird.add(l, r);
      bird.position.set(randRange(-4, 4), randRange(-1.5, 1.5), randRange(-3, 3));
      bird.userData = { l, r, phase: Math.random() * Math.PI * 2 };
      this.birds.push(bird);
      this.group.add(bird);
    }
    scene.add(this.group);
    this.t = 0;
    this.dur = randRange(26, 40);
    const side = Math.random() < 0.5 ? -1 : 1;
    this.from = new THREE.Vector3(side * 220, randRange(28, 55), randRange(-160, -40));
    this.to = new THREE.Vector3(-side * 220, randRange(30, 60), randRange(-140, -20));
    this.group.position.copy(this.from);
    this.group.lookAt(this.to);
    this.done = false;
    this.scene = scene;
  }

  update(dt) {
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.scene.remove(this.group);
      this.dispose();
      this.done = true;
      return;
    }
    this.group.position.lerpVectors(this.from, this.to, k);
    const flap = this.t * 9;
    for (const b of this.birds) {
      const a = Math.sin(flap + b.userData.phase) * 0.7;
      b.userData.l.rotation.z = a;
      b.userData.r.rotation.z = -a;
    }
  }

  // Geometry + material are shared by every bird in the flock; free them once
  // when the flock leaves so repeated flyovers don't accumulate GPU buffers.
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.wingGeo?.dispose();
    this.mat?.dispose();
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.dotTex = makeDotTexture();
    this.splashes = Array.from({ length: 8 }, () => new SplashBurst(scene, this.dotTex));
    this.rippleGeo = new THREE.RingGeometry(0.86, 1, 36);
    this.rippleGeo.userData.shared = true;
    this.ripples = Array.from({ length: 14 }, () => new Ripple(scene, this.rippleGeo));
    this.flocks = [];
    this.birdTimer = randRange(8, 20);
    this.birdsEnabled = true;
    this.birdColor = 0x1c2228;
    this.motes = this.buildMotes();
    scene.add(this.motes);
  }

  buildMotes() {
    const count = 110;
    const positions = new Float32Array(count * 3);
    this.moteSeeds = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = randRange(-20, 20);
      positions[i * 3 + 1] = randRange(0.4, 7);
      positions[i * 3 + 2] = randRange(-26, 8);
      this.moteSeeds[i * 2] = Math.random() * Math.PI * 2;
      this.moteSeeds[i * 2 + 1] = randRange(0.2, 0.7);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      map: this.dotTex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      color: 0xfff7d9,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  setLocationAmbient(loc) {
    this.birdsEnabled = loc.ambience.birds || loc.ambience.gulls;
    this.birdColor = loc.ambience.gulls ? 0xe8ecf0 : 0x1c2228;
  }

  splash(pos, strength = 1) {
    const burst = this.splashes.find((s) => s.life <= 0) || this.splashes[0];
    burst.fire(pos, strength);
  }

  ripple(pos, maxScale = 3, dur = 1.2) {
    const r = this.ripples.find((x) => x.t >= 1) || this.ripples[0];
    r.fire(pos, maxScale, dur);
  }

  update(dt, camera, segment) {
    for (const s of this.splashes) s.update(dt);
    for (const r of this.ripples) r.update(dt);

    // motes drift gently; at night they glow firefly-green
    const t = performance.now() * 0.001;
    const pos = this.motes.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const seed = this.moteSeeds[i * 2];
      const speed = this.moteSeeds[i * 2 + 1];
      pos.setY(i, pos.getY(i) + Math.sin(t * speed + seed) * 0.0035);
      pos.setX(i, pos.getX(i) + Math.cos(t * speed * 0.7 + seed) * 0.0028);
    }
    pos.needsUpdate = true;
    const night = segment === "night";
    this.motes.material.color.setHex(night ? 0xbdf2a6 : 0xfff7d9);
    this.motes.material.opacity = night ? 0.5 : 0.3;
    this.motes.position.x = camera.position.x;
    this.motes.position.z = camera.position.z;

    // bird flocks during daylight hours
    if (this.birdsEnabled && (segment === "day" || segment === "dawn")) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0 && this.flocks.length < 2) {
        this.flocks.push(new BirdFlock(this.scene, this.birdColor));
        this.birdTimer = randRange(24, 50);
      }
    }
    for (const f of this.flocks) f.update(dt);
    this.flocks = this.flocks.filter((f) => !f.done);
  }
}
