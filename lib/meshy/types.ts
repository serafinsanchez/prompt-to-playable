/**
 * Shared types for the Meshy client and character pipeline.
 *
 * API behavior source of truth: ../claude-code-resources/MESHY_CLAUDE.md
 * (facts copied, never imported). Text to 3D is v2; every other endpoint v1.
 * Isomorphic: no window/process access anywhere in lib/meshy/.
 */

// ---------------------------------------------------------------------------
// Meshy task model
// ---------------------------------------------------------------------------

export const TASK_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface MeshyTaskError {
  message: string;
}

/**
 * Rigging and Animation tasks nest their outputs under `result` instead of
 * `model_urls` (validated live in TASK-05 against docs.meshy.ai).
 */
export interface MeshyTaskResult {
  rigged_character_glb_url?: string;
  rigged_character_fbx_url?: string;
  animation_glb_url?: string;
  animation_fbx_url?: string;
  basic_animations?: Partial<
    Record<
      | "walking_glb_url"
      | "walking_fbx_url"
      | "walking_armature_glb_url"
      | "running_glb_url"
      | "running_fbx_url"
      | "running_armature_glb_url",
      string
    >
  >;
}

/** Mirror of Meshy's async task object — the subset the pipeline reads. */
export interface MeshyTask {
  id: string;
  status: TaskStatus;
  /** 0–100 */
  progress: number;
  /** 0 on FAILED tasks — Meshy auto-refunds. */
  consumed_credits?: number;
  model_urls?: Partial<Record<"glb" | "fbx" | "obj" | "usdz" | "stl", string>>;
  /** Present on rigging/animation retrieves; text-to-3d uses model_urls. */
  result?: MeshyTaskResult;
  texture_urls?: Array<Record<string, string>>;
  thumbnail_url?: string;
  task_error?: MeshyTaskError;
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

export const ANIMATION_CLIPS = ["idle", "walk", "run", "jump", "emote"] as const;

export type AnimationClip = (typeof ANIMATION_CLIPS)[number];

export type StageId = "preview" | "refine" | "rig" | `animate:${AnimationClip}`;

/** Execution order. The five animate stages run as one parallel group after rig. */
export const PIPELINE_STAGES: readonly StageId[] = [
  "preview",
  "refine",
  "rig",
  ...ANIMATION_CLIPS.map((clip): StageId => `animate:${clip}`),
];

/** Expected credit cost per stage (docs/ARCHITECTURE.md §4) — 50 total. */
export const STAGE_CREDITS: Record<StageId, number> = {
  preview: 20,
  refine: 10,
  rig: 5,
  "animate:idle": 3,
  "animate:walk": 3,
  "animate:run": 3,
  "animate:jump": 3,
  "animate:emote": 3,
};

export type StageStatus = "pending" | "running" | "succeeded" | "failed";

export interface StageState {
  stage: StageId;
  status: StageStatus;
  taskId: string | null;
  /** 0–100, mirrored from the Meshy task. */
  progress: number;
  /** Actual credits consumed, captured on the terminal status. */
  creditCost: number | null;
  modelUrl: string | null;
  /** Clock timestamps (ms) — captured via the injected clock, never Date.now(). */
  startedAt: number | null;
  completedAt: number | null;
  /** Meshy's task_error.message, verbatim, when the stage failed. */
  error: string | null;
}

export type PipelineStatus = "idle" | "running" | "succeeded" | "failed";

/**
 * One generation attempt. Plain serializable data: this is exactly what
 * storage.ts persists and what UI snapshots expose. (docs/ARCHITECTURE.md §2)
 */
export interface PipelineRun {
  prompt: string;
  status: PipelineStatus;
  stages: Record<StageId, StageState>;
  startedAt: number | null;
  completedAt: number | null;
  /** Sum of creditCost across terminal stages (failed stages auto-refund to 0). */
  creditsSpent: number;
  /** True while Meshy reports NoMoreConcurrentTasks — "queue full, waiting". */
  waitingForQueue: boolean;
  /** Current RateLimitExceeded back-off, doubling per consecutive hit; null when healthy. */
  rateLimitBackoffMs: number | null;
  /** Next tick at or after this clock time actually polls; earlier ticks no-op. */
  nextPollAt: number | null;
}

// ---------------------------------------------------------------------------
// Typed errors — the two 429 flavors need different handling
// ---------------------------------------------------------------------------

export class MeshyApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "MeshyApiError";
    this.status = status;
    this.code = code;
  }
}

/** 429: too many requests per second — back off the send rate and retry. */
export class RateLimitExceededError extends MeshyApiError {
  constructor(message: string) {
    super(429, "RateLimitExceeded", message);
    this.name = "RateLimitExceededError";
  }
}

/** 429: account queue is full — keep polling at normal cadence until a slot frees. */
export class NoMoreConcurrentTasksError extends MeshyApiError {
  constructor(message: string) {
    super(429, "NoMoreConcurrentTasks", message);
    this.name = "NoMoreConcurrentTasksError";
  }
}
