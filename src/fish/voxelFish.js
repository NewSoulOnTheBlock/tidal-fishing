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
import { DARTTAIL_VOX } from "./data/darttailVox.js";
import { DARTTAIL_CORALSHOCK_VOX } from "./data/darttailCoralshockVox.js";
import { DARTTAIL_EMBER_VOX } from "./data/darttailEmberVox.js";
import { DARTTAIL_ICE_VOX } from "./data/darttailIceVox.js";
import { DARTTAIL_TOXIC_VOX } from "./data/darttailToxicVox.js";
import { DEEPFIN_VOX } from "./data/deepfinVox.js";
import { DEEPFIN_AMBERLEAF_VOX } from "./data/deepfinAmberleafVox.js";
import { DEEPFIN_MOSS_VOX } from "./data/deepfinMossVox.js";
import { DEEPFIN_PLUMTIDE_VOX } from "./data/deepfinPlumtideVox.js";
import { DEEPFIN_SUNSET_VOX } from "./data/deepfinSunsetVox.js";
import { BLADEJAW_VOX } from "./data/bladejawVox.js";
import { BLADEJAW_OBSIDIAN_VOX } from "./data/bladejawObsidianVox.js";
import { BLADEJAW_REEFSTEEL_VOX } from "./data/bladejawReefsteelVox.js";
import { BLADEJAW_VENOMGOLD_VOX } from "./data/bladejawVenomgoldVox.js";
import { CROWNFIN_VOX } from "./data/crownfinVox.js";
import { CROWNFIN_AMETHYST_VOX } from "./data/crownfinAmethystVox.js";
import { CROWNFIN_CRIMSONCREST_VOX } from "./data/crownfinCrimsoncrestVox.js";
import { CROWNFIN_EMERALD_VOX } from "./data/crownfinEmeraldVox.js";
import { CROWNFIN_FROST_VOX } from "./data/crownfinFrostVox.js";
import { CROWNFIN_SUNBURST_VOX } from "./data/crownfinSunburstVox.js";
import { CROWNFIN_TIDEJADE_VOX } from "./data/crownfinTidejadeVox.js";
import { CELESTIALCREST_VOX } from "./data/celestialcrestVox.js";
import { MOONVEIL_VOX } from "./data/moonveilVox.js";
import { MOONVEIL_AURORA_VOX } from "./data/moonveilAuroraVox.js";
import { MOONVEIL_GLACIERFIN_VOX } from "./data/moonveilGlacierfinVox.js";
import { MOONVEIL_NIGHTBLOSSOM_VOX } from "./data/moonveilNightblossomVox.js";
import { MOONVEIL_ROSEGLOW_VOX } from "./data/moonveilRoseglowVox.js";
import { THORNBACK_VOX } from "./data/thornbackVox.js";
import { THORNBACK_EMBERSTONE_VOX } from "./data/thornbackEmberstoneVox.js";
import { THORNBACK_JADEFIRE_VOX } from "./data/thornbackJadefireVox.js";
import { THORNBACK_MOSSGLOW_VOX } from "./data/thornbackMossglowVox.js";
import { THORNBACK_SUNSTONE_VOX } from "./data/thornbackSunstoneVox.js";
import { BASTIONRAY_VOX } from "./data/bastionrayVox.js";
import { BASTIONRAY_MARSHFIRE_VOX } from "./data/bastionrayMarshfireVox.js";
import { BASTIONRAY_MOONJADE_VOX } from "./data/bastionrayMoonjadeVox.js";
import { BASTIONRAY_ROYALPLUM_VOX } from "./data/bastionrayRoyalplumVox.js";
import { LEVIATHAN_VOX } from "./data/leviathanVox.js";
import { PRISMACROWN_VOX } from "./data/prismacrownVox.js";
import { SKYSPEAR_VOX } from "./data/skyspearVox.js";
import { SKYSPEAR_CITRINEJADE_VOX } from "./data/skyspearCitrinejadeVox.js";
import { SKYSPEAR_EMBERWAVE_VOX } from "./data/skyspearEmberwaveVox.js";
import { SKYSPEAR_SOLARFLARE_VOX } from "./data/skyspearSolarflareVox.js";
import { SKYSPEAR_VOIDFROST_VOX } from "./data/skyspearVoidfrostVox.js";
import { AETHERWING_VOX } from "./data/aetherwingVox.js";
import { DREADMAW_VOX } from "./data/dreadmawVox.js";
import { ORACLERAY_VOX } from "./data/oraclerayVox.js";
import { ORACLERAY_ABYSSGLOW_VOX } from "./data/oraclerayAbyssglowVox.js";
import { ORACLERAY_DUSKGOLD_VOX } from "./data/oraclerayDuskgoldVox.js";
import { ORACLERAY_EMBERBLOOM_VOX } from "./data/oraclerayEmberbloomVox.js";
import { ORACLERAY_JADEVEIL_VOX } from "./data/oraclerayJadeveilVox.js";
import { ORACLERAY_SUNORACLE_VOX } from "./data/oracleraySunoracleVox.js";
import { STORMREAVER_VOX } from "./data/stormreaverVox.js";
import { STORMREAVER_SHOCKFLARE_VOX } from "./data/stormreaverShockflareVox.js";
import { STORMREAVER_TIDEFLARE_VOX } from "./data/stormreaverTideflareVox.js";
import { EMPERORRAY_VOX } from "./data/emperorrayVox.js";
import { MOONFANG_VOX } from "./data/moonfangVox.js";
import { ROYALCREST_VOX } from "./data/royalcrestVox.js";
import { ROYALCREST_AMETHYST_VOX } from "./data/royalcrestAmethystVox.js";
import { ROYALCREST_AURORA_VOX } from "./data/royalcrestAuroraVox.js";
import { ROYALCREST_EMERALD_VOX } from "./data/royalcrestEmeraldVox.js";
import { ROYALCREST_FROSTFIRE_VOX } from "./data/royalcrestFrostfireVox.js";
import { ROYALCREST_OBSIDIAN_VOX } from "./data/royalcrestObsidianVox.js";
import { ROYALCREST_SANDSTONE_VOX } from "./data/royalcrestSandstoneVox.js";
import { ROYALCREST_SUNSET_VOX } from "./data/royalcrestSunsetVox.js";
import { STARFORGE_VOX } from "./data/starforgeVox.js";

