/**
 * Meshy rig GLBs ship a viewer hack: emissiveTexture = baseColorTexture with
 * emissiveFactor [1,1,1], so characters glow their own paint and can never
 * render black. Under stage lights that addition blows delit (meshy-6,
 * remove_lighting) basecolors out to pure white. Rigging also drops the
 * metallic-roughness map, leaving glTF defaults (metalness 1, roughness 1)
 * that no analytic light can shade. normalizeMeshyMaterials() undoes both
 * at load — verified live against the knight A/B (docs/verification/
 * 2026-08-04-param-ab-report.md).
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  MESHY_ROUGHNESS_MAX,
  MESHY_ROUGHNESS_MIN,
  normalizeMeshyMaterials,
} from "../../components/scene/meshy-material";

/** A mesh shaped like Meshy rig output: emissive self-glow, no MR map. */
function meshyLikeMesh(): THREE.Mesh {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: texture,
    emissiveIntensity: 1,
    metalness: 1,
    roughness: 1,
  });
  return new THREE.Mesh(new THREE.BufferGeometry(), material);
}

describe("normalizeMeshyMaterials", () => {
  it("kills the emissive self-glow and clamps the unmapped roughness, keeping metalness", () => {
    const root = new THREE.Group();
    const mesh = meshyLikeMesh();
    root.add(mesh);

    const touched = normalizeMeshyMaterials(root);

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(touched).toBe(1);
    expect(material.emissiveIntensity).toBe(0);
    // Metal 1 is what stops the white diffuse blowout — it must survive.
    expect(material.metalness).toBe(1);
    expect(material.roughness).toBeGreaterThanOrEqual(MESHY_ROUGHNESS_MIN);
    expect(material.roughness).toBeLessThanOrEqual(MESHY_ROUGHNESS_MAX);
  });

  it("resets the exported specularColorFactor [2,2,2] boost on physical materials", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({ emissiveIntensity: 1 });
    material.specularColor.setScalar(2);
    material.specularIntensity = 1;
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));

    normalizeMeshyMaterials(root);

    expect(material.specularColor.r).toBe(1);
    expect(material.specularIntensity).toBeLessThanOrEqual(1);
  });

  it("leaves a material with a real metallic-roughness map alone (only the glow goes)", () => {
    const root = new THREE.Group();
    const mesh = meshyLikeMesh();
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.metalnessMap = new THREE.Texture();
    material.roughnessMap = material.metalnessMap;
    root.add(mesh);

    normalizeMeshyMaterials(root);

    // A surviving MR map is authoritative — factors must stay at 1 so the
    // map's values pass through unscaled.
    expect(material.emissiveIntensity).toBe(0);
    expect(material.metalness).toBe(1);
    expect(material.roughness).toBe(1);
  });

  it("is idempotent and handles material arrays and non-standard materials", () => {
    const root = new THREE.Group();
    const mesh = meshyLikeMesh();
    const second = new THREE.Mesh(
      new THREE.BufferGeometry(),
      [new THREE.MeshBasicMaterial(), (meshyLikeMesh().material as THREE.MeshStandardMaterial)],
    );
    root.add(mesh, second);

    const first = normalizeMeshyMaterials(root);
    const again = normalizeMeshyMaterials(root);

    expect(first).toBe(2); // basic material skipped, standard ones touched
    expect(again).toBe(2); // second pass finds the same materials, changes nothing
    expect((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0);
  });
});
