// Procedural scenery per location: docks, piers, boats, shoreline terrain,
// pines, rocks, reeds, buoys and distant mountains — all from primitives.
// The player always stands near the origin and casts toward -Z.

import * as THREE from "three";
import { disposeObject3D, randRange, pick } from "../utils/utils.js";

const WOOD = 0x6e5138;
const WOOD_DARK = 0x4c3725;

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...opts });
}

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shadow = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  if (shadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  return m;
}

// ---------- reusable scenery pieces ----------

function makePine(mat, leafMat, h = 4) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.09 * h * 0.25, 0.13 * h * 0.25, h * 0.42, 6), mat, {
    y: h * 0.21, shadow: true,
  });
  g.add(trunk);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const radius = h * 0.26 * (1 - t * 0.55);
    const cone = mesh(new THREE.ConeGeometry(radius, h * 0.34, 7), leafMat, {
      y: h * (0.42 + 0.2 * i), shadow: true,
    });
    g.add(cone);
  }
  return g;
}

function makeRock(mat, s = 1) {
  const rock = mesh(new THREE.DodecahedronGeometry(s, 0), mat, {
    sx: randRange(0.7, 1.3), sy: randRange(0.5, 0.9), sz: randRange(0.7, 1.3),
    ry: randRange(0, Math.PI), shadow: true,
  });
  return rock;
}

function makeReeds(stemMat, n = 7) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const h = randRange(0.7, 1.5);
    const stem = mesh(new THREE.CylinderGeometry(0.015, 0.022, h, 4), stemMat, {
      x: randRange(-0.5, 0.5), y: h / 2, z: randRange(-0.5, 0.5),
      rx: randRange(-0.12, 0.12), rz: randRange(-0.12, 0.12),
    });
    g.add(stem);
  }
  return g;
}

function makeBuoy() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.8, 10), std(0xd23b3b), { y: 0.3 });
  const cap = mesh(new THREE.SphereGeometry(0.3, 10, 8), std(0xe8e4da), { y: 0.78 });
  const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), std(0x333a44), { y: 1.3 });
  g.add(body, cap, pole);
  return g;
}

function makeLandmass({ color, radius = 70, x = 0, z = 60, height = 2.2 }) {
  const geo = new THREE.CircleGeometry(radius, 48);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const d = Math.sqrt(px * px + py * py) / radius;
    const bump =
      Math.sin(px * 0.08 + 3) * Math.cos(py * 0.07 + 1) * 0.8 +
      Math.sin(px * 0.21) * Math.cos(py * 0.18) * 0.4;
    pos.setZ(i, Math.max(0, (1 - d) * height + bump * (1 - d)));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, std(color, { flatShading: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, -0.55, z);
  m.receiveShadow = true;
  return m;
}

function makeDock({ length = 13, width = 2.4, deckY = 0.62, startZ = 9 }) {
  const g = new THREE.Group();
  const plankMat = std(WOOD);
  const postMat = std(WOOD_DARK);
  const plankCount = Math.floor(length / 0.62);
  for (let i = 0; i < plankCount; i++) {
    const z = startZ - i * 0.62 - 0.3;
    g.add(
      mesh(new THREE.BoxGeometry(width, 0.09, 0.55), plankMat, {
        y: deckY, z, ry: randRange(-0.015, 0.015), shadow: true,
      })
    );
  }
  for (let i = 0; i <= Math.floor(length / 3); i++) {
    const z = startZ - i * 3;
    for (const sx of [-1, 1]) {
      g.add(
        mesh(new THREE.CylinderGeometry(0.11, 0.13, deckY + 1.5, 7), postMat, {
          x: (sx * width) / 2 - sx * 0.08, y: (deckY - 1.2) / 2 + 0.2, z, shadow: true,
        })
      );
    }
  }
  // end posts stick up like mooring bollards
  for (const sx of [-1, 1]) {
    g.add(
      mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.5, 7), postMat, {
        x: (sx * width) / 2 - sx * 0.08, y: deckY + 0.22, z: startZ - length + 0.4, shadow: true,
      })
    );
  }
  return g;
}

// ---------- per-location builders ----------

