/**
 * Gallery manifest: the `GalleryEntry` shape (docs/ARCHITECTURE.md §2), its
 * validator, receipt math, and the reader/writer for
 * `public/gallery/manifest.json`.
 *
 * Receipts are REAL numbers from the run — per-task `consumed_credits` and
 * clock timestamps — never the published price list. The gallery UI (US-02)
 * renders these verbatim: "the real price of what Meshy makes."
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  ANIMATION_CLIPS,
  PIPELINE_STAGES,
  type AnimationClip,
  type PipelineRun,
  type StageId,
} from "../../lib/meshy/types";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * One pre-generated character (docs/ARCHITECTURE.md §2). `glbPath` is the
 * rigged mesh the scene renders; `clipPaths` are animation-only GLBs — the
 * clip loader reads `gltf.animations[0]` and never renders them, so the
 * optimizer strips their duplicate mesh + texture (~8.9 MB → ~35 KB each).
 */
export interface GalleryEntry {
  slug: string;
  prompt: string;
  /** URL path (under public/) of the optimized rig GLB. */
  glbPath: string;
  /** URL paths of the five animation-only clip GLBs. */
  clipPaths: Record<AnimationClip, string>;
  /** Real credits consumed, summed across stages (= sum of stageCredits). */
  creditTotal: number;
  /** Active generation time: linear stages + the longest of the five parallel animate tasks. Queue waits excluded. */
  generationSeconds: number;
  /** Per-stage `consumed_credits` as reported by each Meshy task. */
  stageCredits: Record<StageId, number>;
  /** Triangle count of the optimized rig mesh. */
  polyCount: number;
  /** URL path of the merged single-file game-ready GLB (US-10). Absent until `npm run pregen:gameready` runs. */
  gameReadyPath?: string;
  /** Byte size of the game-ready GLB, for honest size copy in the UI. */
  gameReadySizeBytes?: number;
}

/** The manifest is a plain array — the gallery renders every entry. */
export type GalleryManifest = GalleryEntry[];

export const MANIFEST_FILE = "manifest.json";
/** URL prefix the app fetches gallery assets from (files live in public/gallery/). */
export const GALLERY_URL_PREFIX = "/gallery";

// ---------------------------------------------------------------------------
// Validation — the manifest is committed data; trust nothing
// ---------------------------------------------------------------------------

/** Structural problems with a would-be GalleryEntry; empty array = valid. */
export function galleryEntryErrors(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return ["entry is not an object"];
  const entry = value as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of ["slug", "prompt", "glbPath"] as const) {
    if (typeof entry[key] !== "string" || entry[key] === "") {
      errors.push(`${key} must be a non-empty string`);
    }
  }
  for (const key of ["creditTotal", "generationSeconds", "polyCount"] as const) {
    if (typeof entry[key] !== "number" || !Number.isFinite(entry[key] as number) || (entry[key] as number) < 0) {
      errors.push(`${key} must be a non-negative number`);
    }
  }

  errors.push(...recordErrors(entry.clipPaths, "clipPaths", ANIMATION_CLIPS, isNonEmptyString));
  errors.push(...recordErrors(entry.stageCredits, "stageCredits", PIPELINE_STAGES, isNonNegativeNumber));

  if (entry.gameReadyPath !== undefined && !isNonEmptyString(entry.gameReadyPath)) {
    errors.push("gameReadyPath must be a non-empty string when present");
  }
  if (entry.gameReadySizeBytes !== undefined && !isNonNegativeNumber(entry.gameReadySizeBytes)) {
    errors.push("gameReadySizeBytes must be a non-negative number when present");
  }

  // Receipt invariant: the headline number is the sum of its breakdown.
  if (errors.length === 0) {
    const sum = PIPELINE_STAGES.reduce(
      (total, stage) => total + (entry.stageCredits as Record<StageId, number>)[stage],
      0,
    );
    if (sum !== entry.creditTotal) {
      errors.push(`creditTotal ${String(entry.creditTotal)} != sum of stageCredits ${String(sum)}`);
    }
  }
  return errors;
}

export function manifestErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return ["manifest is not an array"];
  const errors = value.flatMap((entry, i) =>
    galleryEntryErrors(entry).map((problem) => `entry[${String(i)}]: ${problem}`),
  );
  const slugs = value.map((entry) => (entry as GalleryEntry).slug);
  if (new Set(slugs).size !== slugs.length) errors.push("duplicate slugs in manifest");
  return errors;
}

export function assertValidManifest(value: unknown): asserts value is GalleryManifest {
  const errors = manifestErrors(value);
  if (errors.length > 0) throw new Error(`invalid gallery manifest:\n  ${errors.join("\n  ")}`);
}

