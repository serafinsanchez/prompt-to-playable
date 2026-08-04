/**
 * GLB optimizer — the programmatic @gltf-transform NodeIO pass that turns raw
 * Meshy downloads (~8.9 MB each) into gallery assets that fit the <5s
 * first-frame budget (docs/ARCHITECTURE.md §1, §5).
 *
 * Two asset kinds, two treatments:
 *
 * - RIG GLB (rendered by the scene): dedup → prune → texture resize to
 *   1024px → meshopt. ~8.9 MB → ~2.4 MB, triangle count untouched.
 * - CLIP GLBs (five per character): the app's clip loader reads only
 *   `gltf.animations[0]` — it never renders them — yet Meshy ships the full
 *   mesh + 6.5 MB texture in every one. Strip geometry, materials, and
 *   textures; keep the named node hierarchy the animation tracks target.
 *   ~8.9 MB → ~35 KB each.
 *
 * Codec decision (ARCHITECTURE §5): the budget is the gate, not any specific
 * codec. meshopt + PNG resize already lands a full character (~2.6 MB, first
 * frame = rig + idle ≈ 2.5 MB) far under the raw 8.5 MB single-file budget,
 * so KTX2 — whose programmatic path needs the external `toktx` binary — is
 * NOT used. Revisit only if gallery characters outgrow the budget.
 * Decoders required by the output (both built into drei's `useGLTF`):
 * EXT_meshopt_compression + KHR_mesh_quantization.
 */

import { Logger, NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

import { ANIMATION_CLIPS, type AnimationClip } from "../../lib/meshy/types";

/** Max texture edge for gallery rigs; raw Meshy textures are 4096×4096 PNG. */
export const GALLERY_TEXTURE_SIZE = 1024;

/** Quiet logger — the pregen script reports sizes itself. */
const SILENT = new Logger(Logger.Verbosity.ERROR);

/**
 * One NodeIO for reads and writes. The encoder produces
 * EXT_meshopt_compression; the decoder lets us (and the tests) re-read our
 * own output to verify it.
 */
export async function createGalleryIO(): Promise<NodeIO> {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new NodeIO()
    .setLogger(SILENT)
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
}

/** Triangle count across every mesh primitive (indexed or not). */
export function countTriangles(document: Document): number {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const vertexCount =
        primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
      triangles += Math.floor(vertexCount / 3);
    }
  }
  return triangles;
}

export interface OptimizedRig {
  glb: Uint8Array;
  /** Triangles in the optimized mesh — the manifest's polyCount receipt. */
  polyCount: number;
}

/**
 * Optimize the rigged character mesh. Keeps geometry, skin, and material;
 * drops the placeholder rest animation Meshy embeds in rig GLBs (clips ship
 * separately) and downscales the texture.
 */
export async function optimizeRigGlb(
  io: NodeIO,
  glb: Uint8Array,
  textureSize: number = GALLERY_TEXTURE_SIZE,
): Promise<OptimizedRig> {
  const document = await io.readBinary(glb);
  document.setLogger(SILENT);

  // The scene animates via the five clip GLBs; the rig's embedded rest clip
  // is dead weight.
  for (const animation of document.getRoot().listAnimations()) animation.dispose();

  await document.transform(
    dedup(),
    prune(),
    // No encoder installed → gltf-transform's built-in ndarray resize
    // (Lanczos, re-encoded as PNG). Only shrinks — smaller textures pass through.
    textureCompress({ resize: [textureSize, textureSize] }),
    // Quantize + reorder + EXT_meshopt_compression on every buffer view.
    meshopt({ encoder: MeshoptEncoder }),
  );

  return { glb: await io.writeBinary(document), polyCount: countTriangles(document) };
}

/**
 * Reduce an animation GLB to just its clip: drop meshes, skins, materials,
 * and textures, keep the named nodes the animation's tracks target (three.js
 * binds tracks to the RIG's scene graph by node name at play time).
 */
export async function optimizeClipGlb(io: NodeIO, glb: Uint8Array): Promise<Uint8Array> {
  const document = await io.readBinary(glb);
  document.setLogger(SILENT);
  const root = document.getRoot();

  if (root.listAnimations().length === 0) {
    throw new Error("clip GLB has no animation — refusing to strip it to nothing");
  }
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const skin of root.listSkins()) skin.dispose();
  for (const mesh of root.listMeshes()) mesh.dispose();

  await document.transform(
    // keepLeaves: animation tracks target leaf joints; never garbage-collect them.
    prune({ keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder }),
  );
  return io.writeBinary(document);
}

export interface OptimizedCharacter {
  rig: Uint8Array;
  clips: Record<AnimationClip, Uint8Array>;
  polyCount: number;
  /** Before/after bytes per file, for honest logging. */
  stats: Record<"rig" | AnimationClip, { bytesIn: number; bytesOut: number }>;
}

/** Run the full per-character pass: one rig + five clips. */
export async function optimizeCharacter(
  io: NodeIO,
  raw: { rig: Uint8Array; clips: Record<AnimationClip, Uint8Array> },
): Promise<OptimizedCharacter> {
  const { glb: rig, polyCount } = await optimizeRigGlb(io, raw.rig);
  const stats: OptimizedCharacter["stats"] = {
    rig: { bytesIn: raw.rig.byteLength, bytesOut: rig.byteLength },
  } as OptimizedCharacter["stats"];

  const clips = {} as Record<AnimationClip, Uint8Array>;
  for (const clip of ANIMATION_CLIPS) {
    clips[clip] = await optimizeClipGlb(io, raw.clips[clip]);
    stats[clip] = { bytesIn: raw.clips[clip].byteLength, bytesOut: clips[clip].byteLength };
  }
  return { rig, clips, polyCount, stats };
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}