function buildLake(group) {
  group.add(makeLandmass({ color: 0x3d5a3a, radius: 80, z: 78, height: 2.6 }));
  group.add(makeLandmass({ color: 0x39543a, radius: 45, x: -95, z: 30, height: 3 }));
  group.add(makeLandmass({ color: 0x39543a, radius: 45, x: 100, z: 25, height: 3 }));

  const trunkMat = std(0x5a4226);
  const leafA = std(0x2e5d35, { flatShading: true });
  const leafB = std(0x3a6e3c, { flatShading: true });
  const treeSpots = [
    [-8, 16], [-13, 22], [-5, 26], [7, 18], [12, 24], [4, 30], [-20, 32], [18, 34],
    [-30, 42], [26, 44], [-12, 38], [9, 40], [-40, 55], [38, 58], [0, 48],
  ];
  for (const [x, z] of treeSpots) {
    const tree = makePine(trunkMat, pick([leafA, leafB]), randRange(3.2, 6));
    tree.position.set(x + randRange(-1, 1), 0.7, z + randRange(-1, 1));
    group.add(tree);
  }

  const rockMat = std(0x6f6f6f, { flatShading: true });
  for (const [x, z] of [[-4, 11], [5.5, 12], [-9, 14], [14, 16], [-2.5, 9.5]]) {
    const r = makeRock(rockMat, randRange(0.4, 0.9));
    r.position.set(x, 0.15, z);
    group.add(r);
  }

  const reedMat = std(0x5e7d3a);
  for (const [x, z] of [[-3.5, 7.5], [4, 8], [-7, 10], [8, 10.5]]) {
    const reeds = makeReeds(reedMat);
    reeds.position.set(x, 0, z);
    group.add(reeds);
  }

  group.add(makeDock({ length: 13, width: 2.4, deckY: 0.62, startZ: 9 }));
  return { playerSpot: new THREE.Vector3(0, 0.66, -2.6) };
}

function buildRiver(group) {
  // two banks along X, water channel flowing through the middle
  group.add(makeLandmass({ color: 0x49603c, radius: 95, z: 92, height: 3 }));
  group.add(makeLandmass({ color: 0x42583a, radius: 85, z: -118, height: 3.4 }));
  group.add(makeLandmass({ color: 0x42583a, radius: 60, x: -120, z: -40, height: 3 }));
  group.add(makeLandmass({ color: 0x49603c, radius: 60, x: 130, z: -30, height: 3 }));

  const trunkMat = std(0x55432c);
  const leafA = std(0x3c6e46, { flatShading: true });
  const leafB = std(0x52803e, { flatShading: true });
  for (const [x, z] of [
    [-14, 20], [-7, 26], [6, 22], [15, 27], [-24, 34], [22, 38], [2, 34],
    [-10, -98], [8, -104], [-26, -96], [24, -100], [40, -92], [-44, -90],
  ]) {
    const tree = makePine(trunkMat, pick([leafA, leafB]), randRange(3, 5.5));
    tree.position.set(x + randRange(-1.5, 1.5), 0.7, z + randRange(-1.5, 1.5));
    group.add(tree);
  }

  const rockMat = std(0x7d7a72, { flatShading: true });
  for (const [x, z, s] of [
    [-6, -6, 0.7], [9, -12, 0.9], [-13, -18, 1.1], [4, -24, 0.6], [16, -8, 0.8],
    [-3, 8.5, 0.6], [6, 9, 0.8], [-9, 10, 0.7],
  ]) {
    const r = makeRock(rockMat, s);
    r.position.set(x, 0.08, z);
    group.add(r);
  }

  const reedMat = std(0x6e8c3e);
  for (const [x, z] of [[-4, 7], [5, 7.5], [11, 9], [-11, 8.5]]) {
    const reeds = makeReeds(reedMat, 9);
    reeds.position.set(x, 0, z);
    group.add(reeds);
  }

  group.add(makeDock({ length: 9, width: 2.1, deckY: 0.58, startZ: 8 }));
  return { playerSpot: new THREE.Vector3(0, 0.62, -0.8) };
}

