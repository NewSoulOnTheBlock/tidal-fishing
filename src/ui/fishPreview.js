// Small self-contained animated 3D fish preview. Builds the real in-game fish
// model (voxel or procedural) via createFishMesh, frames it in its own tiny
// WebGL renderer and slowly turns it so the leaderboard can show a "trophy"
// rotating model of the selected species. Each instance owns its WebGL context
// and MUST be disposed (call dispose()) when removed from the DOM.

import * as THREE from "three";
import { FISH_BY_ID } from "../data/fishData.js";
import { createFishMesh } from "../fish/fishFactory.js";

/**
 * @param {string} speciesId
 * @param {{ width?: number, height?: number, preserveBuffer?: boolean }} [opts]
 *   preserveBuffer keeps the drawing buffer readable so html2canvas can
 *   screenshot the live WebGL canvas (used by the shareable catch card).
 * @returns {{ canvas: HTMLCanvasElement, dispose: () => void } | null}
 */
export function createFishPreview(speciesId, opts = {}) {
  const species = FISH_BY_ID[speciesId];
  if (!species) return null;

  const width = Math.round(opts.width || 300);
  const height = Math.round(opts.height || 190);

  const canvas = document.createElement("canvas");
  canvas.className = "fish-preview-canvas";

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: !!opts.preserveBuffer,
    });
  } catch {
    return null; // No WebGL available — caller falls back to the static image.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.01, 100);

  // Lighting tuned brighter than the game scene so colors read on a dark card.
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0x88bbff, 1.1);
  rim.position.set(-4, 2, -4);
  const hemi = new THREE.HemisphereLight(0xbcd9ff, 0x44504a, 1.1);
  const amb = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(key, rim, hemi, amb);

  // Build the real fish model at a fixed ~1-unit length for consistent framing.
  const fish = createFishMesh(species, 100);

  // Center the model at the origin so it spins in place.
  const box = new THREE.Box3().setFromObject(fish);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  fish.position.set(-center.x, -center.y, -center.z);

  const pivot = new THREE.Group();
  pivot.add(fish);
  pivot.rotation.y = -0.6; // start on a flattering 3/4 view
  scene.add(pivot);

  // Frame the camera to fit the longest dimension with comfortable padding so
  // the silhouette never clips as it rotates.
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fitDist = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(0, maxDim * 0.18, fitDist * 1.7);
  camera.lookAt(0, 0, 0);

  let raf = 0;
  let running = true;
  const t0 = performance.now();

  function frame(now) {
    if (!running) return;
    const t = (now - t0) / 1000;
    pivot.rotation.y = -0.6 + t * 0.6;          // slow turntable spin
    pivot.rotation.z = Math.sin(t * 1.2) * 0.07; // gentle swim roll
    pivot.position.y = Math.sin(t * 1.6) * 0.03; // subtle bob
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function dispose() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      const g = o.geometry;
      if (g && !g.userData?.shared) g.dispose();
      const m = o.material;
      if (m) {
        const list = Array.isArray(m) ? m : [m];
        for (const mat of list) if (!mat.userData?.shared) mat.dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  return { canvas, dispose };
}
