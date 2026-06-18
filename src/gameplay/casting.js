// Aiming, charge meter, cast launch math, the angler's rod rig (with bend and
// cast-flick animation), the trajectory preview and the fishing line itself.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { clamp, lerp, degToRad } from "../utils/utils.js";
import { rodLook, reelLook, lineLook } from "../data/gearLooks.js";

const LINE_POINTS = 22;

export class CastingSystem {
  constructor(scene) {
    this.scene = scene;

    // rig group sits at the player spot and rotates with aim
    this.rig = new THREE.Group();
    scene.add(this.rig);

    this.aimYaw = 0;
    this.targetYaw = 0;
    this.pointerX = 0.5;
    this.charging = false;
    this.chargeT = 0;
    this.power = 0;
    this.castMult = 1;
    this.lineTension = 0;
    this.lineTarget = null;
    this.flickT = 1; // >= 1 means the cast flick animation is finished
    this.swayT = 0;
    this.bend = 0;
    this.bendTarget = 0;

    // cosmetic gear looks (colour + shape); default to tier-0 gear until the
    // equipped looks are applied via applyGear()/applyLine().
    this._rodLook = rodLook(0);
    this._reelLook = reelLook(0);
    this._lineLook = lineLook(0);
    this._lineSagMult = this._lineLook.sagMult;
    this._reelSpin = 0;

    this.buildRod();
    this.buildPreview();
    this.buildLine();
    this._tip = new THREE.Vector3();
  }

  // ---------- rod ----------