function buildPier(group) {
  // sandy beach behind, long pier out over the sea
  group.add(makeLandmass({ color: 0xc9b189, radius: 110, z: 118, height: 2 }));
  group.add(makeLandmass({ color: 0xbfa87e, radius: 55, x: -120, z: 80, height: 2.4 }));

  const deckY = 1.05;
  const g = makeDock({ length: 26, width: 2.8, deckY, startZ: 20 });
  group.add(g);

  // railing along the pier
  const railMat = std(WOOD_DARK);
  for (const sx of [-1, 1]) {
    group.add(
      mesh(new THREE.BoxGeometry(0.07, 0.07, 24), railMat, {
        x: sx * 1.32, y: deckY + 0.95, z: 8, shadow: true,
      })
    );
    for (let i = 0; i < 9; i++) {
      group.add(
        mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), railMat, {
          x: sx * 1.32, y: deckY + 0.48, z: 19 - i * 3,
        })
      );
    }
  }

  // distant lighthouse on a rocky point
  const lhBase = mesh(new THREE.CylinderGeometry(2.2, 3, 16, 10), std(0xe6e0d4), { x: 150, y: 7, z: -60 });
  const lhTop = mesh(new THREE.CylinderGeometry(1.4, 1.6, 3, 8), std(0xc23939), { x: 150, y: 16.5, z: -60 });
  const lhRock = makeRock(std(0x6a6a72, { flatShading: true }), 9);
  lhRock.position.set(150, 0.5, -60);
  group.add(lhRock, lhBase, lhTop);

  const b1 = makeBuoy(); b1.position.set(-26, 0, -34); group.add(b1);
  const b2 = makeBuoy(); b2.position.set(30, 0, -52); group.add(b2);

  return { playerSpot: new THREE.Vector3(0, deckY + 0.04, -4.5) };
}

function buildOcean(group) {
  // a small fishing boat adrift in open water
  const hullMat = std(0x355064);
  const deckMat = std(WOOD);
  const deckY = 0.95;

  const hull = mesh(new THREE.CylinderGeometry(1.6, 1.05, 5.6, 8, 1), hullMat, {
    y: 0.35, rx: Math.PI / 2, ry: Math.PI / 8, shadow: true,
  });
  hull.scale.set(1, 1, 0.62);
  group.add(hull);

  group.add(mesh(new THREE.BoxGeometry(2.5, 0.12, 4.6), deckMat, { y: deckY, shadow: true }));
  // gunwale rim
  for (const sx of [-1, 1]) {
    group.add(mesh(new THREE.BoxGeometry(0.14, 0.5, 4.8), hullMat, { x: sx * 1.26, y: deckY + 0.22, shadow: true }));
  }
  group.add(mesh(new THREE.BoxGeometry(2.66, 0.5, 0.14), hullMat, { y: deckY + 0.22, z: -2.36 }));
  group.add(mesh(new THREE.BoxGeometry(2.66, 0.5, 0.14), hullMat, { y: deckY + 0.22, z: 2.36 }));
  // small cabin behind the angler
  group.add(mesh(new THREE.BoxGeometry(1.9, 1.25, 1.5), std(0xdad4c5), { y: deckY + 0.68, z: 1.4, shadow: true }));
  group.add(mesh(new THREE.BoxGeometry(2.05, 0.1, 1.65), std(0x8c2f2f), { y: deckY + 1.36, z: 1.4 }));
  // bench + lantern pole
  group.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 0.45), deckMat, { y: deckY + 0.4, z: -1.6 }));
  group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), std(0x2c333d), { x: 1.05, y: deckY + 0.85, z: -2.1 }));
  group.add(mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshStandardMaterial({
    color: 0xffd98a, emissive: 0xffb84d, emissiveIntensity: 0.9, roughness: 0.4,
  }), { x: 1.05, y: deckY + 1.68, z: -2.1 }));

  const b = makeBuoy(); b.position.set(-22, 0, -30); group.add(b);

  return { playerSpot: new THREE.Vector3(0, deckY + 0.04, -1.7) };
}

const BUILDERS = { lake: buildLake, river: buildRiver, pier: buildPier, ocean: buildOcean };

export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.playerSpot = new THREE.Vector3(0, 0.7, -2);
  }

  load(location) {
    if (this.group) {
      this.scene.remove(this.group);
      disposeObject3D(this.group);
      this.group = null;
    }
    const group = new THREE.Group();
    const builder = BUILDERS[location.env] || buildLake;
    const info = builder(group);
    this.scene.add(group);
    this.group = group;
    this.playerSpot.copy(info.playerSpot);
    return info;
  }
}
