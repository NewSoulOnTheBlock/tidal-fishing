// Distant life on the horizon: a sailboat that drifts across the far water, the
// occasional far-off fish splash, and a rare breaching whale silhouette. All of
// it sits well beyond the play area and is fog-tinted so it reads as scenery,
// adding scale and motion to an otherwise empty horizon.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { randRange, pick } from "../utils/utils.js";

const WATER_Y = CONFIG.water.level;

let splashTex = null;
function makeSplashTex() {
  if (splashTex) return splashTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(230,245,255,0.5)");
  g.addColorStop(1, "rgba(230,245,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  splashTex = new THREE.CanvasTexture(c);
  splashTex.userData.shared = true;
  return splashTex;
}

function makeSailboat() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.9, flatShading: true });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.95, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.1, 11, 6, 1), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.5);
  hull.position.y = 1.4;
  g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14, 6), hullMat);
  mast.position.y = 8;
  g.add(mast);
  // main + jib sails
  const main = new THREE.Mesh(new THREE.PlaneGeometry(7, 11), sailMat);
  main.position.set(-2.4, 7.5, 0);
  main.rotation.y = Math.PI / 2;
  g.add(main);
  const jib = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 8), sailMat);
  jib.position.set(3.2, 6, 0);
  jib.rotation.y = Math.PI / 2;
  g.add(jib);
  g.scale.setScalar(2.4);
  return g;
}

class Sailboat {
  constructor(parent) {
    this.parent = parent;
    this.mesh = makeSailboat();
    parent.add(this.mesh);
    const side = Math.random() < 0.5 ? -1 : 1;
    const dist = randRange(420, 720);
    const zBase = randRange(-680, -260);
    this.from = new THREE.Vector3(side * dist, WATER_Y, zBase);
    this.to = new THREE.Vector3(-side * dist, WATER_Y, zBase + randRange(-120, 120));
    this.dur = randRange(70, 120);
    this.t = 0;
    this.mesh.position.copy(this.from);
    this.mesh.lookAt(this.to.x, WATER_Y + 6, this.to.z);
    this.done = false;
  }

  update(dt) {
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.parent.remove(this.mesh);
      this.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this.done = true;
      return;
    }
    this.mesh.position.lerpVectors(this.from, this.to, k);
    this.mesh.position.y = WATER_Y + Math.sin(this.t * 0.8) * 0.6;
    this.mesh.rotation.z = Math.sin(this.t * 0.6) * 0.04;
  }
}

class FarSplash {
  constructor(parent, tex) {
    this.mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0xeaf6ff, fog: true,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.visible = false;
    parent.add(this.sprite);
    this.active = false;
    this.t = 0;
    this.dur = 1.4;
  }

  fire() {
    this.active = true;
    this.t = 0;
    this.dur = randRange(1.1, 1.8);
    const ang = randRange(-Math.PI * 0.9, -Math.PI * 0.1);
    const r = randRange(220, 560);
    this.sprite.position.set(Math.cos(ang) * r, WATER_Y + 1.5, Math.sin(ang) * r - 120);
    this.sprite.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.active = false;
      this.sprite.visible = false;
      return;
    }
    const s = 6 + k * 26;
    this.sprite.scale.set(s, s * 0.7, 1);
    this.mat.opacity = Math.sin(k * Math.PI) * 0.7;
  }
}

class WhaleBreach {
  constructor(parent) {
    this.parent = parent;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b2733, roughness: 1, flatShading: true });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), mat);
    this.mesh.scale.set(1, 0.7, 2.6);
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.active = false;
    this.t = 0;
    this.dur = 3.4;
    this.base = new THREE.Vector3();
  }

  fire() {
    this.active = true;
    this.t = 0;
    const ang = randRange(-Math.PI * 0.85, -Math.PI * 0.15);
    const r = randRange(300, 600);
    this.base.set(Math.cos(ang) * r, WATER_Y - 6, Math.sin(ang) * r - 160);
    this.mesh.position.copy(this.base);
    this.mesh.rotation.y = randRange(0, Math.PI);
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }
    // arc up out of the water then back down
    const arc = Math.sin(k * Math.PI);
    this.mesh.position.y = this.base.y + arc * 22;
    this.mesh.rotation.z = (0.5 - k) * 1.2;
  }
}

export class DistantLife {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const tex = makeSplashTex();
    this.boats = [];
    this.boatTimer = randRange(20, 50);
    this.splashes = Array.from({ length: 4 }, () => new FarSplash(this.group, tex));
    this.splashTimer = randRange(6, 16);
    this.whale = new WhaleBreach(this.group);
    this.whaleTimer = randRange(60, 140);
    this.allowGulls = true;
  }

  setLocation(loc) {
    // boats & whales only make sense on bigger water
    this.bigWater = loc.env === "pier" || loc.env === "ocean";
  }

  update(dt, cameraPos) {
    if (cameraPos) {
      this.group.position.x = cameraPos.x;
      this.group.position.z = cameraPos.z;
    }

    this.boatTimer -= dt;
    if (this.boatTimer <= 0 && this.boats.length < 1) {
      this.boats.push(new Sailboat(this.group));
      this.boatTimer = randRange(this.bigWater ? 45 : 90, this.bigWater ? 110 : 200);
    }
    for (const b of this.boats) b.update(dt);
    this.boats = this.boats.filter((b) => !b.done);

    this.splashTimer -= dt;
    if (this.splashTimer <= 0) {
      const free = this.splashes.find((s) => !s.active);
      if (free) free.fire();
      this.splashTimer = randRange(5, 15);
    }
    for (const s of this.splashes) s.update(dt);

    if (this.bigWater) {
      this.whaleTimer -= dt;
      if (this.whaleTimer <= 0 && !this.whale.active) {
        this.whale.fire();
        this.whaleTimer = randRange(80, 200);
      }
    }
    this.whale.update(dt);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
