// Dynamic sky + sun + moon-lit nights + stars, driving the scene lighting,
// fog, water sun uniforms and tone-mapping exposure from the game clock.

import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { lerp, clamp, smoothstep01, degToRad } from "../utils/utils.js";

export class SkySystem {
  constructor(scene, renderer, sunLight, hemiLight, ambient, water) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunLight = sunLight;
    this.hemiLight = hemiLight;
    this.ambient = ambient;
    this.water = water;

    this.sky = new Sky();
    this.sky.scale.setScalar(3000);
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Color(0xffffff);
    this.dayFactor = 1;

    this.stars = this.buildStars();
    scene.add(this.stars);

    this._fogDay = new THREE.Color();
    this._fogNight = new THREE.Color();
    this._fogMix = new THREE.Color();
    this._duskTint = new THREE.Color(0xff9a5e);
    this._hemiSkyDay = new THREE.Color(0xbcd9ff);
    this._hemiSkyNight = new THREE.Color(0x1c2b4a);
    this._hemiGndDay = new THREE.Color(0x46584a);
    this._hemiGndNight = new THREE.Color(0x0c1218);
    this._sunWarm = new THREE.Color(0xffb46b);
    this._sunWhite = new THREE.Color(0xfff4e0);
    this._moonBlue = new THREE.Color(0x90b4e8);

    // Environment map baked from the sky for image-based lighting / reflections
    // on the voxel models, gear and water. Re-baked when the time segment
    // changes (see bakeEnv) so reflections track dawn/day/dusk/night.
    this._pmrem = null;
    this._envScene = null;
    this._envSky = null;
    this._envRT = null;
  }

  /**
   * Render the current sky into a prefiltered environment map and assign it to
   * scene.environment so every PBR material picks up sky-coloured ambient light
   * and subtle reflections. Cheap enough to call on each time-of-day segment.
   */
  bakeEnv() {
    if (!this._pmrem) {
      this._pmrem = new THREE.PMREMGenerator(this.renderer);
      this._envScene = new THREE.Scene();
      this._envSky = new Sky();
      this._envSky.scale.setScalar(3000);
      this._envScene.add(this._envSky);
    }
    const su = this._envSky.material.uniforms;
    const cu = this.sky.material.uniforms;
    su.sunPosition.value.copy(cu.sunPosition.value);
    su.turbidity.value = cu.turbidity.value;
    su.rayleigh.value = cu.rayleigh.value;
    su.mieCoefficient.value = cu.mieCoefficient.value;
    su.mieDirectionalG.value = cu.mieDirectionalG.value;

    if (this._envRT) this._envRT.dispose();
    this._envRT = this._pmrem.fromScene(this._envScene, 0, 1, 12000);
    this.scene.environment = this._envRT.texture;
  }

  buildStars() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // random points on the upper hemisphere of a big shell
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.95);
      const r = 1900;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 30;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcfe2ff,
      size: 2.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.renderOrder = -1;
    return points;
  }

  /**
   * @param {number} hours      0-24 game time
   * @param {number} cloud      0 clear, 1 fully cloudy
   * @param {object} loc        active location definition (sky/fog params)
   */
  update(hours, cloud, loc) {
    const elevDeg = Math.sin(((hours - 6) / 12) * Math.PI) * 62;
    const azimuthDeg = 95 + (hours / 24) * 360 * 0.5 + ((hours - 6) / 12) * 40; // east -> west sweep
    const isDay = elevDeg > -2;

    // day/night blend factor: 0 = deep night, 1 = full day
    const f = smoothstep01((elevDeg + 10) / 22);
    this.dayFactor = f;

    // The Sky shader renders the sun where sunPosition points; at night we
    // park it below the horizon and let the moon take over the light rig.
    const phi = degToRad(90 - elevDeg);
    const theta = degToRad(azimuthDeg);
    this.sunDir.setFromSphericalCoords(1, phi, theta);

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = loc.sky.turbidity + cloud * 9;
    u.rayleigh.value = Math.max(0.08, loc.sky.rayleigh * lerp(0.12, 1, f)) * (1 - cloud * 0.35);
    u.mieCoefficient.value = loc.sky.mieCoefficient + cloud * 0.004;
    u.mieDirectionalG.value = loc.sky.mieDirectionalG;

    // light rig: sun by day, soft blue moon by night
    const horizonWarmth = clamp(1 - Math.abs(elevDeg) / 18, 0, 1);
    if (isDay) {
      this.sunColor.copy(this._sunWhite).lerp(this._sunWarm, horizonWarmth);
      this.sunLight.color.copy(this.sunColor);
      this.sunLight.intensity = lerp(0.15, 2.9, f) * (1 - cloud * 0.4);
      this.sunLight.position.copy(this.sunDir).multiplyScalar(120);
    } else {
      const moonDir = this.sunDir.clone().multiplyScalar(-1);
      moonDir.y = Math.abs(moonDir.y) * 0.7 + 0.25;
      this.sunColor.copy(this._moonBlue);
      this.sunLight.color.copy(this._moonBlue);
      this.sunLight.intensity = 0.62 * (1 - cloud * 0.3);
      this.sunLight.position.copy(moonDir).normalize().multiplyScalar(120);
    }

    this.hemiLight.color.copy(this._hemiSkyNight).lerp(this._hemiSkyDay, f);
    this.hemiLight.groundColor.copy(this._hemiGndNight).lerp(this._hemiGndDay, f);
    this.hemiLight.intensity = lerp(0.4, 0.78, f) * (1 - cloud * 0.2);
    this.ambient.intensity = lerp(0.14, 0.17, f);

    // fog: blend location palettes, tint warm at dawn/dusk, thicken at night/clouds
    this._fogDay.setHex(loc.fog.day);
    this._fogNight.setHex(loc.fog.night);
    this._fogMix.copy(this._fogNight).lerp(this._fogDay, f);
    if (isDay) this._fogMix.lerp(this._duskTint, horizonWarmth * 0.35);
    this.scene.fog.color.copy(this._fogMix);
    this.scene.fog.density = loc.fog.density * (1 + (1 - f) * 0.55 + cloud * 0.35);

    this.renderer.toneMappingExposure = lerp(0.42, 0.58, f);

    this.stars.material.opacity = (1 - f) * (1 - cloud * 0.8) * 0.9;

    // water picks up the active light source
    this.water.setSun(
      isDay ? this.sunDir : this.sunLight.position.clone().normalize(),
      this.sunColor
    );
  }
}
