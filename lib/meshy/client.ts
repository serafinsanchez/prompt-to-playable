/**
 * Typed Meshy API calls — thin, no polling (pipeline.ts owns cadence).
 *
 * Text to 3D is v2; rigging, animations, remesh, and balance are v1
 * (../claude-code-resources/MESHY_CLAUDE.md). Chaining is always by task id
 * (`preview_task_id` / `input_task_id`) — never download-and-reupload.
 */

import { REMESH_TARGET_POLYCOUNT, type AnimationClip, type MeshyTask } from "./types";
import type { MeshyTransport } from "./transport";

export const TEXT_TO_3D_PATH = "/openapi/v2/text-to-3d";

/**
 * Rig-friendly generation defaults, always sent on preview (docs.meshy.ai
 * text-to-3d v2; `symmetry_mode`/`is_a_t_pose` are deprecated no-ops).
 * A-pose over T-pose: auto-skinning handles ~45° shoulders better, and a
 * neutral standing pose is what the rigging stage needs — action poses are
 * the top cause of bad rigs and duplicated-limb artifacts.
 */
export const PREVIEW_POSE_MODE = "a-pose";
/** Quads deform better under skinning than triangle soup. */
export const PREVIEW_TOPOLOGY = "quad";

/**
 * Pinned generation model for both preview and refine (docs.meshy.ai
 * text-to-3d v2). Pinned instead of "latest" so results are reproducible
 * and the API panel teaches a real choice.
 */
export const TEXT_TO_3D_AI_MODEL = "meshy-6";
/**
 * meshy-6 defaults should_remesh to FALSE — without forcing it on, the
 * topology/target_polycount params below are silently ignored and preview
 * returns raw high-poly triangles.
 */
export const PREVIEW_SHOULD_REMESH = true;
/** Same budget the remesh stage targets — literally shared, not just numerically equal. */
export const PREVIEW_TARGET_POLYCOUNT = REMESH_TARGET_POLYCOUNT;

/**
 * Refine texture steer: generative texturing can't spell, so any prompt
 * that implies logos or jersey lettering comes back as smudged glyphs.
 * Appended to the user's prompt — never sent alone, or the texture pass
 * loses the character description entirely.
 */
export const REFINE_TEXTURE_STEER =
  "clean fabric and materials, no text, no logos, no lettering";
/** docs.meshy.ai: base color resolution, default 2k. 4k is the visual ceiling worth paying for. */
export const REFINE_TEXTURE_RESOLUTION = "4k";
/** Delit base color (v6 default, sent explicitly) — the R3F scene does its own lighting. */
export const REFINE_REMOVE_LIGHTING = true;

/** Meshy caps texture_prompt at 600 chars; user prompt leads, steer always survives. */
const TEXTURE_PROMPT_MAX = 600;
export function buildRefineTexturePrompt(prompt: string): string {
  const lead = prompt.slice(0, TEXTURE_PROMPT_MAX - REFINE_TEXTURE_STEER.length - 2).trimEnd();
  return lead ? `${lead}, ${REFINE_TEXTURE_STEER}` : REFINE_TEXTURE_STEER;
}
export const RIGGING_PATH = "/openapi/v1/rigging";
export const ANIMATIONS_PATH = "/openapi/v1/animations";
export const REMESH_PATH = "/openapi/v1/remesh";
export const BALANCE_PATH = "/openapi/v1/balance";

/**
 * Meshy animation-library action ids for the five locomotion clips
 * (docs.meshy.ai Animation Library Reference, validated in TASK-05).
 * `v1/animations` takes `rig_task_id` + integer `action_id` — not the
 * `input_task_id`/`action` string shape the other chained endpoints use.
 */
export const ANIMATION_CLIP_ACTIONS: Record<AnimationClip, number> = {
  idle: 0, // Idle
  walk: 30, // Casual_Walk
  run: 14, // Run_02
  jump: 466, // Regular_Jump
  emote: 28, // Big_Wave_Hello
};

