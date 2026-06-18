// Builds a fish mesh from MagicaVoxel voxel data instead of the procedural
// primitives in fishFactory.js. Used for hand-modeled species (look.voxel).
//
// All voxels of a model render as a single InstancedMesh (one draw call) of
// unit cubes, each tinted from the model's palette. The model is reoriented to
// the engine convention (nose at +X, Y up) and normalised so its body length is
// exactly 1 unit — matching createFishMesh, which then scales it to size.

import * as THREE from "three";
import { CREEKFISH_ALBINO_VOX } from "./data/creekfishAlbinoVox.js";
import { CREEKFISH_BERRYPLUM_VOX } from "./data/creekfishBerryplumVox.js";
import { CREEKFISH_REDTROUT_VOX } from "./data/creekfishRedtroutVox.js";
import { CREEKFISH_STEELBLUE_VOX } from "./data/creekfishSteelblueVox.js";
import { CREEKFISH_SUNRISE_VOX } from "./data/creekfishSunriseVox.js";
import { CREEKFISH_CAVE_VOX } from "./data/creekfishCaveVox.js";
import { CREEKFISH_PURPLE_VOX } from "./data/creekfishPurpleVox.js";

const MODELS = {
  creekfish_albino: CREEKFISH_ALBINO_VOX,
  creekfish_berryplum: CREEKFISH_BERRYPLUM_VOX,
  creekfish_redtrout: CREEKFISH_REDTROUT_VOX,
  creekfish_steelblue: CREEKFISH_STEELBLUE_VOX,
  creekfish_sunrise: CREEKFISH_SUNRISE_VOX,
  creekfish_cave: CREEKFISH_CAVE_VOX,
  creekfish_purple: CREEKFISH_PURPLE_VOX,
};

// Decoded + normalised voxel data, cached per model key.
const prepCache = new Map();

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function prepare(key) {
  if (prepCache.has(key)) return prepCache.get(key);

  const model = MODELS[key];
  const bytes = decodeBase64(model.voxels);
  const count = model.count;
  const [sx] = model.size;

  // Reorient: vox X = body length with the head at low X -> flip to +X;
  //           vox Z = height -> three Y (up); vox Y = width -> three Z.
  const wx = new Float32Array(count);
  const wy = new Float32Array(count);
  const wz = new Float32Array(count);
  const ci = new Uint8Array(count);
  let minx = Infinity, maxx = -Infinity;
  let miny = Infinity, maxy = -Infinity;
  let minz = Infinity, maxz = -Infinity;

  for (let i = 0; i < count; i++) {
    const X = sx - 1 - bytes[i * 4]; // flip length so the head faces +X
    const Y = bytes[i * 4 + 2];      // up
    const Z = bytes[i * 4 + 1];      // width
    ci[i] = bytes[i * 4 + 3];
    wx[i] = X; wy[i] = Y; wz[i] = Z;
    if (X < minx) minx = X; if (X > maxx) maxx = X;
    if (Y < miny) miny = Y; if (Y > maxy) maxy = Y;
    if (Z < minz) minz = Z; if (Z > maxz) maxz = Z;
  }

  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  const cz = (minz + maxz) / 2;
  const scale = 1 / ((maxx - minx) || 1); // body length -> 1 unit

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (wx[i] - cx) * scale;
    positions[i * 3 + 1] = (wy[i] - cy) * scale;
    positions[i * 3 + 2] = (wz[i] - cz) * scale;
  }

  const prepared = { positions, colorIdx: ci, count, voxScale: scale, palette: model.palette };
  prepCache.set(key, prepared);
  return prepared;
}

export function hasVoxelModel(key) {
  return !!MODELS[key];
}

/**
 * Builds a voxel fish group at unit body length, nose at +X, centered on origin.
 * The caller scales it to the rolled real-world size.
 */
export function buildVoxelFish(key) {
  const { positions, colorIdx, count, voxScale, palette } = prepare(key);

  const geo = new THREE.BoxGeometry(voxScale, voxScale, voxScale);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.05 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    mesh.setMatrixAt(i, m);
    color.setHex(palette[colorIdx[i]]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
