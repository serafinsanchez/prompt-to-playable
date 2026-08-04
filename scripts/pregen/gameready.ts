/**
 * Derive one game-ready GLB per gallery character (US-10) from the assets
 * ALREADY in public/gallery/ — zero Meshy credits:
 *
 *   optimized rig  → meshopt decodes on read; dequantize() drops
 *                    KHR_mesh_quantization; WebP re-encodes to PNG/JPEG
 *   stripped clips → still carry their full animations; merge core grafts
 *                    them onto the rig skeleton by bone name
 *
 * Output contract (enforced by check-gallery.mts): extensionsRequired
 * empty, PNG/JPEG textures only, five named clips, ≤ 8.5 MB.
 *
 * Run: npm run pregen:gameready   (rerun after any gallery regeneration)
 */
import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MathUtils, type Accessor, type Document } from "@gltf-transform/core";
import { dequantize, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

import { bakeClipFacing, clipYawSpreadDegrees } from "../../lib/glb/facing-bake";
import { mergeCharacter, normalizeMaterials } from "../../lib/glb/merge";
import { ANIMATION_CLIPS, type AnimationClip } from "../../lib/meshy/types";
import { GALLERY_URL_PREFIX, hashedGlbName, readManifest, writeManifest } from "./manifest";
import { createGalleryIO, formatBytes } from "./optimize";

const GALLERY_DIR = join(process.cwd(), "public", "gallery");
export const GAME_READY_MAX_BYTES = 8.5 * 1024 * 1024;

function diskPath(urlPath: string): string {
  return join(process.cwd(), "public", ...urlPath.split("/").filter(Boolean));
}

const FLOAT = 5126; // Accessor componentType for float32

/**
 * Meshy's animate clips carry ROTATION sampler outputs as normalized SHORT
 * (quaternion channels only — TRANSLATION/SCALE ship as float32 already).
 * `dequantize()` from @gltf-transform/functions only walks mesh primitive
 * attributes, never animation samplers, so it leaves these untouched — and
 * `bakeClipFacing` (lib/glb/facing-bake.ts) requires float32 rotation data
 * and throws otherwise. Decode any non-float sampler accessor the same way
 * dequantize() decodes a quantized vertex attribute: divide by the
 * componentType's normalized-int range.
 */
function dequantizeAnimationAccessors(document: Document): void {
  const seen = new Set<Accessor>();
  for (const animation of document.getRoot().listAnimations()) {
    for (const sampler of animation.listSamplers()) {
      for (const accessor of [sampler.getInput(), sampler.getOutput()]) {
        if (!accessor || seen.has(accessor) || accessor.getComponentType() === FLOAT) continue;
        seen.add(accessor);
        const src = accessor.getArray();
        if (!src) continue;
        const componentType = accessor.getComponentType();
        const normalized = accessor.getNormalized();
        const dst = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) {
          dst[i] = normalized ? MathUtils.decodeNormalizedInt(src[i], componentType) : src[i];
        }
        accessor.setArray(dst).setNormalized(false);
      }
    }
  }
}

// Wrapped in main() rather than top-level await: package.json has no
// "type": "module", so tsx compiles a plain .ts entry point as CJS, where
// top-level await is unsupported by esbuild's transform (matches index.ts's
// existing convention in this directory).
async function main(): Promise<void> {
  const io = await createGalleryIO();
  const manifest = readManifest(GALLERY_DIR);
  if (manifest.length === 0) {
    throw new Error("empty gallery manifest — run npm run pregen first");
  }

  for (const entry of manifest) {
    const rig = await io.read(diskPath(entry.glbPath));
    // meshopt decoded on read; quantization is stored data — undo it or the
    // output requires KHR_mesh_quantization and stock loaders reject it.
    await rig.transform(dequantize());

    const clips = {} as Record<AnimationClip, Document>;
    for (const clip of ANIMATION_CLIPS) {
      clips[clip] = await io.read(diskPath(entry.clipPaths[clip]));
    }

    const merged = await mergeCharacter(rig, clips);
    normalizeMaterials(merged);
    dequantizeAnimationAccessors(merged);
    bakeClipFacing(merged);

    // Core-glTF textures only. baseColor goes JPEG when every material is
    // opaque (spec size finding: PNG-2048 alone ran ~8 MB); anything else PNG.
    const opaque = merged
      .getRoot()
      .listMaterials()
      .every((material) => material.getAlphaMode() === "OPAQUE");
    await merged.transform(
      textureCompress({
        encoder: sharp,
        targetFormat: opaque ? "jpeg" : "png",
        quality: 90,
        slots: /baseColor/,
      }),
      textureCompress({ encoder: sharp, targetFormat: "png", slots: /^(?!baseColor)/ }),
    );

    // Codec extensions are gone from the data; drop any lingering declarations.
    for (const extension of merged.getRoot().listExtensionsUsed()) {
      if (
        ["EXT_meshopt_compression", "KHR_mesh_quantization", "EXT_texture_webp"].includes(
          extension.extensionName,
        )
      ) {
        extension.dispose();
      }
    }

    const bytes = await io.writeBinary(merged);
    if (bytes.byteLength > GAME_READY_MAX_BYTES) {
      throw new Error(
        `${entry.slug}: game-ready GLB is ${formatBytes(bytes.byteLength)} — over the 8.5 MB gate`,
      );
    }
    const spread = clipYawSpreadDegrees(merged);
    if (spread > 0.5) {
      throw new Error(`${entry.slug}: clip yaw spread ${spread.toFixed(2)}° after bake`);
    }

    const characterDir = join(GALLERY_DIR, entry.slug);
    for (const stale of readdirSync(characterDir).filter((name) => name.startsWith("character."))) {
      unlinkSync(join(characterDir, stale));
    }
    const filename = hashedGlbName("character", bytes);
    writeFileSync(join(characterDir, filename), bytes);
    entry.gameReadyPath = `${GALLERY_URL_PREFIX}/${entry.slug}/${filename}`;
    entry.gameReadySizeBytes = bytes.byteLength;
    console.log(`${entry.slug}: ${formatBytes(bytes.byteLength)} → ${filename}`);
  }

  writeManifest(GALLERY_DIR, manifest);
  console.log(`manifest updated — ${String(manifest.length)} game-ready GLBs`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
