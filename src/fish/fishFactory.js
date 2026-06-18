// Procedural fish meshes built entirely from primitives. Geometry is shared
// across all fish; materials are cached per species. A fish group is built at
// 1 unit body length and scaled to its rolled real-world size.

import * as THREE from "three";
import { clamp } from "../utils/utils.js";
import { buildVoxelFish, hasVoxelModel } from "./voxelFish.js";

const geoCache = {};
const matCache = new Map();

function sharedGeo(key, make) {
  if (!geoCache[key]) {
    geoCache[key] = make();
    geoCache[key].userData.shared = true;
  }
  return geoCache[key];
}

function speciesMaterials(species) {
  if (matCache.has(species.id)) return matCache.get(species.id);
  const { look } = species;
  const body = new THREE.MeshStandardMaterial({
    color: look.colorA,
    roughness: 0.45,
    metalness: 0.25,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: look.colorB,
    roughness: 0.5,
    metalness: 0.15,
  });
  const fin = new THREE.MeshStandardMaterial({
    color: look.finColor,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  if (look.glow) {
    body.emissive = new THREE.Color(look.colorA);
    body.emissiveIntensity = 0.22;
  }
  for (const m of [body, accent, fin]) m.userData.shared = true;
  const mats = { body, accent, fin };
  matCache.set(species.id, mats);
  return mats;
}

// Proportions per silhouette: [bodyHeight, bodyWidth] at unit length.
const SHAPES = {
  standard: { h: 0.32, w: 0.17 },
  slim: { h: 0.24, w: 0.13 },
  long: { h: 0.13, w: 0.11 },
  flat: { h: 0.09, w: 0.34 },
  billed: { h: 0.26, w: 0.15 },
};

/**
 * Builds a fish facing +X (nose at +0.5, tail at -0.5) of unit length,
 * then scales the group so its body length equals sizeCm.
 */
export function createFishMesh(species, sizeCm) {
  const { look } = species;

  // Hand-modeled voxel species (e.g. the Albino Creekfish) build from a .vox
  // model instead of the procedural primitives below.
  if (look.voxel && hasVoxelModel(look.voxel)) {
    const meters = clamp(sizeCm / 100, 0.16, 3.6);
    const wrapper = new THREE.Group();
    wrapper.add(buildVoxelFish(look.voxel));
    wrapper.scale.setScalar(meters);
    wrapper.userData.speciesId = species.id;
    return wrapper;
  }

  const shape = SHAPES[look.shape] || SHAPES.standard;
  const mats = speciesMaterials(species);
  const g = new THREE.Group();

  const bodyGeo = sharedGeo("body", () => new THREE.SphereGeometry(0.5, 20, 14));
  const body = new THREE.Mesh(bodyGeo, mats.body);
  body.scale.set(1, shape.h * 2, shape.w * 2);
  g.add(body);

  // lighter belly: slightly smaller accent-colored sphere nudged downward
  const belly = new THREE.Mesh(bodyGeo, mats.accent);
  belly.scale.set(0.92, shape.h * 1.7, shape.w * 1.85);
  belly.position.y = -shape.h * 0.18;
  g.add(belly);

  const tailGeo = sharedGeo("tail", () => new THREE.ConeGeometry(0.5, 1, 4));
  const tail = new THREE.Mesh(tailGeo, mats.fin);
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(shape.h * 0.85, 0.3, 0.045);
  tail.position.x = -0.58;
  g.add(tail);

  const finGeo = sharedGeo("fin", () => new THREE.ConeGeometry(0.5, 1, 3));
  const dorsal = new THREE.Mesh(finGeo, mats.fin);
  const dorsalH = look.tallDorsal ? 0.46 : 0.22;
  dorsal.scale.set(0.34, dorsalH, 0.03);
  dorsal.position.set(0.02, shape.h + dorsalH * 0.32, 0);
  dorsal.rotation.z = -0.25;
  g.add(dorsal);

  for (const side of [-1, 1]) {
    const pec = new THREE.Mesh(finGeo, mats.fin);
    pec.scale.set(0.16, 0.2, 0.025);
    pec.position.set(0.18, -shape.h * 0.35, side * shape.w * 0.9);
    pec.rotation.set(side * 0.7, 0, 2.4);
    g.add(pec);
  }

  const eyeGeo = sharedGeo("eye", () => new THREE.SphereGeometry(0.035, 8, 8));
  const pupilGeo = sharedGeo("pupil", () => new THREE.SphereGeometry(0.018, 6, 6));
  const eyeMat = sharedMat("eyeWhite", 0xe8f0f4);
  const pupilMat = sharedMat("pupil", 0x0a0e12);
  const eyeY = look.shape === "flat" ? shape.h + 0.02 : shape.h * 0.25;
  const eyeZ = look.shape === "flat" ? 0.06 : shape.w * 0.92;
  for (const side of look.shape === "flat" ? [1] : [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.3, eyeY, side * eyeZ);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0.325, eyeY, side * (eyeZ + 0.012));
    if (look.shape === "flat") {
      eye.position.z = side * 0.05;
      pupil.position.z = side * 0.05;
      pupil.position.y = eyeY + 0.014;
    }
    g.add(eye, pupil);
  }

  if (look.whiskers) {
    const whiskGeo = sharedGeo("whisker", () => new THREE.CylinderGeometry(0.006, 0.002, 0.3, 4));
    for (const side of [-1, 1]) {
      for (const tilt of [0.5, 1.1]) {
        const w = new THREE.Mesh(whiskGeo, mats.fin);
        w.position.set(0.46, -shape.h * 0.2, side * shape.w * 0.5);
        w.rotation.set(side * tilt, 0, -1.85);
        g.add(w);
      }
    }
  }

  if (look.shape === "billed") {
    const billGeo = sharedGeo("bill", () => new THREE.ConeGeometry(0.035, 0.45, 7));
    const bill = new THREE.Mesh(billGeo, mats.fin);
    bill.rotation.z = -Math.PI / 2;
    bill.position.x = 0.68;
    g.add(bill);
  }

  if (look.shape === "long") {
    // stretch the whole silhouette into an eel/sturgeon profile
    g.scale.x = 1.45;
  }

  const meters = clamp(sizeCm / 100, 0.16, 3.6);
  const wrapper = new THREE.Group();
  wrapper.add(g);
  wrapper.scale.setScalar(meters);
  wrapper.userData.speciesId = species.id;
  return wrapper;
}

const basicMats = new Map();
function sharedMat(key, color) {
  if (!basicMats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    m.userData.shared = true;
    basicMats.set(key, m);
  }
  return basicMats.get(key);
}
