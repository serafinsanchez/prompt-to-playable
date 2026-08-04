/**
 * Pipeline runner — drives ONE character through the shared six-stage state
 * machine (`lib/meshy/pipeline.ts`): preview → refine+PBR → remesh → rig →
 * animate ×5. This is the teaching artifact for integrating Meshy from Node:
 * the exact code the browser app runs, driven on a plain interval with the
 * direct transport instead of the proxy.
 *
 * Two operational rules the Meshy API imposes, both handled here:
 *
 * - RESUMABILITY: every snapshot is persisted via `saveRun` after every tick.
 *   Task ids are the resume currency — a crashed run restarts from its stored
 *   `PipelineRun` and keeps polling the same tasks instead of re-spending
 *   credits (a full character costs 55).
 * - DOWNLOAD IMMEDIATELY: Meshy's signed asset URLs expire after 3 days. The
 *   moment a stage the gallery needs (rig + the five clips) reports
 *   SUCCEEDED, its GLB is fetched — never stored as a URL.
 *
 * Everything with a side effect (clock, sleep, fetch, state file, logging) is
 * injected, so tests drive the whole runner against the fixture transport
 * with zero network and fake time.
 */

import { createPipeline, POLL_INTERVAL_MS, type Clock } from "../../lib/meshy/pipeline";
import type { MeshyClient } from "../../lib/meshy/client";
import {
  ANIMATION_CLIPS,
  PIPELINE_STAGES,
  type AnimationClip,
  type PipelineRun,
  type StageId,
} from "../../lib/meshy/types";
import type { GalleryPrompt } from "./prompts";

/** The stages whose GLBs the gallery ships (preview/refine/remesh are intermediates). */
export const GALLERY_GLB_STAGES: readonly StageId[] = [
  "rig",
  ...ANIMATION_CLIPS.map((clip): StageId => `animate:${clip}`),
];

export interface RunnerDeps {
  client: MeshyClient;
  clock: Clock;
  /** Real runs sleep; tests advance the fake clock instead. */
  sleep: (ms: number) => Promise<void>;
  /** Download a signed GLB URL to bytes. */
  fetchGlb: (url: string) => Promise<Uint8Array>;
  /** Load a previously persisted run for this slug, if any. */
  loadRun: (slug: string) => PipelineRun | null;
  /** Persist the latest snapshot (called after every tick). */
  saveRun: (slug: string, run: PipelineRun) => void;
  log: (line: string) => void;
}

export interface RawCharacter {
  run: PipelineRun;
  rig: Uint8Array;
  clips: Record<AnimationClip, Uint8Array>;
}

/**
 * Run (or resume) one character to completion and return its raw GLBs.
 * Throws on stage failure with Meshy's task_error verbatim — failed tasks
 * auto-refund, and upstream task ids stay persisted for the next attempt.
 */
