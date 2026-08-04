import {
  CLIP_NAMES,
  type CharacterSource,
  type ClipName,
} from "../scene/clip-binding";
import type { GalleryEntry, GalleryManifest } from "../../scripts/pregen/manifest";

/**
 * Client side of the gallery contract: fetch + validate the manifest the
 * pregen script writes (TASK-06a), and adapt entries onto the scene's
 * `CharacterSource` slot. The manifest is the only data source — cards
 * are never hand-authored (CLAUDE.md data-completeness rule).
 */

export const MANIFEST_URL = "/gallery/manifest.json";

const REQUIRED_STRING_FIELDS = ["slug", "prompt", "glbPath"] as const;
const REQUIRED_NUMBER_FIELDS = ["creditTotal", "generationSeconds", "polyCount"] as const;

/** Validate an unknown payload into a GalleryManifest, or throw with the offending field. */
export function parseGalleryManifest(payload: unknown): GalleryManifest {
  if (!Array.isArray(payload)) {
    throw new Error("Gallery manifest is not an array — regenerate it with npm run pregen.");
  }
  return payload.map((raw, index) => {
    const entry = raw as Partial<GalleryEntry>;
    const label = entry.slug ?? `entry #${index}`;
    for (const field of REQUIRED_STRING_FIELDS) {
      if (typeof entry[field] !== "string" || entry[field].length === 0) {
        throw new Error(`Gallery manifest ${label}: missing ${field}.`);
      }
    }
    for (const field of REQUIRED_NUMBER_FIELDS) {
      if (typeof entry[field] !== "number") {
        throw new Error(`Gallery manifest ${label}: missing ${field}.`);
      }
    }
    for (const clip of CLIP_NAMES) {
      if (typeof entry.clipPaths?.[clip] !== "string") {
        throw new Error(`Gallery manifest ${label}: missing clip path "${clip}".`);
      }
    }
    if (typeof entry.stageCredits !== "object" || entry.stageCredits === null) {
      throw new Error(`Gallery manifest ${label}: missing stageCredits.`);
    }
    return entry as GalleryEntry;
  });
}

/** Fetch and validate the gallery manifest. Throws on HTTP or shape errors. */
export async function loadGalleryManifest(): Promise<GalleryManifest> {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Gallery manifest fetch failed: ${response.status}.`);
  }
  return parseGalleryManifest(await response.json());
}

/** Point the scene's character slot at a manifest entry's GLBs. */
export function toCharacterSource(entry: GalleryEntry): CharacterSource {
  return {
    rig: entry.glbPath,
    clips: Object.fromEntries(
      CLIP_NAMES.map((clip) => [clip, entry.clipPaths[clip]]),
    ) as Record<ClipName, string>,
  };
}

/** "55 credits. About 7 minutes." — numbers are copy (DESIGN.md voice). */
export function formatReceipt(entry: GalleryEntry): string {
  const credits = `${entry.creditTotal} credit${entry.creditTotal === 1 ? "" : "s"}`;
  if (entry.generationSeconds < 60) {
    return `${credits}. About ${Math.round(entry.generationSeconds)} seconds.`;
  }
  const minutes = Math.round(entry.generationSeconds / 60);
  return `${credits}. About ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
