// Drifting "feeding spots": readable fish-shadow / ripple rings on the water
// surface that the player can aim a cast toward. Landing the bobber inside a
// spot speeds up the bite and boosts the odds of a rarer fish (the bonus is
// resolved in main.js via spotAt() and fed into the bite system).
//
// Purely cosmetic + a small spawn bias — no persistent state. Pairs with the
// daily hot spot (a whole-location bonus); feeding spots are spatial within a
// location, so *where* you cast finally matters.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { randRange, clamp } from "../utils/utils.js";

const WATER_Y = CONFIG.water.level;

// soft radial "baitball" shadow texture, generated once and shared
function makeShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(14, 34, 44, 0.85)");
  g.addColorStop(0.55, "rgba(18, 46, 60, 0.5)");
  g.addColorStop(1, "rgba(20, 50, 66, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

class Spot {
  constructor(scene, tex, ringGeo) {
    this.group = new THREE.Group();
    this.group.visible = false;

    const discMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), discMat);
    this.disc.rotation.x = -Math.PI / 2;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8fe6ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;

    this.group.add(this.disc, this.ring);
    scene.add(this.group);

    this.active = false;
    this.age = 0;
    this.ttl = 0;
    this.life = 0;
    this.driftAngle = 0;
    this.rippleTimer = 0;
    this.phase = Math.random() * Math.PI * 2;
  }

  spawn(x, z, ttl) {
    this.active = true;
    this.age = 0;
    this.ttl = ttl;
    this.life = 0;
    this.driftAngle = Math.random() * Math.PI * 2;
    this.rippleTimer = randRange(...CONFIG.feeding.rippleEvery);
    this.group.position.set(x, WATER_Y + 0.04, z);
    this.group.visible = true;
  }

  retire() {
    this.active = false;
    this.group.visible = false;
  }
}

export class FeedingSpots {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.enabled = false;
    this.center = new THREE.Vector3();
    this.minR = CONFIG.cast.minDist;
    this.maxR = CONFIG.cast.baseMaxDist;
    // spots live in the forward castable sector (yaw 0 faces -Z), kept a touch
    // inside the aim limit so every spot is actually reachable.
    this.arc = (CONFIG.cast.aimMaxYawDeg * Math.PI) / 180 * 0.82;
    this.spawnTimer = randRange(...CONFIG.feeding.spawnEvery);

    const tex = makeShadowTexture();
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
    this.spots = [];
    for (let i = 0; i < CONFIG.feeding.maxSpots; i++) {
      this.spots.push(new Spot(scene, tex, ringGeo));
    }
  }

  /** Recenter the castable sector on the angler and reset the field. */
  setBounds(playerSpot, minR, maxR) {
    this.center.copy(playerSpot);
    this.minR = minR;
    this.maxR = maxR;
    this.clear();
    this.spawnTimer = randRange(0.5, CONFIG.feeding.spawnEvery[1] * 0.5);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  clear() {
    for (const s of this.spots) s.retire();
  }

  spawnOne() {
    const slot = this.spots.find((s) => !s.active);
    if (!slot) return;
    const F = CONFIG.feeding;
    const margin = F.radius + 1.5;
    const lo = this.minR + margin;
    const hi = Math.max(lo + 1, this.maxR - margin);
    const r = randRange(lo, hi);
    const a = randRange(-this.arc, this.arc); // angle from forward (-Z)
    slot.spawn(this.center.x + Math.sin(a) * r, this.center.z - Math.cos(a) * r, randRange(...F.ttl));
  }

  update(dt) {
    if (!this.enabled) return;
    const F = CONFIG.feeding;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnOne();
      this.spawnTimer = randRange(...F.spawnEvery);
    }

    for (const s of this.spots) {
      if (!s.active) continue;
      s.age += dt;

      // fade in, hold, fade out near end of life
      const fadeIn = clamp(s.age / F.fade, 0, 1);
      const fadeOut = clamp((s.ttl - s.age) / F.fade, 0, 1);
      s.life = Math.min(fadeIn, fadeOut);
      if (s.age >= s.ttl) {
        s.retire();
        continue;
      }

      // gentle wandering drift, kept within the castable sector
      s.driftAngle += randRange(-0.6, 0.6) * dt;
      const nx = s.group.position.x + Math.sin(s.driftAngle) * F.driftSpeed * dt;
      const nz = s.group.position.z + Math.cos(s.driftAngle) * F.driftSpeed * dt;
      const dx = nx - this.center.x;
      const dz = nz - this.center.z;
      const d = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, -dz);
      if (d < this.minR + F.radius || d > this.maxR - F.radius || Math.abs(ang) > this.arc) {
        s.driftAngle += Math.PI; // turn back toward the sector
      } else {
        s.group.position.x = nx;
        s.group.position.z = nz;
      }

      // breathing pulse + visuals scaled by life
      s.phase += dt;
      const pulse = 1 + Math.sin(s.phase * 1.6) * 0.06;
      const discSize = F.radius * 2 * pulse;
      s.disc.scale.set(discSize, discSize, 1);
      s.disc.material.opacity = 0.42 * s.life;
      const ringSize = F.radius * (1.18 + Math.sin(s.phase * 1.6 + 1) * 0.08);
      s.ring.scale.set(ringSize, ringSize, 1);
      s.ring.material.opacity = 0.5 * s.life;
      s.ring.rotation.z += dt * 0.4;

      // occasional surface ripple — fish nosing the bait
      s.rippleTimer -= dt;
      if (s.rippleTimer <= 0 && s.life > 0.4) {
        this.effects.ripple(s.group.position, 1.6, 1.0);
        s.rippleTimer = randRange(...F.rippleEvery);
      }
    }
  }

  /**
   * If `pos` is inside an established feeding spot, returns its bonus and fires
   * a "fish scatter" splash; otherwise null.
   */
  spotAt(pos) {
    const F = CONFIG.feeding;
    let best = null;
    let bestD = Infinity;
    for (const s of this.spots) {
      if (!s.active || s.life < 0.35) continue;
      const d = Math.hypot(pos.x - s.group.position.x, pos.z - s.group.position.z);
      if (d <= F.radius && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) return null;
    this.effects.splash(best.group.position, 1.0);
    this.effects.ripple(best.group.position, 2.6, 1.2);
    return { biteMult: F.biteMult, rareBoost: F.rareBoost };
  }
}
