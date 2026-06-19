// Deep-dispose helper for Three.js object subtrees.
//
// Removing an Object3D from the scene does NOT free its GPU memory — geometries,
// materials, textures and skeletons each hold resources that are only released
// by calling .dispose(). Critically, Material.dispose() does NOT dispose the
// textures the material references, so every texture slot must be disposed
// explicitly or texture memory leaks (this is the single biggest leak when
// swapping texture-heavy models like VRM avatars).
//
// Resources flagged `userData.shared = true` (cached/shared across many
// instances, e.g. the procedural fish geometry/material caches) are left intact.

// Every texture-valued property a three.js material may carry. We dispose any of
// these that are present so no texture is ever orphaned.
const TEXTURE_KEYS = [
  "map", "alphaMap", "aoMap", "bumpMap", "displacementMap", "emissiveMap",
  "envMap", "lightMap", "metalnessMap", "normalMap", "roughnessMap",
  "specularMap", "gradientMap", "matcap",
  "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughnessMap",
  "sheenColorMap", "sheenRoughnessMap", "iridescenceMap",
  "iridescenceThicknessMap", "transmissionMap", "thicknessMap", "anisotropyMap",
];

function disposeMaterial(mat, seen) {
  if (!mat || mat.userData?.shared || seen.has(mat)) return;
  seen.add(mat);
  for (const key of TEXTURE_KEYS) {
    const tex = mat[key];
    if (tex && tex.isTexture) tex.dispose();
  }
  mat.dispose();
}

/**
 * Recursively dispose every GPU resource owned by an Object3D subtree:
 * geometries, materials, the textures those materials reference, skinned-mesh
 * skeletons and InstancedMesh instance buffers. Shared resources (userData
 * .shared) are skipped. Safe to call on any subtree, including null.
 *
 * @param {import("three").Object3D | null | undefined} obj
 */
export function disposeObject3D(obj) {
  if (!obj) return;
  const seenGeo = new Set();
  const seenMat = new Set();
  obj.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.skeleton?.dispose) o.skeleton.dispose();
    const g = o.geometry;
    if (g && !g.userData?.shared && !seenGeo.has(g)) {
      seenGeo.add(g);
      g.dispose();
    }
    const m = o.material;
    if (m) {
      const list = Array.isArray(m) ? m : [m];
      for (const mat of list) disposeMaterial(mat, seenMat);
    }
  });
}
