// Night-sky spectacle: a shimmering aurora curtain wrapping the horizon, a dense
// Milky Way star band arcing overhead, and occasional shooting stars. Everything
// fades in with the night factor (1 - dayFactor) so it's invisible by day and
// glows once the sun sets. Designed to catch the bloom pass.

import * as THREE from "three";
import { randRange } from "../utils/utils.js";

const AuroraShader = {
  uniforms: {
    time: { value: 0 },
    intensity: { value: 0 },
    colA: { value: new THREE.Color(0x36ffb0) },
    colB: { value: new THREE.Color(0x2bd6ff) },
    colC: { value: new THREE.Color(0x9a6bff) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float time;
    uniform float intensity;
    uniform vec3 colA;
    uniform vec3 colB;
    uniform vec3 colC;
    varying vec2 vUv;

    // cheap hash noise
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n = i.x + i.y * 57.0;
      return mix(mix(hash(n), hash(n + 1.0), f.x),
                 mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y);
    }

    void main() {
      // vertical curtains that wave horizontally over time
      float x = vUv.x * 8.0;
      float wave = noise(vec2(x, time * 0.05)) * 0.5 + noise(vec2(x * 2.3, time * 0.08)) * 0.25;
      float curtain = sin((vUv.x * 28.0) + wave * 9.0 + time * 0.3) * 0.5 + 0.5;
      curtain = pow(curtain, 2.2);

      // brightest near the bottom of the band, fading to the top
      float vert = pow(1.0 - vUv.y, 1.6);
      float ray = curtain * vert;

      // streak detail rising upward
      ray *= 0.6 + 0.4 * noise(vec2(vUv.x * 14.0, vUv.y * 4.0 - time * 0.25));

      vec3 col = mix(colA, colB, vUv.x);
      col = mix(col, colC, smoothstep(0.4, 1.0, vUv.y));
      gl_FragColor = vec4(col * ray * intensity, ray * intensity);
    }
  `,
};

export class NightSky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = -3;
    scene.add(this.group);

    // --- aurora curtain: an open cylinder band surrounding the scene ---
    const auroraGeo = new THREE.CylinderGeometry(1500, 1500, 520, 64, 1, true);
    this.auroraMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(AuroraShader.uniforms),
      vertexShader: AuroraShader.vertexShader,
      fragmentShader: AuroraShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const aurora = new THREE.Mesh(auroraGeo, this.auroraMat);
    aurora.position.y = 560;
    this.aurora = aurora;
    this.group.add(aurora);

    // --- Milky Way: a dense, faintly coloured star band on a tilted great circle
    this.milky = this.buildMilkyWay();
    this.group.add(this.milky);

    // --- shooting stars pool ---
    this.shooters = Array.from({ length: 3 }, () => new ShootingStar(this.group));
    this.shootTimer = randRange(4, 10);

    this._nf = 0;
  }

  buildMilkyWay() {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const r = 1850;
    const tilt = 0.5;
    const cA = new THREE.Color(0xbfd4ff);
    const cB = new THREE.Color(0xffe6c4);
    for (let i = 0; i < count; i++) {
      // cluster along a band: small latitude spread around a tilted equator
      const lon = Math.random() * Math.PI * 2;
      const lat = (Math.random() - 0.5) * 0.42 + Math.sin(lon * 3.0) * 0.05;
      let x = Math.cos(lat) * Math.cos(lon);
      let y = Math.sin(lat);
      let z = Math.cos(lat) * Math.sin(lon);
      // tilt the band off the horizon
      const ny = y * Math.cos(tilt) - z * Math.sin(tilt);
      const nz = y * Math.sin(tilt) + z * Math.cos(tilt);
      positions[i * 3] = x * r;
      positions[i * 3 + 1] = Math.abs(ny) * r + 120;
      positions[i * 3 + 2] = nz * r;
      const c = cA.clone().lerp(cB, Math.random());
      const b = randRange(0.3, 1);
      colors[i * 3] = c.r * b;
      colors[i * 3 + 1] = c.g * b;
      colors[i * 3 + 2] = c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -3;
    return pts;
  }

  /**
   * @param {number} dt
   * @param {number} dayFactor 0 night .. 1 day
   * @param {THREE.Vector3} cameraPos
   */
  update(dt, dayFactor, cameraPos) {
    const night = Math.max(0, Math.min(1, 1 - dayFactor));
    this._nf = night;
    if (cameraPos) {
      this.group.position.x = cameraPos.x;
      this.group.position.z = cameraPos.z;
    }

    this.auroraMat.uniforms.time.value += dt;
    this.auroraMat.uniforms.intensity.value = night * 0.55;
    this.aurora.visible = night > 0.02;

    this.milky.material.opacity = night * 0.8;
    this.milky.visible = night > 0.02;

    // shooting stars only deep into the night
    if (night > 0.45) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        const free = this.shooters.find((s) => !s.active);
        if (free) free.fire();
        this.shootTimer = randRange(3, 11);
      }
    }
    for (const s of this.shooters) s.update(dt, night);
  }

  dispose() {
    this.scene.remove(this.group);
    this.auroraMat.dispose();
    this.aurora.geometry.dispose();
    this.milky.material.dispose();
    this.milky.geometry.dispose();
    for (const s of this.shooters) s.dispose();
  }
}

class ShootingStar {
  constructor(parent) {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(2 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.line = new THREE.Line(geo, this.mat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    parent.add(this.line);
    this.active = false;
    this.t = 0;
    this.dur = 1;
    this.from = new THREE.Vector3();
    this.vel = new THREE.Vector3();
  }

  fire() {
    this.active = true;
    this.t = 0;
    this.dur = randRange(0.6, 1.1);
    const ang = randRange(0, Math.PI * 2);
    const r = 1600;
    this.from.set(Math.cos(ang) * r, randRange(500, 950), Math.sin(ang) * r);
    // travel roughly across + downward
    this.vel.set(randRange(-1, 1), randRange(-0.5, -0.2), randRange(-1, 1))
      .normalize()
      .multiplyScalar(randRange(1400, 2200));
    this.line.visible = true;
  }

  update(dt, night) {
    if (!this.active) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.active = false;
      this.line.visible = false;
      return;
    }
    const head = this.from.clone().addScaledVector(this.vel, this.t);
    const tail = head.clone().addScaledVector(this.vel, -0.06);
    this.positions.set([head.x, head.y, head.z, tail.x, tail.y, tail.z]);
    this.line.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = Math.sin(k * Math.PI) * night;
  }

  dispose() {
    this.line.geometry.dispose();
    this.mat.dispose();
  }
}