const MODELS = {
  creekfish_albino: CREEKFISH_ALBINO_VOX,
  creekfish_berryplum: CREEKFISH_BERRYPLUM_VOX,
  creekfish_redtrout: CREEKFISH_REDTROUT_VOX,
  creekfish_steelblue: CREEKFISH_STEELBLUE_VOX,
  creekfish_sunrise: CREEKFISH_SUNRISE_VOX,
  creekfish_cave: CREEKFISH_CAVE_VOX,
  creekfish_purple: CREEKFISH_PURPLE_VOX,
  darttail: DARTTAIL_VOX,
  darttail_coralshock: DARTTAIL_CORALSHOCK_VOX,
  darttail_ember: DARTTAIL_EMBER_VOX,
  darttail_ice: DARTTAIL_ICE_VOX,
  darttail_toxic: DARTTAIL_TOXIC_VOX,
  deepfin: DEEPFIN_VOX,
  deepfin_amberleaf: DEEPFIN_AMBERLEAF_VOX,
  deepfin_moss: DEEPFIN_MOSS_VOX,
  deepfin_plumtide: DEEPFIN_PLUMTIDE_VOX,
  deepfin_sunset: DEEPFIN_SUNSET_VOX,
  bladejaw: BLADEJAW_VOX,
  bladejaw_obsidian: BLADEJAW_OBSIDIAN_VOX,
  bladejaw_reefsteel: BLADEJAW_REEFSTEEL_VOX,
  bladejaw_venomgold: BLADEJAW_VENOMGOLD_VOX,
  crownfin: CROWNFIN_VOX,
  crownfin_amethyst: CROWNFIN_AMETHYST_VOX,
  crownfin_crimsoncrest: CROWNFIN_CRIMSONCREST_VOX,
  crownfin_emerald: CROWNFIN_EMERALD_VOX,
  crownfin_frost: CROWNFIN_FROST_VOX,
  crownfin_sunburst: CROWNFIN_SUNBURST_VOX,
  crownfin_tidejade: CROWNFIN_TIDEJADE_VOX,
  celestialcrest: CELESTIALCREST_VOX,
  moonveil: MOONVEIL_VOX,
  moonveil_aurora: MOONVEIL_AURORA_VOX,
  moonveil_glacierfin: MOONVEIL_GLACIERFIN_VOX,
  moonveil_nightblossom: MOONVEIL_NIGHTBLOSSOM_VOX,
  moonveil_roseglow: MOONVEIL_ROSEGLOW_VOX,
  thornback: THORNBACK_VOX,
  thornback_emberstone: THORNBACK_EMBERSTONE_VOX,
  thornback_jadefire: THORNBACK_JADEFIRE_VOX,
  thornback_mossglow: THORNBACK_MOSSGLOW_VOX,
  thornback_sunstone: THORNBACK_SUNSTONE_VOX,
  bastionray: BASTIONRAY_VOX,
  bastionray_marshfire: BASTIONRAY_MARSHFIRE_VOX,
  bastionray_moonjade: BASTIONRAY_MOONJADE_VOX,
  bastionray_royalplum: BASTIONRAY_ROYALPLUM_VOX,
  leviathan: LEVIATHAN_VOX,
  prismacrown: PRISMACROWN_VOX,
  skyspear: SKYSPEAR_VOX,
  skyspear_citrinejade: SKYSPEAR_CITRINEJADE_VOX,
  skyspear_emberwave: SKYSPEAR_EMBERWAVE_VOX,
  skyspear_solarflare: SKYSPEAR_SOLARFLARE_VOX,
  skyspear_voidfrost: SKYSPEAR_VOIDFROST_VOX,
  aetherwing: AETHERWING_VOX,
  dreadmaw: DREADMAW_VOX,
  oracleray: ORACLERAY_VOX,
  oracleray_abyssglow: ORACLERAY_ABYSSGLOW_VOX,
  oracleray_duskgold: ORACLERAY_DUSKGOLD_VOX,
  oracleray_emberbloom: ORACLERAY_EMBERBLOOM_VOX,
  oracleray_jadeveil: ORACLERAY_JADEVEIL_VOX,
  oracleray_sunoracle: ORACLERAY_SUNORACLE_VOX,
  stormreaver: STORMREAVER_VOX,
  stormreaver_shockflare: STORMREAVER_SHOCKFLARE_VOX,
  stormreaver_tideflare: STORMREAVER_TIDEFLARE_VOX,
  emperorray: EMPERORRAY_VOX,
  moonfang: MOONFANG_VOX,
  royalcrest: ROYALCREST_VOX,
  royalcrest_amethyst: ROYALCREST_AMETHYST_VOX,
  royalcrest_aurora: ROYALCREST_AURORA_VOX,
  royalcrest_emerald: ROYALCREST_EMERALD_VOX,
  royalcrest_frostfire: ROYALCREST_FROSTFIRE_VOX,
  royalcrest_obsidian: ROYALCREST_OBSIDIAN_VOX,
  royalcrest_sandstone: ROYALCREST_SANDSTONE_VOX,
  royalcrest_sunset: ROYALCREST_SUNSET_VOX,
  starforge: STARFORGE_VOX,
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
