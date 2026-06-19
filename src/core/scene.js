// Renderer, scene, camera, lights and resize handling.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { clamp } from "../utils/utils.js";

export function createCore(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Fog must exist before the Water shader is built so it compiles with fog support.
  scene.fog = new THREE.FogExp2(0x9fc3c9, 0.00102);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
  );
  camera.position.set(0, 3, 8);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
  sunLight.position.set(40, 60, 20);
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 120;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xbcd9ff, 0x46584a, 0.7);
  scene.add(hemiLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  function setQuality(q) {
    const cfg = CONFIG.quality[q] || CONFIG.quality.high;
    renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1, cfg.pixelRatio));
    renderer.shadowMap.enabled = cfg.shadows;
    sunLight.castShadow = cfg.shadows;
    // force material recompilation so shadow toggles apply cleanly
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  return { renderer, scene, camera, sunLight, hemiLight, ambient, setQuality };
}
