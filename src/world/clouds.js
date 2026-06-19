// Drifting volumetric-looking cloud layer. Soft puff billboards scattered high
// across the sky, wind-driven and wrapping around the camera so the sky is never
// empty. Opacity ramps with the weather's cloud factor; colour follows the sun
// (warm at dawn/dusk, grey when overcast, deep blue at night) so clouds always
// match the SkySystem's lighting.

import * as THREE from "three";
import { randRange, clamp, lerp } from "../utils/utils.js";

let cachedPuff = null;
const OVERCAST_GREY = new THREE.Color(0x8893a0);

// A single soft, lumpy cloud silhouette baked from overlapping radial blobs.
function makePuffTexture(size = 256) {
  if (cachedPuff) return cachedPuff;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const blobs = 11;
  for (let i = 0; i < blobs; i++) {
    const cx = size * (0.5 + (Math.random() - 0.5) * 0.6);
    const cy = size * (0.52 + (Math.random() - 0.5) * 0.34);
    const r = size * randRange(0.12, 0.26);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.45, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.userData.shared = true;
  cachedPuff = tex;
  return tex;
}

export class CloudLayer {
  constructor(scene, { count = 22 } = {}) {
    this.scene = scene;
    this.spread = 1700;
    this.wind = new THREE.Vector2(1, 0.18).normalize();
    this.group = new THREE.Group();
    this.group.renderOrder = -2;
    const tex = makePuffTexture();

    this._dayCol = new THREE.Color(0xffffff);
    this._tmp = new THREE.Color();
    this.clouds = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      const s = new THREE.Sprite(mat);
      const scale = randRange(220, 560);
      s.scale.set(scale, scale * randRange(0.42, 0.6), 1);
      s.position.set(
        randRange(-this.spread, this.spread),
        randRange(360, 720),
        randRange(-this.spread, this.spread * 0.3)
      );
      s.userData = { baseOp: randRange(0.45, 0.95), speed: randRange(5, 13) };
      this.group.add(s);
      this.clouds.push(s);
    }
    scene.add(this.group);
  }

  /**
   * @param {number} dt
   * @param {object} o
   * @param {number} o.cloudFactor  0 clear .. 1 overcast
   * @param {number} o.dayFactor    0 night .. 1 day
   * @param {THREE.Color} o.sunColor
   * @param {THREE.Vector3} o.cameraPos
   */
  update(dt, { cloudFactor = 0, dayFactor = 1, sunColor, cameraPos }) {
    // base sky-tinted cloud colour: bright by day, warm near the horizon sun,
    // deep slate-blue at night
    this._tmp.setHex(0x2a3a52); // night slate
    this._dayCol.setHex(0xf3f7ff);
    if (sunColor) this._dayCol.lerp(sunColor, 0.35 * (1 - dayFactor) + 0.18);
    this._tmp.lerp(this._dayCol, clamp(dayFactor, 0, 1));
    // overcast clouds go a touch greyer
    this._tmp.lerp(OVERCAST_GREY, cloudFactor * 0.35);

    // a few wispy clouds even when "clear", a full deck when overcast
    const deck = lerp(0.18, 1.0, clamp(cloudFactor, 0, 1));

    const wx = this.wind.x;
    const wz = this.wind.y;
    for (const s of this.clouds) {
      const v = s.userData.speed * dt;
      s.position.x += wx * v;
      s.position.z += wz * v;
      // wrap around the camera so coverage is endless
      const cx = cameraPos ? cameraPos.x : 0;
      const cz = cameraPos ? cameraPos.z : 0;
      if (s.position.x - cx > this.spread) s.position.x -= this.spread * 2;
      if (s.position.x - cx < -this.spread) s.position.x += this.spread * 2;
      if (s.position.z - cz > this.spread) s.position.z -= this.spread * 2;
      if (s.position.z - cz < -this.spread) s.position.z += this.spread * 2;

      s.material.color.copy(this._tmp);
      s.material.opacity = s.userData.baseOp * deck;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.clouds) s.material.dispose();
  }
}
