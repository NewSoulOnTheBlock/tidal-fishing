// A small, self-contained Three.js viewer used in the character chooser. It
// renders a single voxel GLB on a turntable so the player can see the body
// they'll fish as. It owns its own renderer/scene/camera and render loop, and
// must be dispose()d when the chooser closes.
//
// Models are normalised exactly like the in-game angler body (centre X/Z, feet
// at y = 0, scaled to 1 unit tall) so the framing is consistent regardless of
// the source model's authored scale.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function createCharacterPreview(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  camera.position.set(0, 0.62, 2.45);

  // Lighting tuned to read voxel models clearly from any angle.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3b4d, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fd8ff, 0.55);
  fill.position.set(-3, 1.5, -2);
  scene.add(fill);

  // turntable: spins continuously; inner holder recenters + scales the model.
  const turntable = new THREE.Group();
  scene.add(turntable);

  const loader = new GLTFLoader();
  let current = null; // { holder, dispose }
  let loadToken = 0;
  let baseYaw = 0;

  function clearCurrent() {
    if (!current) return;
    turntable.remove(current.holder);
    current.holder.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      }
    });
    current = null;
  }

  function setModel(url, opts = {}) {
    baseYaw = THREE.MathUtils.degToRad(opts.yawDeg || 0);
    turntable.rotation.y = baseYaw;
    const token = ++loadToken;
    container.classList.add("cc-loading");
    loader.load(
      url,
      (gltf) => {
        if (token !== loadToken) return;
        clearCurrent();
        const model = gltf.scene;
        const holder = new THREE.Group();
        holder.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const h = size.y || 1;
        holder.scale.setScalar(1 / h);
        // recentre on X/Z, feet at y = 0 (post-scale)
        holder.position.set((-center.x) / h, (-box.min.y) / h, (-center.z) / h);

        model.traverse((o) => {
          if (o.isMesh) o.frustumCulled = false;
        });

        turntable.add(holder);
        current = { holder };
        container.classList.remove("cc-loading");
      },
      undefined,
      () => {
        if (token === loadToken) container.classList.remove("cc-loading");
      }
    );
  }

  function resize() {
    const w = container.clientWidth || 1;
    const ht = container.clientHeight || 1;
    renderer.setSize(w, ht, false);
    camera.aspect = w / ht;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const target = new THREE.Vector3(0, 0.55, 0);
  let raf = 0;
  let last = performance.now();
  let running = true;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    turntable.rotation.y += dt * 0.6; // gentle spin
    camera.lookAt(target);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setModel,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      clearCurrent();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
