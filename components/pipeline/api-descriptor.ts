/**
 * US-04 descriptor map: the request behind every pipeline stage, derived
 * from lib/meshy/client.ts's exported constants + the run snapshot — never
 * by intercepting the transport, never by duplicating path strings by hand.
 * A sync test drives the real client and compares; if client.ts changes,
 * the test fails before the panel can lie.
 *
 * The visitor's key appears NOWHERE here by construction: these functions
 * take only the run snapshot. Display shows a masked header; the curl uses
 * a $MESHY_API_KEY env placeholder (ARCHITECTURE §4: never logged, never
 * displayed).
 */

import {
  ANIMATION_CLIP_ACTIONS,
  ANIMATIONS_PATH,
  REMESH_PATH,
  RIGGING_PATH,
  TEXT_TO_3D_PATH,
} from "../../lib/meshy/client";
import {
  REMESH_TARGET_POLYCOUNT,
  STAGE_CREDITS,
  type AnimationClip,
  type PipelineRun,
  type StageId,
  type StageState,
} from "../../lib/meshy/types";

/** What the display header masks the proxy key header to — fixed copy, never interpolated. */
export const MASKED_KEY_HEADER = "x-meshy-key: •••";

/** The real Meshy host, for the copyable curl. The app itself always calls the proxy. */
export const MESHY_HOST = "https://api.meshy.ai";

/** One line of honesty about the passthrough (shown once per panel). */
export const PROXY_CAPTION =
  "sent via the app's passthrough proxy — same path, key becomes a header server-side.";

export interface StageRequest {
  method: "POST";
  /** Real Meshy path (also the proxy-relative path under /api/meshy). */
  path: string;
  /** The v2/v1 split is deliberate Meshy API surface — one badge teaches it. */
  version: "v1" | "v2";
  body: Record<string, unknown>;
}

const taskIdOr = (run: PipelineRun, stage: StageId, placeholder: string): string =>
  run.stages[stage].taskId ?? placeholder;

export function stageRequest(run: PipelineRun, stage: StageId): StageRequest {
  const request = (path: string, body: Record<string, unknown>): StageRequest => ({
    method: "POST",
    path,
    version: path.includes("/v2/") ? "v2" : "v1",
    body,
  });

  if (stage === "preview") {
    return request(TEXT_TO_3D_PATH, { mode: "preview", prompt: run.prompt });
  }
  if (stage === "refine") {
    return request(TEXT_TO_3D_PATH, {
      mode: "refine",
      preview_task_id: taskIdOr(run, "preview", "<preview-task-id>"),
      enable_pbr: true,
    });
  }
  if (stage === "remesh") {
    return request(REMESH_PATH, {
      input_task_id: taskIdOr(run, "refine", "<refine-task-id>"),
      target_polycount: REMESH_TARGET_POLYCOUNT,
    });
  }
  if (stage === "rig") {
    return request(RIGGING_PATH, {
      input_task_id: taskIdOr(run, "remesh", "<remesh-task-id>"),
    });
  }
  const clip = stage.slice("animate:".length) as AnimationClip;
  return request(ANIMATIONS_PATH, {
    rig_task_id: taskIdOr(run, "rig", "<rig-task-id>"),
    action_id: ANIMATION_CLIP_ACTIONS[clip],
  });
}

/** Runnable reproduction against the real host; key stays an env var. */
export function stageCurl(request: StageRequest): string {
  // Close-escape-reopen every single quote so prompts like "a knight's
  // sword" survive the shell ('…'\''…').
  const payload = JSON.stringify(request.body, null, 2).replace(/'/g, `'\\''`);
  return [
    `curl -X ${request.method} ${MESHY_HOST}${request.path} \\`,
    `  -H "Authorization: Bearer $MESHY_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${payload}'`,
  ].join("\n");
}

/** Credit line: published price until the task is terminal, then the truth. */
export function creditCopy(state: StageState, stage: StageId): string {
  if (state.status === "succeeded") {
    return `${String(state.creditCost ?? 0)} credits consumed`;
  }
  if (state.status === "failed") {
    // Only claim auto-refund when the refund actually happened (cost 0).
    const cost = state.creditCost ?? 0;
    return cost > 0
      ? `${String(cost)} credits consumed — no auto-refund reported`
      : `0 credits — failed tasks auto-refund`;
  }
  return `${String(STAGE_CREDITS[stage])} credits`;
}
