/**
 * US-05 completion logic — pure, isomorphic, unit-tested. Maps a succeeded
 * PipelineRun onto (a) the scene's CharacterSource slot and (b) a download
 * plan with prompt-slug filenames. Meshy signed URLs die after ~3 days
 * (CLAUDE.md convention) — expiry is computed here so the UI can show honest
 * copy instead of broken buttons.
 */

import { proxiedAssetUrl } from "../../lib/meshy/assets";
import {
  ANIMATION_CLIPS,
  type AnimationClip,
  type PipelineRun,
} from "../../lib/meshy/types";
import type { CharacterSource } from "../scene/clip-binding";

/** Meshy keeps result assets ~3 days; past this the signed URLs 403. */
export const ASSET_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

const SLUG_MAX_LENGTH = 40;

/** "A Sky Knight!" → "a-sky-knight" — filenames a filesystem won't fight. */
export function promptSlug(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
  return slug === "" ? "character" : slug;
}

/**
 * The run's character for the stage: rig GLB + all five clip GLBs. Null if
 * any URL is missing — a partial character can't bind (clip-binding throws
 * on missing clips), so the play affordance simply doesn't appear.
 */
export function generatedCharacterSource(run: PipelineRun): CharacterSource | null {
  const rig = run.stages.rig.modelUrl;
  if (rig === null) return null;

  const clips: Partial<Record<AnimationClip, string>> = {};
  for (const clip of ANIMATION_CLIPS) {
    const url = run.stages[`animate:${clip}`].modelUrl;
    if (url === null) return null;
    // State holds raw signed URLs (isomorphic — Node pregen fetches them);
    // the browser loader needs the same-origin proxy form (CORS).
    clips[clip] = proxiedAssetUrl(url);
  }
  return { rig: proxiedAssetUrl(rig), clips: clips as Record<AnimationClip, string> };
}

export interface DownloadEntry {
  /** Short mono label for the popover row. */
  label: string;
  /** The distinguishing part, shown in the row ("rig.glb", "idle.glb"). */
  shortName: string;
  /** Suggested filename (browsers honor `download` same-origin only). */
  filename: string;
  url: string;
}

/**
 * Rig first — it is "the" download (spec CONTEXT) — then the five clip GLBs.
 * Stages that never produced a URL are omitted rather than rendered broken.
 */
export function downloadPlan(run: PipelineRun): DownloadEntry[] {
  const slug = promptSlug(run.prompt);
  const plan: DownloadEntry[] = [];

  const rig = run.stages.rig.modelUrl;
  if (rig !== null) {
    plan.push({
      label: "the character",
      shortName: "rig.glb",
      filename: `${slug}-rig.glb`,
      // Proxy form: same-origin, which is also what makes `download` honored.
      url: proxiedAssetUrl(rig),
    });
  }
  for (const clip of ANIMATION_CLIPS) {
    const url = run.stages[`animate:${clip}`].modelUrl;
    if (url !== null) {
      plan.push({
        label: `${clip} clip`,
        shortName: `${clip}.glb`,
        filename: `${slug}-${clip}.glb`,
        url: proxiedAssetUrl(url),
      });
    }
  }
  return plan;
}

/** True once the run's assets are past Meshy's ~3-day retention window. */
export function runAssetsExpired(run: PipelineRun, now: number): boolean {
  return run.completedAt !== null && now - run.completedAt > ASSET_EXPIRY_MS;
}

/** "55 credits. 6 minutes. Yours." — the payoff line (DESIGN.md voice). */
export function completionReceipt(run: PipelineRun): string {
  const credits = `${run.creditsSpent} credit${run.creditsSpent === 1 ? "" : "s"}`;
  if (run.startedAt === null || run.completedAt === null) {
    return `${credits}. Yours.`;
  }
  const seconds = Math.round((run.completedAt - run.startedAt) / 1000);
  const time =
    seconds < 60
      ? `${seconds} second${seconds === 1 ? "" : "s"}`
      : `${Math.round(seconds / 60)} minute${Math.round(seconds / 60) === 1 ? "" : "s"}`;
  return `${credits}. ${time}. Yours.`;
}