// ---------------------------------------------------------------------------
// Receipts from a completed PipelineRun
// ---------------------------------------------------------------------------

export interface Receipts {
  creditTotal: number;
  generationSeconds: number;
  stageCredits: Record<StageId, number>;
}

/**
 * Fold a succeeded run's per-stage records into gallery receipts. The five
 * animate tasks run as one parallel group, so active time counts the group
 * once — by its longest clip — not five times.
 */
export function receiptsFromRun(run: PipelineRun): Receipts {
  const stageCredits = Object.fromEntries(
    PIPELINE_STAGES.map((stage) => {
      const credits = run.stages[stage].creditCost;
      if (credits === null) throw new Error(`stage ${stage} has no consumed_credits — run incomplete?`);
      return [stage, credits];
    }),
  ) as Record<StageId, number>;

  let linearSeconds = 0;
  let longestClipSeconds = 0;
  for (const stage of PIPELINE_STAGES) {
    const { startedAt, completedAt } = run.stages[stage];
    if (startedAt === null || completedAt === null) {
      throw new Error(`stage ${stage} has no timestamps — run incomplete?`);
    }
    const seconds = (completedAt - startedAt) / 1000;
    if (stage.startsWith("animate:")) longestClipSeconds = Math.max(longestClipSeconds, seconds);
    else linearSeconds += seconds;
  }

  return {
    creditTotal: Object.values(stageCredits).reduce((sum, credits) => sum + credits, 0),
    generationSeconds: Math.round(linearSeconds + longestClipSeconds),
    stageCredits,
  };
}

// ---------------------------------------------------------------------------
// Files on disk
// ---------------------------------------------------------------------------

/** Content-hashed name (`rig.1a2b3c4d.glb`) → immutable long-cache assets (ARCHITECTURE §4 Caching). */
export function hashedGlbName(stem: string, bytes: Uint8Array): string {
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  return `${stem}.${hash}.glb`;
}

/**
 * Write one character's optimized GLBs into `<galleryDir>/<slug>/`, replacing
 * whatever was there (hashes change when the optimizer changes), and return
 * the URL paths the manifest should carry.
 */
export function writeCharacterFiles(
  galleryDir: string,
  slug: string,
  glbs: { rig: Uint8Array; clips: Record<AnimationClip, Uint8Array> },
): { glbPath: string; clipPaths: Record<AnimationClip, string> } {
  const characterDir = join(galleryDir, slug);
  rmSync(characterDir, { recursive: true, force: true });
  mkdirSync(characterDir, { recursive: true });

  const write = (stem: string, bytes: Uint8Array): string => {
    const name = hashedGlbName(stem, bytes);
    writeFileSync(join(characterDir, name), bytes);
    return `${GALLERY_URL_PREFIX}/${slug}/${name}`;
  };

  return {
    glbPath: write("rig", glbs.rig),
    clipPaths: Object.fromEntries(
      ANIMATION_CLIPS.map((clip) => [clip, write(clip, glbs.clips[clip])]),
    ) as Record<AnimationClip, string>,
  };
}

export function readManifest(galleryDir: string): GalleryManifest {
  let raw: string;
  try {
    raw = readFileSync(join(galleryDir, MANIFEST_FILE), "utf8");
  } catch {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  assertValidManifest(parsed);
  return parsed;
}

/** Insert or replace by slug (a re-run refreshes an entry in place). */
export function upsertEntry(manifest: GalleryManifest, entry: GalleryEntry): GalleryManifest {
  const index = manifest.findIndex((existing) => existing.slug === entry.slug);
  if (index === -1) return [...manifest, entry];
  return manifest.map((existing, i) => (i === index ? entry : existing));
}

export function writeManifest(galleryDir: string, manifest: GalleryManifest): void {
  assertValidManifest(manifest);
  mkdirSync(galleryDir, { recursive: true });
  writeFileSync(join(galleryDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Slug directories with no manifest entry (stale leftovers worth flagging). */
export function orphanedCharacterDirs(galleryDir: string, manifest: GalleryManifest): string[] {
  let names: string[];
  try {
    names = readdirSync(galleryDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return [];
  }
  const known = new Set(manifest.map((entry) => entry.slug));
  return names.filter((name) => !known.has(name));
}

// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value !== "";
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function recordErrors(
  value: unknown,
  label: string,
  keys: readonly string[],
  isValid: (value: unknown) => boolean,
): string[] {
  if (typeof value !== "object" || value === null) return [`${label} must be an object`];
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of keys) {
    if (!(key in record)) errors.push(`${label} is missing "${key}"`);
    else if (!isValid(record[key])) errors.push(`${label}.${key} is invalid`);
  }
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) errors.push(`${label} has unknown key "${key}"`);
  }
  return errors;
}
