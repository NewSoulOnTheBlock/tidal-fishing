// Over-the-shoulder camera with smooth follow, aim-yaw tracking, fight focus,
// charge FOV pull and decaying shake. Also drives the slow menu orbit.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { lerp, clamp } from "../utils/utils.js";

const UP = new THREE.Vector3(0, 1, 0);
const _camRight = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = "menu"; // 'menu' | 'play'
    this.anchor = new THREE.Vector3(0, 0.7, -2);
    this.aimYaw = 0;
    this.fovPulse = 0; // 0..1 while charging
    this.shakeAmt = 0;
    this.focus = null; // Vector3 to look at during fights
    this.menuT = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this.snapNext = true;
  }

  setAnchor(pos) {
    this.anchor.copy(pos);
    this.snapNext = true;
  }

  setMode(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.snapNext = true;
    }
  }

  setAimYaw(yaw) {
    this.aimYaw = yaw;
  }

  setFovPulse(p) {
    this.fovPulse = clamp(p, 0, 1);
  }

  setFocus(point) {
    this.focus = point;
  }

  addShake(amount) {
    this.shakeAmt = Math.min(this.shakeAmt + amount, 0.8);
  }

  update(dt) {
    const cam = this.camera;
    const C = CONFIG.camera;

    if (this.mode === "menu") {
      this.menuT += dt * 0.05;
      const r = 13;
      this._desired.set(
        this.anchor.x + Math.sin(this.menuT) * r,
        this.anchor.y + 3.6,
        this.anchor.z + Math.cos(this.menuT * 0.7) * 6 + 9
      );
      // gaze sweeps along the horizon so sky, water and shoreline all read
      this._look.set(this.anchor.x - Math.sin(this.menuT) * 10, 2.4, this.anchor.z - 42);
      const k = this.snapNext ? 1 : 1 - Math.exp(-1.6 * dt);
      this._pos.lerp(this._desired, k);
      if (this.snapNext) this._pos.copy(this._desired);
      cam.position.copy(this._pos);
      cam.lookAt(this._look);
      cam.fov = lerp(cam.fov, C.fov + 4, 1 - Math.exp(-2 * dt));
      cam.updateProjectionMatrix();
      this.snapNext = false;
      return;
    }

    // play mode: behind and slightly right of the angler, facing the aim
    const yaw = this.aimYaw;
    this._dir.set(Math.sin(yaw), 0, -Math.cos(yaw));
    const right = _camRight.set(Math.cos(yaw), 0, Math.sin(yaw));

    this._desired
      .copy(this.anchor)
      .addScaledVector(this._dir, -C.back)
      .addScaledVector(right, C.side)
      .addScaledVector(UP, C.height);

    if (this.focus) {
      this._look.copy(this.focus);
      this._look.y = Math.max(this._look.y, 0.2);
      // pull the look point a bit toward the horizon so the fish isn't dead-center low
      this._look.addScaledVector(this._dir, 2);
    } else {
      this._look.copy(this.anchor).addScaledVector(this._dir, 16);
      this._look.y = 0.6;
    }

    const k = this.snapNext ? 1 : 1 - Math.exp(-6 * dt);
    this._pos.lerp(this._desired, k);
    if (this.snapNext) this._pos.copy(this._desired);

    // decaying shake
    this.shakeAmt *= Math.exp(-5.5 * dt);
    const sh = this.shakeAmt;
    cam.position.set(
      this._pos.x + (Math.random() - 0.5) * sh * 0.5,
      this._pos.y + (Math.random() - 0.5) * sh * 0.35,
      this._pos.z + (Math.random() - 0.5) * sh * 0.5
    );
    cam.lookAt(this._look);

    const targetFov = C.fov - this.fovPulse * C.chargeFovDrop;
    cam.fov = lerp(cam.fov, targetFov, 1 - Math.exp(-8 * dt));
    cam.updateProjectionMatrix();
    this.snapNext = false;
  }
}