export async function generateCharacter(
  spec: GalleryPrompt,
  deps: RunnerDeps,
): Promise<RawCharacter> {
  const restored = restoreRun(spec, deps);
  const pipeline = createPipeline({
    client: deps.client,
    clock: deps.clock,
    ...(restored ? { run: restored } : {}),
  });
  if (!restored) {
    pipeline.start(spec.prompt);
    deps.saveRun(spec.slug, pipeline.getRun());
  }

  const downloads = new Map<StageId, Uint8Array>();
  const reported = new Map<StageId, string>();

  /** Log fresh stage transitions; download every newly succeeded gallery GLB now. */
  const harvest = async (run: PipelineRun): Promise<void> => {
    for (const stage of PIPELINE_STAGES) {
      const state = run.stages[stage];
      const line = `${state.status}${state.progress ? ` ${String(state.progress)}%` : ""}`;
      if (state.status !== "pending" && reported.get(stage) !== line) {
        reported.set(stage, line);
        deps.log(`[${spec.slug}] ${stage}: ${line}`);
      }
    }
    for (const stage of GALLERY_GLB_STAGES) {
      const state = run.stages[stage];
      if (state.status === "succeeded" && state.modelUrl !== null && !downloads.has(stage)) {
        downloads.set(stage, await deps.fetchGlb(state.modelUrl));
        deps.log(`[${spec.slug}] ${stage}: downloaded GLB (URLs expire in 3 days)`);
      }
    }
  };

  let run = pipeline.getRun();
  await harvest(run); // a resumed run may already hold succeeded stages

  while (run.status === "running") {
    try {
      run = await pipeline.tick();
    } catch (error) {
      // Non-429 API error. The machine kept upstream results — persist them
      // for resume, then let the caller decide.
      deps.saveRun(spec.slug, pipeline.getRun());
      throw error;
    }
    deps.saveRun(spec.slug, run);
    await harvest(run);

    if (run.waitingForQueue) deps.log(`[${spec.slug}] Meshy queue full — waiting`);
    if (run.rateLimitBackoffMs !== null) {
      deps.log(`[${spec.slug}] rate-limited — backing off ${String(run.rateLimitBackoffMs)}ms`);
    }
    if (run.status === "running") await deps.sleep(POLL_INTERVAL_MS);
  }

  if (run.status !== "succeeded") {
    const failed = PIPELINE_STAGES.map((stage) => run.stages[stage]).find(
      (state) => state.status === "failed",
    );
    throw new Error(
      `[${spec.slug}] pipeline ${run.status} at ${failed?.stage ?? "?"}: ` +
        `${failed?.error ?? "no task_error"} (failed tasks auto-refund; task ids kept for resume)`,
    );
  }

  return { run, rig: takeDownload(downloads, "rig", spec.slug), clips: takeClips(downloads, spec.slug) };
}

/** A stored run only counts if it belongs to this prompt — else start fresh. */
function restoreRun(spec: GalleryPrompt, deps: RunnerDeps): PipelineRun | null {
  const restored = deps.loadRun(spec.slug);
  if (restored === null) return null;
  if (restored.prompt !== spec.prompt) {
    deps.log(
      `[${spec.slug}] stored run is for a different prompt — starting fresh (old tasks stay paid-for but unused)`,
    );
    return null;
  }
  if (restored.status === "failed") {
    // Retry-from-failure is deliberate: keep succeeded stages/task ids, flip
    // the run back to running so tick() re-creates only the failed stage.
    deps.log(`[${spec.slug}] resuming a failed run — retrying the failed stage only`);
    return retryableRun(restored);
  }
  deps.log(`[${spec.slug}] resuming stored run (status: ${restored.status})`);
  return restored;
}

/** Reset failed stages to pending so the state machine re-creates their tasks. */
function retryableRun(run: PipelineRun): PipelineRun {
  const retry: PipelineRun = structuredClone(run);
  retry.status = "running";
  retry.completedAt = null;
  retry.nextPollAt = null;
  for (const stage of PIPELINE_STAGES) {
    const state = retry.stages[stage];
    if (state.status === "failed") {
      retry.stages[stage] = {
        stage,
        status: "pending",
        taskId: null,
        progress: 0,
        precedingTasks: null,
        creditCost: null,
        modelUrl: null,
        startedAt: null,
        completedAt: null,
        error: null,
      };
    }
  }
  return retry;
}

function takeDownload(downloads: Map<StageId, Uint8Array>, stage: StageId, slug: string): Uint8Array {
  const bytes = downloads.get(stage);
  if (!bytes) throw new Error(`[${slug}] ${stage} succeeded but its GLB was never downloaded`);
  return bytes;
}

function takeClips(downloads: Map<StageId, Uint8Array>, slug: string): Record<AnimationClip, Uint8Array> {
  return Object.fromEntries(
    ANIMATION_CLIPS.map((clip) => [clip, takeDownload(downloads, `animate:${clip}`, slug)]),
  ) as Record<AnimationClip, Uint8Array>;
}
