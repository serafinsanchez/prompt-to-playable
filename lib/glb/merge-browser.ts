/**
 * Browser driver for the game-ready download (US-10). Loaded ONLY via
 * `await import(...)` on download click — this module (and gltf-transform
 * with it) must never enter the initial bundle (ARCHITECTURE §5 revision).
 *
 * Reads the run's six GLBs through the same-origin asset proxy URLs the
 * caller passes in, merges + bakes in memory, returns GLB bytes. Textures
 * ship as Meshy made them — no recompression in the browser (sharp is
 * Node-only and stays out of client chunks by constraint).
 */
import { WebIO, type Document } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { ANIMATION_CLIPS, type AnimationClip } from "../meshy/types";
import { bakeClipFacing } from "./facing-bake";
import { mergeCharacter, normalizeMaterials } from "./merge";

/** Same shape as components/scene CharacterSource; redeclared so lib/ stays below components/. */
export interface CharacterUrls {
  rig: string;
  clips: Record<AnimationClip, string>;
}

export async function mergeCharacterFromUrls(
  urls: CharacterUrls,
  fetchFn: typeof fetch = fetch,
): Promise<Uint8Array> {
  const io = new WebIO().registerExtensions(KHRONOS_EXTENSIONS);

  const fetchGlb = async (label: string, url: string): Promise<Document> => {
    const response = await fetchFn(url);
    if (!response.ok) {
      throw new Error(`${label} download failed (${String(response.status)})`);
    }
    return io.readBinary(new Uint8Array(await response.arrayBuffer()));
  };

  const [rig, ...clipDocuments] = await Promise.all([
    fetchGlb("rig", urls.rig),
    ...ANIMATION_CLIPS.map((clip) => fetchGlb(clip, urls.clips[clip])),
  ]);
  const clips = Object.fromEntries(
    ANIMATION_CLIPS.map((clip, index) => [clip, clipDocuments[index]]),
  ) as Record<AnimationClip, Document>;

  const merged = await mergeCharacter(rig, clips);
  normalizeMaterials(merged);
  bakeClipFacing(merged);
  return io.writeBinary(merged);
}

/** Blob-anchor save; same-origin blob URLs always honor `download`. */
export function saveGlb(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: "model/gltf-binary",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
