import * as THREE from "three";

/**
 * Meshy rig GLBs arrive with viewer hacks that fight a lit game scene
 * (live A/B evidence: docs/verification/2026-08-04-param-ab-report.md):
 *
 * 1. `emissiveTexture` = the basecolor with `emissiveFactor [1,1,1]` — the
 *    character glows its own paint so web viewers never show black. On our
 *    stage that addition blows delit (meshy-6 `remove_lighting`) metal
 *    basecolors out to pure white.
 * 2. Rigging drops the metallic-roughness map, so glTF defaults apply:
 *    metalness 1, roughness 1. Metalness 1 is actually the friend here —
 *    metals take no diffuse, so a near-white delit basecolor stops
 *    saturating under the stage lights — but roughness 1 turns the
 *    environment reflection into clay. Clamping roughness lets the IBL
 *    (StageEnvironment) render the basecolor as actual metal.
 * 3. `KHR_materials_specular` ships `specularColorFactor [2,2,2]` — an
 *    overdriven specular that doubles highlights; reset to neutral.
 *
 * normalizeMeshyMaterials() runs once at character load and only touches
 * knobs the asset left in viewer-hack state; a surviving MR map keeps its
 * authority untouched.
 */

/**
 * Roughness clamp for materials whose metallic-roughness map Meshy dropped.
 * Kept toward matte: the stage's hot key/rim lights are tuned for dark baked
 * textures, and glossier metal speculars them into white clipping.
 */
export const MESHY_ROUGHNESS_MIN = 0.55;
export const MESHY_ROUGHNESS_MAX = 0.8;

/** Normalize every standard material under `root`; returns how many were touched. */
export function normalizeMeshyMaterials(root: THREE.Object3D): number {
  const seen = new Set<THREE.MeshStandardMaterial>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      seen.add(material);
    }
  });

  for (const material of seen) {
    material.emissiveIntensity = 0;
    // A surviving MR map is authoritative — factors are its multipliers, leave them.
    if (!material.metalnessMap && !material.roughnessMap) {
      material.roughness = THREE.MathUtils.clamp(
        material.roughness,
        MESHY_ROUGHNESS_MIN,
        MESHY_ROUGHNESS_MAX,
      );
    }
    if (material instanceof THREE.MeshPhysicalMaterial) {
      // Undo the exported specularColorFactor [2,2,2] viewer boost.
      material.specularColor.setScalar(1);
      material.specularIntensity = Math.min(material.specularIntensity, 1);
    }
    material.needsUpdate = true;
  }

  return seen.size;
}
