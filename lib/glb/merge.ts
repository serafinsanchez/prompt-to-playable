/**
 * Merge a rigged character with its five animation documents into one
 * game-ready document: five named clips on one mesh/skin/skeleton.
 *
 * Isomorphic — no Node-only imports; runs in the pregen script and in the
 * browser's lazy merge chunk. Proven offline in scripts/spike-merge-clips.mjs
 * (2026-08-04): Meshy bone names match across every output of one character,
 * so retargeting is a by-name channel re-point, never a skeleton map.
 */
import { PropertyType, type Animation, type Document } from "@gltf-transform/core";
import { mergeDocuments, prune, unpartition } from "@gltf-transform/functions";
import { ANIMATION_CLIPS, type AnimationClip } from "../meshy/types";

/**
 * Mutates and returns `rig`: strips its embedded rig-pose animation, grafts
 * each clip's single animation onto the rig skeleton, prunes the five
 * duplicate meshes the clip files carry, and folds everything into one
 * buffer (GLB requires it).
 */
export async function mergeCharacter(
  rig: Document,
  clips: Record<AnimationClip, Document>,
): Promise<Document> {
  // Meshy's rig task ships a rig-pose sanity clip — not a gameplay animation.
  for (const animation of rig.getRoot().listAnimations()) animation.dispose();

  const nodesByName = new Map(
    rig.getRoot().listNodes().map((node) => [node.getName(), node]),
  );

  for (const clip of ANIMATION_CLIPS) {
    const source = clips[clip];
    const animations = source.getRoot().listAnimations();
    if (animations.length !== 1) {
      throw new Error(
        `clip "${clip}": expected exactly 1 animation, got ${String(animations.length)}`,
      );
    }
    animations[0].setName(clip);

    const map = mergeDocuments(rig, source);
    const merged = map.get(animations[0]) as Animation;

    // Re-point every channel from the copied skeleton to the rig's own bones.
    for (const channel of merged.listChannels()) {
      const bone = channel.getTargetNode()?.getName() ?? "<unnamed>";
      const target = nodesByName.get(bone);
      if (!target) {
        throw new Error(`clip "${clip}" targets bone "${bone}" missing from the rig`);
      }
      channel.setTargetNode(target);
    }

    // The copied scene/node tree is now unreferenced by the animation;
    // dispose it so prune() can sweep the orphaned mesh/skin/material/texture.
    for (const [sourceProperty, copied] of map) {
      const type = sourceProperty.propertyType;
      if (type === PropertyType.SCENE || type === PropertyType.NODE) copied.dispose();
    }
  }

  await rig.transform(prune(), unpartition());
  return rig;
}

/**
 * Undo Meshy's rig-export viewer hacks so the file lights correctly in any
 * engine (runtime twin: components/scene/meshy-material.ts):
 * emissive = baseColor at factor [1,1,1] (self-glow) → cleared;
 * KHR_materials_specular specularColorFactor [2,2,2] → extension removed
 * (glTF defaults are the neutral values). Roughness is NOT touched — that
 * clamp is stage-lighting tuning, not asset repair.
 */
export function normalizeMaterials(document: Document): void {
  for (const material of document.getRoot().listMaterials()) {
    material.setEmissiveFactor([0, 0, 0]);
    material.setEmissiveTexture(null);
    material.setExtension("KHR_materials_specular", null);
  }
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === "KHR_materials_specular") extension.dispose();
  }
}
