// Cinematic post-processing pipeline: HDR bloom, volumetric god rays streaming
// from the sun, and a final color-grade pass (contrast/saturation, split-tone,
// vignette and animated film grain). Built on the stock three.js EffectComposer
// so it stays dependency-free.
//
// Pass order:  scene → bloom → god rays → grade → OutputPass(tone map + sRGB)
//
// RenderPass draws into a HalfFloat target (linear HDR) so bloom thresholding
// works on real luminance; OutputPass applies ACES tone mapping + the animated
// exposure the SkySystem drives, exactly once, at the very end.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// --- volumetric light scattering (god rays) -------------------------------
// Radially smears the already-bloomed buffer outward from the sun's screen
// position. Cheap, occlusion-free, and reads as sun shafts once the bright sun
// disc is blooming. Intensity is gated to zero when the sun is off-screen or
// below the horizon (driven from main via SkySystem.dayFactor).
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    lightPos: { value: new THREE.Vector2(0.5, 0.85) },
    intensity: { value: 0.0 },
    decay: { value: 0.94 },
    density: { value: 0.7 },
    weight: { value: 0.22 },
    tint: { value: new THREE.Color(0xfff0d2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 lightPos;
    uniform float intensity;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform vec3 tint;
    varying vec2 vUv;

    const int SAMPLES = 48;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (intensity <= 0.001) { gl_FragColor = base; return; }

      vec2 dir = (vUv - lightPos) * (density / float(SAMPLES));
      vec2 coord = vUv;
      float illum = 1.0;
      vec3 accum = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        coord -= dir;
        vec3 s = texture2D(tDiffuse, coord).rgb;
        // only the very brightest pixels (the sun disc) scatter into rays
        float lum = max(0.0, dot(s, vec3(0.299, 0.587, 0.114)) - 0.55);
        accum += s * lum * illum * weight;
        illum *= decay;
      }
      vec3 rays = accum * tint * intensity;
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }
  `,
};

// --- final color grade: contrast / saturation / split-tone / vignette / grain
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    contrast: { value: 1.06 },
    saturation: { value: 1.14 },
    vignette: { value: 0.34 },
    grain: { value: 0.05 },
    night: { value: 0.0 },
    shadowTint: { value: new THREE.Color(0x0e2a44) },
    highlightTint: { value: new THREE.Color(0xfff2d8) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    uniform float grain;
    uniform float night;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // contrast around mid grey
      c = (c - 0.5) * contrast + 0.5;

      // saturation
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);

      // cinematic split-tone: cool shadows, warm highlights (stronger at night).
      // Kept gentle so it tints rather than brightens the exposure.
      float lum = clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
      vec3 split = mix(shadowTint, highlightTint, smoothstep(0.0, 1.0, lum));
      c = mix(c, c * split * 1.4, 0.08 + night * 0.10);

      // vignette
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.2, dot(d, d) * (2.0 + vignette * 3.0));
      c *= mix(1.0, vig, vignette);

      // animated film grain
      float g = hash(vUv * vec2(1920.0, 1080.0) + time) - 0.5;
      c += g * grain;

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

const QUALITY = {
  high: { bloom: 0.5, godrays: true, grain: 0.05 },
  low: { bloom: 0.34, godrays: false, grain: 0.03 },
};

export class PostFX {
  constructor(renderer, scene, camera, quality = "high") {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = QUALITY[quality] ? quality : "high";
    this.enabled = true;
    this._sun = new THREE.Vector3();

    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    const w = Math.floor(size.x * dpr);
    const h = Math.floor(size.y * dpr);

    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: 2,
    });
    this.composer = new EffectComposer(renderer, target);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // threshold sits above 1.0 so only true HDR highlights (the sun disc,
    // specular glints on the water) bloom — NOT the broadly-bright daytime sky,
    // which would otherwise flood the whole frame with white haze.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), QUALITY[this.quality].bloom, 0.4, 1.15);
    this.composer.addPass(this.bloom);

    this.godrays = new ShaderPass(GodRaysShader);
    this.composer.addPass(this.godrays);

    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.grain.value = QUALITY[this.quality].grain;
    this.composer.addPass(this.grade);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this._applyQualityFlags();
  }

  _applyQualityFlags() {
    const q = QUALITY[this.quality];
    this.bloom.strength = q.bloom;
    this.godrays.enabled = q.godrays;
    this.grade.uniforms.grain.value = q.grain;
  }

  setQuality(quality) {
    if (!QUALITY[quality] || quality === this.quality) return;
    this.quality = quality;
    this._applyQualityFlags();
  }

  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    this.composer.setSize(width, height);
    this.composer.setPixelRatio?.(dpr);
    this.bloom.setSize(width * dpr, height * dpr);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} sunDir   world-space direction to the sun (unit)
   * @param {number} dayFactor       0 night .. 1 day
   * @param {THREE.Color} sunColor   current sun/moon colour
   */
  update(dt, sunDir, dayFactor, sunColor) {
    const gu = this.godrays.uniforms;
    // project the sun onto the screen
    this._sun.copy(sunDir).multiplyScalar(2000).add(this.camera.position);
    const ndc = this._sun.clone().project(this.camera);
    const onScreen =
      ndc.z < 1 && ndc.x > -1.35 && ndc.x < 1.35 && ndc.y > -1.35 && ndc.y < 1.35;
    gu.lightPos.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
    // rays only in daylight, fading as the sun nears/leaves the frame edges
    const edgeFade = onScreen ? 1 - Math.max(Math.abs(ndc.x), Math.abs(ndc.y)) * 0.45 : 0;
    // god rays kept to the barest hint of sun scatter — effectively off
    const target = Math.max(0, dayFactor) * Math.max(0, edgeFade) * 0.025;
    gu.intensity.value += (target - gu.intensity.value) * Math.min(1, dt * 3);
    if (sunColor) gu.tint.value.copy(sunColor).lerp(new THREE.Color(0xffffff), 0.3);

    const grd = this.grade.uniforms;
    grd.time.value = performance.now() * 0.001;
    grd.night.value = 1 - Math.max(0, Math.min(1, dayFactor));
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
    this.bloom.dispose?.();
  }
}
