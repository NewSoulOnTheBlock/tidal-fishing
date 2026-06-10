// Aiming, charge meter, cast launch math, the angler's rod rig (with bend and
// cast-flick animation), the trajectory preview and the fishing line itself.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { clamp, lerp, degToRad } from "../utils/utils.js";

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

    this.buildRod();
    this.buildPreview();
    this.buildLine();
    this._tip = new THREE.Vector3();
  }

  // ---------- rod ----------

  buildRod() {
    const rodRoot = new THREE.Group();
    rodRoot.position.set(0.42, 1.1, 0.15);
    this.rig.add(rodRoot);
    this.rodRoot = rodRoot;

    const handleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.7 });
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x7d5a36, roughness: 0.55, metalness: 0.1 });

    this.joint0 = new THREE.Group();
    this.joint0.rotation.x = -0.95;
    rodRoot.add(this.joint0);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.34, 8), handleMat);
    handle.position.y = -0.1;
    this.joint0.add(handle);

    const lens = [0.62, 0.56, 0.5];
    const radii = [
      [0.014, 0.019],
      [0.009, 0.014],
      [0.005, 0.009],
    ];
    this.joints = [];
    let parent = this.joint0;
    for (let i = 0; i < 3; i++) {
      const joint = new THREE.Group();
      if (i > 0) joint.position.y = lens[i - 1];
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(radii[i][0], radii[i][1], lens[i], 7),
        rodMat
      );
      seg.position.y = lens[i] / 2;
      seg.castShadow = true;
      joint.add(seg);
      parent.add(joint);
      this.joints.push(joint);
      parent = joint;
    }
    this.tipMarker = new THREE.Object3D();
    this.tipMarker.position.y = lens[2];
    parent.add(this.tipMarker);
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
      new THREE.LineBasicMaterial({ color: 0xdde8ee, transparent: true, opacity: 0.55 })
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
    const sag = dist * 0.085 * (1 - this.lineTension * 0.85);
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

    this.updatePreview(!!opts.previewVisible);
    this.updateLine();
  }

  setBend(t) {
    this.bendTarget = clamp(t, 0, 1);
  }
}
