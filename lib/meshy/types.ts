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
  /** Queue depth ahead of a PENDING task — the stage rail surfaces it when present. */
  preceding_tasks?: number;
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

export type StageId = "preview" | "refine" | "remesh" | "rig" | `animate:${AnimationClip}`;

/** Execution order. The five animate stages run as one parallel group after rig. */
export const PIPELINE_STAGES: readonly StageId[] = [
  "preview",
  "refine",
  "remesh",
  "rig",
  ...ANIMATION_CLIPS.map((clip): StageId => `animate:${clip}`),
];

/** Expected credit cost per stage (docs/ARCHITECTURE.md §4) — 55 total. */
export const STAGE_CREDITS: Record<StageId, number> = {
  preview: 20,
  refine: 10,
  remesh: 5,
  rig: 5,
  "animate:idle": 3,
  "animate:walk": 3,
  "animate:run": 3,
  "animate:jump": 3,
  "animate:emote": 3,
};

/** Remesh target passed to createRemeshTask — spike-validated: 30k tris rigs first-try; refine's ~583k gets a 400 (ARCHITECTURE.md trade-off log 2026-08-03). */
export const REMESH_TARGET_POLYCOUNT = 30_000;

export type StageStatus = "pending" | "running" | "succeeded" | "failed";

export interface StageState {
  stage: StageId;
  status: StageStatus;
  taskId: string | null;
  /** 0–100, mirrored from the Meshy task. */
  progress: number;
  /** Queue depth while PENDING (Meshy's preceding_tasks); null once moving or absent. */
  precedingTasks: number | null;
  /** Actual credits consumed, captured on the terminal status. */
  creditCost: number | null;
  modelUrl: string | null;
  /**
   * Meshy's pre-rendered preview PNG (raw signed URL, like modelUrl).
   * Optional: snapshots persisted before this field exist without it —
   * readers treat absent as null and fall back to a GLB snapshot.
   */
  thumbnailUrl?: string | null;
  /** Clock timestamps (ms) — captured via the injected clock, never Date.now(). */
  startedAt: number | null;
  completedAt: number | null;
  /** Meshy's task_error.message, verbatim, when the stage failed. */
  error: string | null;
  /**
   * OUR give-up prose when the machine stopped polling (poll-failure cap) —
   * never Meshy's words, never rendered as if it were. Optional: snapshots
   * persisted before this field exist without it. The task itself may still
   * be alive at Meshy, so retry re-polls instead of re-spending.
   */
  haltReason?: string | null;
}

/**
 * "awaiting-review" is the preview gate (gated machines only): preview
 * succeeded and the machine paused for the visitor to approve or re-roll
 * before the remaining ~35 credits are spent. Node runners never see it.
 */
export type PipelineStatus = "idle" | "running" | "awaiting-review" | "succeeded" | "failed";

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
  /**
   * True once the visitor approved the preview at the gate; the gate never
   * re-fires. Optional: pre-gate snapshots (and Node runs) exist without it.
   */
  previewApproved?: boolean;
  /**
   * Credits consumed by re-rolled previews whose stages were reset. Folded
   * into creditsSpent so the total never understates real spend. Optional:
   * pre-gate snapshots exist without it.
   */
  discardedCredits?: number;
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