  buildRod() {
    const look = this._rodLook;
    const rodRoot = new THREE.Group();
    rodRoot.position.set(0.42, 1.1, 0.15);
    this.rig.add(rodRoot);
    this.rodRoot = rodRoot;

    const rodMat = new THREE.MeshStandardMaterial({
      color: look.color,
      roughness: 0.5,
      metalness: 0.25,
      emissive: look.glow ? look.color : 0x000000,
      emissiveIntensity: look.glow ? look.glowI : 0,
    });
    const handleMat = new THREE.MeshStandardMaterial({ color: look.handle, roughness: 0.75 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: look.accent,
      roughness: 0.4,
      metalness: 0.55,
      emissive: look.glow ? look.accent : 0x000000,
      emissiveIntensity: look.glow ? look.glowI * 0.8 : 0,
    });

    this.joint0 = new THREE.Group();
    this.joint0.rotation.x = -0.95;
    rodRoot.add(this.joint0);

    const hr = look.thickScale;
    const handleLen = 0.34;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024 * hr, 0.03 * hr, handleLen, 8),
      handleMat
    );
    handle.position.y = -0.1;
    handle.castShadow = true;
    this.joint0.add(handle);
    this._handleTopY = -0.1 + handleLen / 2;

    const baseLens = [0.62, 0.56, 0.5];
    const baseRadii = [
      [0.014, 0.019],
      [0.009, 0.014],
      [0.005, 0.009],
    ];
    const lens = baseLens.map((l) => l * look.lenScale);
    this.joints = [];
    let parent = this.joint0;
    for (let i = 0; i < 3; i++) {
      const joint = new THREE.Group();
      if (i > 0) joint.position.y = lens[i - 1];
      const r0 = baseRadii[i][0] * hr;
      const r1 = baseRadii[i][1] * hr;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, lens[i], 7), rodMat);
      seg.position.y = lens[i] / 2;
      seg.castShadow = true;
      joint.add(seg);

      // accent wraps / line guides along the blank — more on higher tiers
      if (look.family >= 1) {
        const guides = Math.max(1, Math.round(look.wraps / 3));
        for (let g = 1; g <= guides; g++) {
          const yt = (g / (guides + 1)) * lens[i];
          const rr = lerp(r0, r1, yt / lens[i]) * 1.5 + 0.004;
          const wrap = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.012, 8), accentMat);
          wrap.position.y = yt;
          joint.add(wrap);
        }
      }

      parent.add(joint);
      this.joints.push(joint);
      parent = joint;
    }

    this.tipMarker = new THREE.Object3D();
    this.tipMarker.position.y = lens[2];
    parent.add(this.tipMarker);

    // glowing tip bead for crystal / cosmic rods
    if (look.tipBead) {
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.005 * hr + 0.016, 10, 8),
        accentMat
      );
      this.tipMarker.add(bead);
    }

    this.buildReel();
  }

  // Small procedural spinning-reel mesh mounted under the grip. Rebuilt with the
  // rod (it lives under joint0, so disposeRod() cleans it up too).
  buildReel() {
    const look = this._reelLook;
    const reel = new THREE.Group();
    // sit just below the grip top, tucked under the rod
    reel.position.set(0, this._handleTopY - 0.04, -0.05);
    this.joint0.add(reel);
    this.reel = reel;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: look.color,
      roughness: 0.42,
      metalness: 0.6,
      emissive: look.glow ? look.color : 0x000000,
      emissiveIntensity: look.glow ? look.glowI : 0,
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: look.rim, roughness: 0.35, metalness: 0.65 });
    const crankMat = new THREE.MeshStandardMaterial({ color: look.handle, roughness: 0.6 });

    // Spinning assembly: a static `tilt` lays the spool axis along local X, and
    // an inner `spin` group rotates about ITS OWN Y (= the cylinder axis = X),
    // so spinning is unambiguous regardless of the parent tilt.
    const tilt = new THREE.Group();
    tilt.rotation.z = Math.PI / 2;
    reel.add(tilt);
    const spin = new THREE.Group();
    tilt.add(spin);
    this._reelSpool = spin;

    const spool = new THREE.Mesh(
      new THREE.CylinderGeometry(look.spoolR, look.spoolR, look.spoolW, 16),
      bodyMat
    );
    spool.castShadow = true;
    spin.add(spool);

    const discGeo = new THREE.CylinderGeometry(look.discR, look.discR, look.spoolW * 0.2, 18);
    const dEast = new THREE.Mesh(discGeo, rimMat);
    dEast.position.y = look.spoolW / 2;
    const dWest = new THREE.Mesh(discGeo, rimMat);
    dWest.position.y = -look.spoolW / 2;
    spin.add(dEast, dWest);

    // crank: axle out of the outer disc, a radial bar, and a knob — all orbit on spin
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), crankMat);
    axle.position.y = look.spoolW / 2 + 0.015;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, look.discR * 0.9), crankMat);
    bar.position.set(0, look.spoolW / 2 + 0.03, look.discR * 0.45);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), crankMat);
    knob.position.set(0, look.spoolW / 2 + 0.03, look.discR * 0.9);
    spin.add(axle, bar, knob);

    // foot connecting the reel up to the rod blank (static)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.04, 0.018), crankMat);
    foot.position.set(0, look.spoolR + 0.02, 0);
    reel.add(foot);
  }

  disposeRod() {
    if (!this.rodRoot) return;
    this.rodRoot.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      }
    });
    this.rig.remove(this.rodRoot);
    this.rodRoot = null;
    this._reelSpool = null;
  }

  /** Apply equipped gear looks. rod/reel rebuild the rig; line just retints. */
  applyGear({ rod, reel, line } = {}) {
    if (rod) this._rodLook = rod;
    if (reel) this._reelLook = reel;
    if (rod || reel) {
      this.disposeRod();
      this.buildRod();
    }
    if (line) this.applyLine(line);
  }

  applyLine(look) {
    this._lineLook = look;
    this._lineSagMult = look.sagMult ?? 1;
    if (this.line) {
      this.line.material.color.setHex(look.color);
      this.line.material.opacity = look.opacity;
    }
  }

  attachTo(playerSpot) {
    this.rig.position.copy(playerSpot);
    this.aimYaw = 0;
    this.targetYaw = 0;
    this.rig.rotation.y = 0;
  }

  tipPos() {
    return this.tipMarker.getWorldPosition(this._tip);
  }

  get dir() {
    return new THREE.Vector3(Math.sin(this.aimYaw), 0, -Math.cos(this.aimYaw));
  }

  // ---------- aiming & charging ----------

  setPointerX(normX) {
    this.pointerX = clamp(normX, 0, 1);
  }

  /** Steer the rod toward an arbitrary world point (used during the fight). */
  aimAtPoint(p) {
    const dx = p.x - this.rig.position.x;
    const dz = p.z - this.rig.position.z;
    this.targetYaw = Math.atan2(dx, -dz);
  }

  beginCharge() {
    this.charging = true;
    this.chargeT = 0;
    this.power = 0;
  }

  /** Stops the meter, plays the flick, returns final power 0..1. */
  endCharge() {
    this.charging = false;
    this.flickT = 0;
    return this.power;
  }

  cancelCharge() {
    this.charging = false;
    this.power = 0;
  }

  /** power -> world-space launch state for the bobber. */
  computeLaunch(power, castMult) {
    const C = CONFIG.cast;
    const maxDist = C.baseMaxDist * castMult;
    const dist = lerp(C.minDist, maxDist, Math.pow(power, C.powerCurve));
    const theta = degToRad(C.launchAngleDeg);
    const v = Math.sqrt((dist * C.gravity) / Math.sin(2 * theta));
    const dir = this.dir;
    const velocity = new THREE.Vector3(
      dir.x * v * Math.cos(theta),
      v * Math.sin(theta),
      dir.z * v * Math.cos(theta)
    );
    return { origin: this.tipPos().clone(), velocity, dist };
  }

  // ---------- trajectory preview ----------

  buildPreview() {
    const max = 48;
    this.previewPositions = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.previewPositions, 3));
    geo.setDrawRange(0, 0);
    this.previewMat = new THREE.PointsMaterial({
      color: 0xbfe9ff,
      size: 0.09,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.preview = new THREE.Points(geo, this.previewMat);
    this.preview.frustumCulled = false;
    this.scene.add(this.preview);

    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 28);
    this.previewRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    this.previewRing.rotation.x = -Math.PI / 2;
    this.previewRing.renderOrder = 2;
    this.scene.add(this.previewRing);
  }

  updatePreview(visible) {
    if (!visible) {
      this.preview.visible = false;
      this.previewRing.visible = false;
      return;
    }
    const power = this.charging ? this.power : 0.5;
    const { origin, velocity } = this.computeLaunch(power, this.castMult);
    const pos = origin.clone();
    const vel = velocity.clone();
    const step = 1 / 28;
    let count = 0;
    const max = 48;
    while (count < max) {
      this.previewPositions[count * 3] = pos.x;
      this.previewPositions[count * 3 + 1] = pos.y;
      this.previewPositions[count * 3 + 2] = pos.z;
      count++;
      vel.y -= CONFIG.cast.gravity * step;
      pos.addScaledVector(vel, step);
      if (pos.y <= CONFIG.water.level) break;
    }
    this.preview.geometry.setDrawRange(0, count);
    this.preview.geometry.attributes.position.needsUpdate = true;
    this.preview.visible = true;
    this.previewMat.opacity = this.charging ? 0.75 : 0.3;
    this.previewRing.position.set(pos.x, CONFIG.water.level + 0.03, pos.z);
    this.previewRing.material.opacity = this.charging ? 0.6 : 0.25;
    this.previewRing.visible = true;
  }

  // ---------- fishing line ----------

  buildLine() {
    this.linePositions = new Float32Array(LINE_POINTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.linePositions, 3));
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: this._lineLook.color,
        transparent: true,
        opacity: this._lineLook.opacity,
      })
    );
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);
  }

  setLineTarget(target) {
    this.lineTarget = target;
  }

  setLineTension(t) {
    this.lineTension = clamp(t, 0, 1);
  }

  updateLine() {
    if (!this.lineTarget) {
      this.line.visible = false;
      return;
    }
    const tip = this.tipPos();
    const end = this.lineTarget;
    const dist = tip.distanceTo(end);
    const sag = dist * 0.085 * (1 - this.lineTension * 0.85) * (this._lineSagMult ?? 1);
    for (let i = 0; i < LINE_POINTS; i++) {
      const t = i / (LINE_POINTS - 1);
      const x = lerp(tip.x, end.x, t);
      const y = lerp(tip.y, end.y, t) - Math.sin(t * Math.PI) * sag;
      const z = lerp(tip.z, end.z, t);
      this.linePositions[i * 3] = x;
      this.linePositions[i * 3 + 1] = y;
      this.linePositions[i * 3 + 2] = z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.visible = true;
  }

  // ---------- per-frame ----------

  /**
   * @param {number} dt
   * @param {object} opts { aiming, previewVisible }
   */
  update(dt, opts = {}) {
    if (opts.aiming) {
      const maxYaw = degToRad(CONFIG.cast.aimMaxYawDeg);
      this.targetYaw = lerp(-maxYaw, maxYaw, this.pointerX);
    }
    this.aimYaw = lerp(this.aimYaw, this.targetYaw, 1 - Math.exp(-10 * dt));
    this.rig.rotation.y = -this.aimYaw;

    if (this.charging) {
      this.chargeT += dt;
      const u = this.chargeT / CONFIG.cast.chargeTime;
      this.power = 1 - Math.abs((u % 2) - 1); // triangle wave 0->1->0
    }

    // rod animation: idle sway + charge pull-back + cast flick + fight bend
    this.swayT += dt;
    let baseAngle = -0.95 + Math.sin(this.swayT * 1.3) * 0.012;
    if (this.charging) baseAngle -= this.power * 0.45;

    if (this.flickT < 1) {
      this.flickT = Math.min(1, this.flickT + dt / 0.42);
      const t = this.flickT;
      // quick whip forward, then settle back to neutral
      if (t < 0.3) baseAngle += lerp(0, 0.62, t / 0.3);
      else baseAngle += lerp(0.62, 0, (t - 0.3) / 0.7);
    }
    this.joint0.rotation.x = baseAngle;

    this.bend = lerp(this.bend, this.bendTarget, 1 - Math.exp(-8 * dt));
    this.joints[1].rotation.x = -this.bend * 0.3;
    this.joints[2].rotation.x = -this.bend * 0.55;

    // reel spool spins during the cast flick, then eases back to rest
    if (this._reelSpool) {
      const target = this.flickT < 1 ? 18 : 0;
      this._reelSpin = lerp(this._reelSpin, target, 1 - Math.exp(-6 * dt));
      this._reelSpool.rotation.y += this._reelSpin * dt;
    }

    this.updatePreview(!!opts.previewVisible);
    this.updateLine();
  }

  setBend(t) {
    this.bendTarget = clamp(t, 0, 1);
  }
}
