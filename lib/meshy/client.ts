/**
 * Typed Meshy API calls — thin, no polling (pipeline.ts owns cadence).
 *
 * Text to 3D is v2; rigging, animations, remesh, and balance are v1
 * (../claude-code-resources/MESHY_CLAUDE.md). Chaining is always by task id
 * (`preview_task_id` / `input_task_id`) — never download-and-reupload.
 */

import type { AnimationClip, MeshyTask } from "./types";
import type { MeshyTransport } from "./transport";

export const TEXT_TO_3D_PATH = "/openapi/v2/text-to-3d";
export const RIGGING_PATH = "/openapi/v1/rigging";
export const ANIMATIONS_PATH = "/openapi/v1/animations";
export const REMESH_PATH = "/openapi/v1/remesh";
export const BALANCE_PATH = "/openapi/v1/balance";

/**
 * Meshy action selectors for the five locomotion clips, in one place so
 * TASK-05 (the day-0 spike) can correct ids against live API output without
 * touching any pipeline logic. `v1/animations` is the least-documented
 * endpoint — treat these values as provisional until validated live.
 */
export const ANIMATION_CLIP_ACTIONS: Record<AnimationClip, string> = {
  idle: "idle",
  walk: "walk",
  run: "run",
  jump: "jump",
  emote: "wave",
};

export interface MeshyClient {
  /** POST v2 text-to-3d { mode: "preview" } → task id. */
  createPreviewTask(prompt: string): Promise<string>;
  /** POST v2 text-to-3d { mode: "refine", preview_task_id } with PBR → task id. */
  createRefineTask(previewTaskId: string): Promise<string>;
  getTextTo3DTask(taskId: string): Promise<MeshyTask>;
  /** POST v1 rigging chained by input_task_id → task id. */
  createRigTask(inputTaskId: string): Promise<string>;
  getRigTask(taskId: string): Promise<MeshyTask>;
  /** POST v1 animations chained by input_task_id for one clip → task id. */
  createAnimationTask(inputTaskId: string, clip: AnimationClip): Promise<string>;
  getAnimationTask(taskId: string): Promise<MeshyTask>;
  /** POST v1 remesh chained by input_task_id → task id (optional stage, spike-decided). */
  createRemeshTask(inputTaskId: string, targetPolycount?: number): Promise<string>;
  getRemeshTask(taskId: string): Promise<MeshyTask>;
  /** GET v1 balance → remaining credits. */
  getBalance(): Promise<number>;
}

export function createMeshyClient(transport: MeshyTransport): MeshyClient {
  const create = async (path: string, body: Record<string, unknown>): Promise<string> => {
    const json = await transport(path, { method: "POST", body });
    const result =
      typeof json === "object" && json !== null
        ? (json as Record<string, unknown>).result
        : undefined;
    if (typeof result !== "string" || result === "") {
      throw new Error(`Meshy create response for ${path} carried no "result" task id`);
    }
    return result;
  };

  const get = async (path: string, taskId: string): Promise<MeshyTask> =>
    (await transport(`${path}/${taskId}`)) as MeshyTask;

  return {
    createPreviewTask: (prompt) =>
      create(TEXT_TO_3D_PATH, { mode: "preview", prompt }),
    createRefineTask: (previewTaskId) =>
      create(TEXT_TO_3D_PATH, {
        mode: "refine",
        preview_task_id: previewTaskId,
        enable_pbr: true,
      }),
    getTextTo3DTask: (taskId) => get(TEXT_TO_3D_PATH, taskId),
    createRigTask: (inputTaskId) => create(RIGGING_PATH, { input_task_id: inputTaskId }),
    getRigTask: (taskId) => get(RIGGING_PATH, taskId),
    createAnimationTask: (inputTaskId, clip) =>
      create(ANIMATIONS_PATH, {
        input_task_id: inputTaskId,
        action: ANIMATION_CLIP_ACTIONS[clip],
      }),
    getAnimationTask: (taskId) => get(ANIMATIONS_PATH, taskId),
    createRemeshTask: (inputTaskId, targetPolycount) =>
      create(REMESH_PATH, {
        input_task_id: inputTaskId,
        ...(targetPolycount !== undefined ? { target_polycount: targetPolycount } : {}),
      }),
    getRemeshTask: (taskId) => get(REMESH_PATH, taskId),
    getBalance: async () => {
      const json = (await transport(BALANCE_PATH)) as { balance: number };
      return json.balance;
    },
  };
}