/**
 * Remesh defaults to TRIANGLE topology (docs.meshy.ai) — but this stage's
 * output is what rigging skins, and quads deform far better under skinning.
 * Requesting quad on preview alone is not enough; it must be re-asserted here.
 */
export const REMESH_TOPOLOGY = "quad";
/** Explicit humanoid scale for auto-rigging (docs default 1.7m) — deterministic playground scale. */
export const RIG_HEIGHT_METERS = 1.7;

/**
 * Where a task's GLB lives depends on the endpoint family: text-to-3d (and
 * remesh) publish `model_urls.glb`; rigging and animation nest URLs under
 * `result`. One extractor so the pipeline stays shape-agnostic.
 */
export function taskGlbUrl(task: MeshyTask): string | null {
  return (
    task.model_urls?.glb ??
    task.result?.rigged_character_glb_url ??
    task.result?.animation_glb_url ??
    null
  );
}

export interface MeshyClient {
  /** POST v2 text-to-3d { mode: "preview" } → task id. */
  createPreviewTask(prompt: string): Promise<string>;
  /** POST v2 text-to-3d { mode: "refine", preview_task_id } with 4k PBR steered by the run prompt → task id. */
  createRefineTask(previewTaskId: string, prompt: string): Promise<string>;
  getTextTo3DTask(taskId: string): Promise<MeshyTask>;
  /** POST v1 rigging chained by input_task_id → task id. */
  createRigTask(inputTaskId: string): Promise<string>;
  getRigTask(taskId: string): Promise<MeshyTask>;
  /** POST v1 animations chained by rig_task_id for one clip → task id. */
  createAnimationTask(rigTaskId: string, clip: AnimationClip): Promise<string>;
  getAnimationTask(taskId: string): Promise<MeshyTask>;
  /** POST v1 remesh chained by input_task_id → task id (mandatory before rig — refine output exceeds rigging's 300k-face limit). */
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
      create(TEXT_TO_3D_PATH, {
        mode: "preview",
        prompt,
        pose_mode: PREVIEW_POSE_MODE,
        topology: PREVIEW_TOPOLOGY,
        ai_model: TEXT_TO_3D_AI_MODEL,
        should_remesh: PREVIEW_SHOULD_REMESH,
        target_polycount: PREVIEW_TARGET_POLYCOUNT,
      }),
    createRefineTask: (previewTaskId, prompt) =>
      create(TEXT_TO_3D_PATH, {
        mode: "refine",
        preview_task_id: previewTaskId,
        enable_pbr: true,
        ai_model: TEXT_TO_3D_AI_MODEL,
        texture_resolution: REFINE_TEXTURE_RESOLUTION,
        remove_lighting: REFINE_REMOVE_LIGHTING,
        texture_prompt: buildRefineTexturePrompt(prompt),
      }),
    getTextTo3DTask: (taskId) => get(TEXT_TO_3D_PATH, taskId),
    createRigTask: (inputTaskId) =>
      create(RIGGING_PATH, { input_task_id: inputTaskId, height_meters: RIG_HEIGHT_METERS }),
    getRigTask: (taskId) => get(RIGGING_PATH, taskId),
    createAnimationTask: (rigTaskId, clip) =>
      create(ANIMATIONS_PATH, {
        rig_task_id: rigTaskId,
        action_id: ANIMATION_CLIP_ACTIONS[clip],
      }),
    getAnimationTask: (taskId) => get(ANIMATIONS_PATH, taskId),
    createRemeshTask: (inputTaskId, targetPolycount) =>
      create(REMESH_PATH, {
        input_task_id: inputTaskId,
        topology: REMESH_TOPOLOGY,
        ...(targetPolycount !== undefined ? { target_polycount: targetPolycount } : {}),
      }),
    getRemeshTask: (taskId) => get(REMESH_PATH, taskId),
    getBalance: async () => {
      const json = (await transport(BALANCE_PATH)) as { balance: number };
      return json.balance;
    },
  };
}
