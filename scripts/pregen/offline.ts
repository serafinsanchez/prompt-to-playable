/**
 * Offline mode: rebuild the gallery from `spike-output/` with ZERO network
 * and zero credits. This is how the committed knight entry is produced, and
 * how the optimizer + manifest writer stay verifiable without spending
 * anything (TASK-06a constraint: no live generations — TASK-06b owns those).
 *
 * The receipts are REAL: task ids come from `spike-output/run.json`, credits
 * and timings from the day-0 live run log in `scripts/spike/README.md`
 * (balance deltas matched task-reported `consumed_credits` exactly).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ANIMATION_CLIPS, type AnimationClip, type StageId } from "../../lib/meshy/types";
import {
  readManifest,
  receiptsFromRun,
  upsertEntry,
  writeCharacterFiles,
  writeManifest,
  type GalleryEntry,
  type Receipts,
} from "./manifest";
import { createGalleryIO, formatBytes, optimizeCharacter } from "./optimize";
import { GALLERY_PROMPTS } from "./prompts";

// `receiptsFromRun` is the live-run path; re-exported here so offline and
// live manifest writing share one receipts definition.
export { receiptsFromRun };

export const KNIGHT_SLUG = "knight";

/**
 * Real receipts from the day-0 spike (scripts/spike/README.md, runs 1 + 2,
 * 2026-08-03; balance 185 → 130, delta 55 = task-reported credits exactly):
 *
 * - preview 20c / 59s; refine 10c / 2.6 min; remesh 5c / ~2.5 min ACTIVE
 *   (the ~2h PENDING queue wait is excluded — generationSeconds is active
 *   generation time); rig 5c / 49s; animate 3c ×5 / 13–17s each (parallel
 *   group counted once, by its longest clip).
 */
export const KNIGHT_RECEIPTS: Receipts = {
  creditTotal: 55,
  generationSeconds: 59 + 156 + 150 + 49 + 17, // = 431
  stageCredits: {
    preview: 20,
    refine: 10,
    remesh: 5,
    rig: 5,
    "animate:idle": 3,
    "animate:walk": 3,
    "animate:run": 3,
    "animate:jump": 3,
    "animate:emote": 3,
  },
};

/** Task ids the spike's resume lane persisted — the run's paper trail. */
const REQUIRED_RUN_IDS = ["remesh", "rig", ...ANIMATION_CLIPS.map((clip) => `animate:${clip}`)];

export interface SeedOptions {
  /** Directory holding the spike GLBs + run.json (gitignored, ~54 MB). */
  spikeDir: string;
  /** Target gallery directory (normally `public/gallery`). */
  galleryDir: string;
  log?: (line: string) => void;
}

/**
 * Read the spike knight's raw GLBs, optimize them, and write the gallery
 * entry + manifest. Pure filesystem — safe to run anywhere spike-output/
 * exists, and re-running is idempotent (same inputs → same hashes).
 */
export async function seedKnightFromSpike(options: SeedOptions): Promise<GalleryEntry> {
  const { spikeDir, galleryDir, log = () => undefined } = options;

  verifySpikeRunEvidence(spikeDir);
  const raw = {
    rig: new Uint8Array(readFileSync(join(spikeDir, "rig.glb"))),
    clips: Object.fromEntries(
      ANIMATION_CLIPS.map((clip) => [
        clip,
        new Uint8Array(readFileSync(join(spikeDir, `animate-${clip}.glb`))),
      ]),
    ) as Record<AnimationClip, Uint8Array>,
  };

  const io = await createGalleryIO();
  const optimized = await optimizeCharacter(io, raw);
  for (const [name, { bytesIn, bytesOut }] of Object.entries(optimized.stats)) {
    log(`  ${name.padEnd(6)} ${formatBytes(bytesIn).padStart(9)} → ${formatBytes(bytesOut)}`);
  }

  const knight = GALLERY_PROMPTS.find((prompt) => prompt.slug === KNIGHT_SLUG);
  if (!knight) throw new Error(`prompt list has no "${KNIGHT_SLUG}" entry`);

  const paths = writeCharacterFiles(galleryDir, KNIGHT_SLUG, optimized);
  const entry: GalleryEntry = {
    slug: KNIGHT_SLUG,
    prompt: knight.prompt,
    glbPath: paths.glbPath,
    clipPaths: paths.clipPaths,
    ...KNIGHT_RECEIPTS,
    polyCount: optimized.polyCount,
  };

  writeManifest(galleryDir, upsertEntry(readManifest(galleryDir), entry));
  log(`  manifest: upserted "${KNIGHT_SLUG}" (${String(optimized.polyCount)} tris, ${String(entry.creditTotal)} credits, ${String(entry.generationSeconds)}s active)`);
  return entry;
}

/** Refuse to fabricate receipts: the spike's run.json must prove the run happened. */
function verifySpikeRunEvidence(spikeDir: string): void {
  const runPath = join(spikeDir, "run.json");
  if (!existsSync(runPath)) {
    throw new Error(
      `${runPath} not found — offline mode rebuilds from a real spike run and never invents receipts. ` +
        "Run the TASK-05 spike first (scripts/spike/README.md).",
    );
  }
  const runIds = JSON.parse(readFileSync(runPath, "utf8")) as Partial<Record<string, string>>;
  const missing = REQUIRED_RUN_IDS.filter((stage) => typeof runIds[stage] !== "string");
  if (missing.length > 0) {
    throw new Error(`spike run.json is missing task ids for: ${missing.join(", ")}`);
  }
  for (const stage of ANIMATION_CLIPS) {
    if (!existsSync(join(spikeDir, `animate-${stage}.glb`))) {
      throw new Error(`spike GLB missing: animate-${stage}.glb`);
    }
  }
}

/** Sanity guard shared with tests: receipts must satisfy the manifest invariant. */
export function knightStageCreditSum(): number {
  return (Object.keys(KNIGHT_RECEIPTS.stageCredits) as StageId[]).reduce(
    (sum, stage) => sum + KNIGHT_RECEIPTS.stageCredits[stage],
    0,
  );
}
