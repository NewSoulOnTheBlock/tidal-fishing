// The bobber: projectile flight, splash landing, idle floating with bite dips,
// and retrieval. Emits bus events when it lands or returns.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { events } from "../state/gameState.js";
import { clamp, lerp } from "../utils/utils.js";
import { baitLook } from "../data/gearLooks.js";

const WATER_Y = CONFIG.water.level;

export function zoneForDistance(d) {
  if (d <= CONFIG.zones.shallowMax) return "shallow";
  if (d <= CONFIG.zones.midMax) return "mid";
  return "deep";
}

export class Bobber {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.mode = "hidden"; // hidden | flying | floating | retrieving
    this.vel = new THREE.Vector3();
    this.playerSpot = new THREE.Vector3();
    this._scratchDir = new THREE.Vector3();
    this.floatT = 0;
    this.flightT = 0;
    this.dip = 0;
    this.dipTarget = 0;
    this.rippleTimer = 0;
    this._look = baitLook(0);
    this.group = new THREE.Group();
    this.build();
    this.group.visible = false;
    scene.add(this.group);
  }

  // (Re)build the bait mesh into this.group from the equipped bait's look.
  // Three silhouettes: classic float, spinner lure, glowing orb.
  build() {
    this.clearGroup();
    const look = this._look;
    const s = look.scale;
    const parts = [];

    if (look.shape === "spinner") {
      // metallic lure body with a flashing blade
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.05 * s, 0.1 * s, 4, 8),
        new THREE.MeshStandardMaterial({ color: look.body, roughness: 0.3, metalness: 0.7 })
      );
      body.position.y = 0.06;
      const bladeMat = new THREE.MeshStandardMaterial({
        color: look.accent,
        roughness: 0.2,
        metalness: 0.85,
        emissive: look.accent,
        emissiveIntensity: 0.25,
        side: THREE.DoubleSide,
      });
      const blade = new THREE.Mesh(new THREE.CircleGeometry(0.05 * s, 12), bladeMat);
      blade.position.set(0, 0.18 * s, 0);
      blade.rotation.x = Math.PI / 2;
      const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.02 * s, 0.005, 6, 10, Math.PI * 1.4),
        new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.8 })
      );
      hook.position.y = -0.02;
      parts.push(body, blade, hook);
    } else if (look.shape === "orb") {
      // glowing magical bait
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.075 * s, 16, 14),
        new THREE.MeshStandardMaterial({
          color: look.body,
          roughness: 0.25,
          metalness: 0.2,
          emissive: look.body,
          emissiveIntensity: look.glowI,
        })
      );
      orb.position.y = 0.07;
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.1 * s, 0.012 * s, 8, 24),
        new THREE.MeshStandardMaterial({
          color: look.accent,
          roughness: 0.3,
          metalness: 0.4,
          emissive: look.accent,
          emissiveIntensity: look.glowI,
        })
      );
      halo.position.y = 0.07;
      halo.rotation.x = Math.PI / 2.3;
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.02 * s, 8, 8),
        new THREE.MeshStandardMaterial({
          color: look.accent,
          emissive: look.accent,
          emissiveIntensity: look.glowI + 0.3,
          roughness: 0.2,
        })
      );
      spark.position.y = 0.18 * s;
      parts.push(orb, halo, spark);
    } else {
      // classic two-tone float on a stick
      const bottom = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 * s, 12, 10),
        new THREE.MeshStandardMaterial({ color: look.bottom, roughness: 0.35 })
      );
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.085 * s, 12, 10),
        new THREE.MeshStandardMaterial({ color: look.body, roughness: 0.35 })
      );
      top.position.y = 0.07 * s;
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.16 * s, 6),
        new THREE.MeshStandardMaterial({ color: look.stick, roughness: 0.4 })
      );
      stick.position.y = 0.2 * s;
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.028 * s, 8, 8),
        new THREE.MeshStandardMaterial({
          color: look.accent,
          emissive: look.accent,
          emissiveIntensity: look.glowI,
          roughness: 0.3,
        })
      );
      tip.position.y = 0.3 * s;
      parts.push(bottom, top, stick, tip);
    }

    for (const p of parts) {
      p.castShadow = true;
      this.group.add(p);
    }
    return this.group;
  }

  clearGroup() {
    if (!this.group) return;
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const o = this.group.children[i];
      o.geometry?.dispose?.();
      o.material?.dispose?.();
      this.group.remove(o);
    }
  }

  /** Swap the bait silhouette/colours when the equipped bait changes. */
  applyLook(look) {
    if (!look) return;
    this._look = look;
    this.build();
  }

  get pos() {
    return this.group.position;
  }

  get distanceFromPlayer() {
    const dx = this.pos.x - this.playerSpot.x;
    const dz = this.pos.z - this.playerSpot.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  launch(origin, velocity, playerSpot) {
    this.playerSpot.copy(playerSpot);
    this.group.position.copy(origin);
    this.vel.copy(velocity);
    this.mode = "flying";
    this.flightT = 0;
    this.dip = 0;
    this.dipTarget = 0;
    this.group.visible = true;
  }

  setDip(target) {
    this.dipTarget = target;
  }

  startRetrieve() {
    if (this.mode === "floating") this.mode = "retrieving";
  }

  hide() {
    this.mode = "hidden";
    this.group.visible = false;
    this.dip = 0;
    this.dipTarget = 0;
  }

  land() {
    this.group.position.y = WATER_Y;
    this.mode = "floating";
    this.floatT = 0;
    const speed = this.vel.length();
    const d = this.distanceFromPlayer;
    this.effects.splash(this.pos, clamp(speed / 12, 0.6, 1.5));
    this.effects.ripple(this.pos, 3.2, 1.4);
    events.emit("bobber:landed", { distance: d, zone: zoneForDistance(d), pos: this.pos.clone() });
  }

  update(dt) {
    switch (this.mode) {
      case "flying": {
        this.flightT += dt;
        this.vel.y -= CONFIG.cast.gravity * dt;
        this.group.position.addScaledVector(this.vel, dt);
        this.group.rotation.x += dt * 6;
        if (this.group.position.y <= WATER_Y + 0.02 || this.flightT > 6) this.land();
        break;
      }
      case "floating": {
        this.floatT += dt;
        // dip eases toward its target so bites read as a sharp-but-smooth plunge
        this.dip = lerp(this.dip, this.dipTarget, 1 - Math.exp(-14 * dt));
        this.group.position.y = WATER_Y + 0.05 + Math.sin(this.floatT * 2.1) * 0.035 - this.dip;
        this.group.rotation.x = Math.sin(this.floatT * 1.7) * 0.12 + this.dip * 0.8;
        this.group.rotation.z = Math.cos(this.floatT * 1.4) * 0.1;
        if (this.dipTarget > 0.05 && Math.random() < dt * 6) {
          this.effects.ripple(this.pos, 1.6, 0.8);
        }
        break;
      }
      case "retrieving": {
        const dir = this._scratchDir.subVectors(this.playerSpot, this.pos);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 2.4) {
          this.hide();
          events.emit("bobber:retrieved");
          return;
        }
        dir.normalize();
        this.group.position.addScaledVector(dir, CONFIG.bite.retrieveSpeed * dt);
        this.floatT += dt;
        this.group.position.y = WATER_Y + 0.04 + Math.sin(this.floatT * 9) * 0.03;
        this.rippleTimer -= dt;
        if (this.rippleTimer <= 0) {
          this.effects.ripple(this.pos, 1.2, 0.7);
          this.rippleTimer = 0.16;
        }
        break;
      }
      default:
        break;
    }
  }
}
