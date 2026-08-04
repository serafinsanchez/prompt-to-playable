/**
 * Pure pipeline state machine: preview → refine+PBR → remesh → rig → animate ×5
 * (docs/ARCHITECTURE.md §4). UI-agnostic — emits plain PipelineRun snapshots
 * via subscribe; Zustand wiring happens in a later app spec.
 *
 * All timing flows through the injected clock; the machine is advanced
 * externally by calling tick() (the app drives it on a ~4s interval, tests
 * drive it manually). One tick performs at most one poll plus the follow-up
 * create for the next stage, so every network interaction stays inside the
 * tick's typed-error envelope:
 *
 * - RateLimitExceeded  → exponential back-off (doubles per consecutive hit)
 * - NoMoreConcurrentTasks → keep polling at normal cadence, flag waitingForQueue
 * - task FAILED        → halt the run, surface task_error verbatim, preserve
 *                        upstream stage results/task ids for retry reuse
 */

import { taskGlbUrl, type MeshyClient } from "./client";
import {
  ANIMATION_CLIPS,
  NoMoreConcurrentTasksError,
  PIPELINE_STAGES,
  RateLimitExceededError,
  REMESH_TARGET_POLYCOUNT,
  STAGE_CREDITS,
  type AnimationClip,
  type MeshyTask,
  type PipelineRun,
  type StageId,
  type StageState,
} from "./types";

/** Injected time source — never Date.now() (isomorphic + deterministic tests). */
export interface Clock {
  now(): number;
}

export const POLL_INTERVAL_MS = 4000;
export const RATE_LIMIT_BASE_BACKOFF_MS = 8000;
export const RATE_LIMIT_MAX_BACKOFF_MS = 60_000;
/**
 * Consecutive unexpected tick failures (not 429s) before the machine gives
 * up and fails the run. Without a cap, a resumed run whose task ids no
 * longer exist (Meshy retention is ~3 days) 404s every 4s forever with no
 * retry or start-over affordance — the UI is bricked until localStorage is
 * cleared by hand. A success or 429 (the API is alive) resets the count.
 */
export const MAX_CONSECUTIVE_TICK_FAILURES = 5;

export interface CreatePipelineOptions {
  client: MeshyClient;
  clock: Clock;
  /** Restored PipelineRun (from storage.ts) to resume instead of starting fresh. */
  run?: PipelineRun;
  /**
   * Pause at "awaiting-review" after preview succeeds, until approvePreview()
   * or rerollPreview(). Preview is 20 credits; everything after is ~35 more —
   * the gate lets the visitor kill a broken mesh before paying for it.
   * Default off: Node runners (pregen, spike) loop on "running" and must
   * never deadlock on a question no one is there to answer.
   */
  gatePreview?: boolean;
}

export interface Pipeline {
  /** Deep-copied snapshot of the current run. */
  getRun(): PipelineRun;
  /** Snapshot emitted after every state change; returns an unsubscribe. */
  subscribe(listener: (run: PipelineRun) => void): () => void;
  /** Initialize a fresh run for the prompt; the first tick creates the preview task. */
  start(prompt: string): PipelineRun;
  /** Advance the machine once. No-ops before nextPollAt or on a terminal run. */
  tick(): Promise<PipelineRun>;
  /** Wave the gated preview through — the next tick creates refine. Throws off-gate. */
  approvePreview(): PipelineRun;
  /** Discard the gated preview (its credits stay counted) and re-create it. Throws off-gate. */
  rerollPreview(): PipelineRun;
}

/** The linear head — every stage before the parallel animate group, in PIPELINE_STAGES order. */
const LINEAR_STAGES: readonly StageId[] = PIPELINE_STAGES.filter(
  (stage) => !stage.startsWith("animate:"),
);

export function createEmptyRun(prompt: string): PipelineRun {
  const stages = Object.fromEntries(
    PIPELINE_STAGES.map((stage): [StageId, StageState] => [
      stage,
      {
        stage,
        status: "pending",
        taskId: null,
        progress: 0,
        precedingTasks: null,
        creditCost: null,
        modelUrl: null,
        thumbnailUrl: null,
        startedAt: null,
        completedAt: null,
        error: null,
        haltReason: null,
      },
    ]),
  ) as PipelineRun["stages"];

  return {
    prompt,
    status: "idle",
    stages,
    startedAt: null,
    completedAt: null,
    creditsSpent: 0,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
  };
}

/**
 * Revive a failed run for a user-clicked retry (US-06): reset the failed
 * stage — and nothing upstream — to factory-pending, and put the run back in
 * "running" so createPipeline({run}) resumes it. Upstream stages keep their
 * task ids, so the recreated stage chains off them and re-spends only its own
 * credits. Pure: returns a new snapshot, never mutates the input.
 */
export function retryFailedStage(run: PipelineRun): PipelineRun {
  // At most one stage can be "failed": applyTask halts the run on the first
  // failure and tick() no-ops on a non-running run, so `find` is exhaustive.
  const failedStage = PIPELINE_STAGES.find(
    (stage) => run.stages[stage].status === "failed",
  );
  if (run.status !== "failed" || failedStage === undefined) {
    throw new Error("retryFailedStage: run has no failed stage");
  }

  // A poll-halt with a live task id is not a Meshy failure — the task may
  // still be running. "Check again" resumes polling the SAME task: no
  // re-create, no re-spend. (A halt before the create succeeded has no task
  // id to re-poll; it falls through to the normal reset below.)
  const halted = run.stages[failedStage];
  if ((halted.haltReason ?? null) !== null && halted.taskId !== null) {
    const next = clone(run);
    const stage = next.stages[failedStage];
    stage.status = "running";
    stage.haltReason = null;
    stage.completedAt = null;
    next.status = "running";
    next.completedAt = null;
    next.waitingForQueue = false;
    next.rateLimitBackoffMs = null;
    next.nextPollAt = null; // the next tick polls immediately
    return next;
  }

  // Failed tasks normally auto-refund (creditCost 0 → reset to null), but if
  // Meshy reported real consumed credits, keep them counted — the credit
  // total must stay honest across a retry.
  const consumedCredits = run.stages[failedStage].creditCost;
  const next = clone(run);
  next.stages[failedStage] = {
    stage: failedStage,
    status: "pending",
    taskId: null,
    progress: 0,
    precedingTasks: null,
    creditCost: consumedCredits !== null && consumedCredits > 0 ? consumedCredits : null,
    modelUrl: null,
    thumbnailUrl: null,
    startedAt: null,
    completedAt: null,
    error: null,
    haltReason: null,
  };
  next.status = "running";
  next.completedAt = null;
  next.waitingForQueue = false;
  next.rateLimitBackoffMs = null;
  next.nextPollAt = null; // the next tick polls immediately
  next.creditsSpent =
    (next.discardedCredits ?? 0) +
    Object.values(next.stages).reduce((sum, stage) => sum + (stage.creditCost ?? 0), 0);
  return next;
}

export function createPipeline(options: CreatePipelineOptions): Pipeline {
  const { client, clock, gatePreview = false } = options;
  let run: PipelineRun = options.run ? clone(options.run) : createEmptyRun("");
  const listeners = new Set<(run: PipelineRun) => void>();
  // Not persisted: a resumed machine starts its patience fresh.
  let consecutiveTickFailures = 0;

  const emit = (): void => {
    const snapshot = clone(run);
    for (const listener of listeners) listener(snapshot);
  };

  const requireTaskId = (stage: StageId): string => {
    const taskId = run.stages[stage].taskId;
    if (taskId === null) throw new Error(`stage ${stage} has no task id yet`);
    return taskId;
  };

  const createStageTask = (stage: StageId): Promise<string> => {
    if (stage === "preview") return client.createPreviewTask(run.prompt);
    if (stage === "refine") return client.createRefineTask(requireTaskId("preview"));
    if (stage === "remesh")
      return client.createRemeshTask(requireTaskId("refine"), REMESH_TARGET_POLYCOUNT);
    if (stage === "rig") return client.createRigTask(requireTaskId("remesh"));
    const clip = stage.slice("animate:".length) as AnimationClip;
    return client.createAnimationTask(requireTaskId("rig"), clip);
  };

  const pollStageTask = (stage: StageId): Promise<MeshyTask> => {
    const taskId = requireTaskId(stage);
    if (stage === "preview" || stage === "refine") return client.getTextTo3DTask(taskId);
    if (stage === "remesh") return client.getRemeshTask(taskId);
    if (stage === "rig") return client.getRigTask(taskId);
    return client.getAnimationTask(taskId);
  };

  const recomputeCredits = (): void => {
    run.creditsSpent =
      (run.discardedCredits ?? 0) +
      Object.values(run.stages).reduce((sum, stage) => sum + (stage.creditCost ?? 0), 0);
  };

  const startStage = async (stage: StageId): Promise<void> => {
    const taskId = await createStageTask(stage); // may throw a 429 flavor
    const state = run.stages[stage];
    state.taskId = taskId;
    state.status = "running";
    state.startedAt = clock.now();
  };

  /** Apply a polled task to its stage; halts the whole run on FAILED/CANCELED. */
  const applyTask = (stage: StageId, task: MeshyTask): void => {
    const state = run.stages[stage];
    state.progress = task.progress;
    // Meshy only sends preceding_tasks while PENDING — absent means "moving".
    state.precedingTasks = task.preceding_tasks ?? null;
    if (task.status === "SUCCEEDED") {
      state.status = "succeeded";
      // consumed_credits is authoritative; fall back to the published price.
      state.creditCost = task.consumed_credits ?? STAGE_CREDITS[stage];
      // Raw signed URL — state stays isomorphic (Node pregen/spike fetch it
      // directly); browser consumers proxy it at their boundary (assets.ts).
      state.modelUrl = taskGlbUrl(task);
      state.thumbnailUrl = task.thumbnail_url ?? null;
      state.completedAt = clock.now();
      recomputeCredits();
    } else if (task.status === "FAILED" || task.status === "CANCELED") {
      state.status = "failed";
      state.creditCost = task.consumed_credits ?? 0; // failed tasks auto-refund
      state.error = task.task_error?.message ?? `task ${task.status}`;
      state.completedAt = clock.now();
      // Halt, preserving every upstream stage's task id and result for retry reuse.
      run.status = "failed";
      run.completedAt = clock.now();
      recomputeCredits();
    } else {
      state.status = "running";
    }
  };

  /**
   * One step of real work: at most one poll plus the follow-up create(s) for
   * the next stage. Throws the typed 429s for tick() to translate into
   * back-off / keep-waiting state.
   */
  const advance = async (): Promise<void> => {
    for (const stage of LINEAR_STAGES) {
      const state = run.stages[stage];
      if (state.status === "succeeded") continue;
      if (state.taskId === null) {
        // The preview gate: refine is where the remaining spend commits, so a
        // gated machine pauses here until the visitor approves or re-rolls.
        if (stage === "refine" && gatePreview && run.previewApproved !== true) {
          run.status = "awaiting-review";
          return;
        }
        await startStage(stage);
        return;
      }
      applyTask(stage, await pollStageTask(stage));
      // Re-read: applyTask mutates the stage behind TypeScript's narrowing.
      const statusAfterPoll = run.stages[stage].status as StageState["status"];
      if (run.status !== "running" || statusAfterPoll !== "succeeded") return;
      // Stage just succeeded — fall through so the next stage is created this tick.
    }

    // Linear head complete → the five animate tasks run as one parallel group.
    let createdThisTick = false;
    for (const clip of ANIMATION_CLIPS) {
      const state = run.stages[`animate:${clip}`];
      if (state.taskId === null) {
        await startStage(`animate:${clip}`); // a queue-full throw keeps earlier creates
        createdThisTick = true;
      }
    }
    if (createdThisTick) return; // freshly created tasks get their first poll next tick

    for (const clip of ANIMATION_CLIPS) {
      const stage: StageId = `animate:${clip}`;
      if (run.stages[stage].status !== "running") continue;
      applyTask(stage, await pollStageTask(stage));
      if (run.status !== "running") return; // one clip failed — halt, keep siblings
    }

    if (ANIMATION_CLIPS.every((clip) => run.stages[`animate:${clip}`].status === "succeeded")) {
      run.status = "succeeded";
      run.completedAt = clock.now();
    }
  };

  return {
    getRun: () => clone(run),

    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    start: (prompt) => {
      run = createEmptyRun(prompt);
      run.status = "running";
      run.startedAt = clock.now();
      emit();
      return clone(run);
    },

    approvePreview: () => {
      if (run.status !== "awaiting-review") {
        throw new Error("approvePreview: run is not awaiting-review");
      }
      run.previewApproved = true;
      run.status = "running";
      run.nextPollAt = null; // the next tick creates refine immediately
      emit();
      return clone(run);
    },

    rerollPreview: () => {
      if (run.status !== "awaiting-review") {
        throw new Error("rerollPreview: run is not awaiting-review");
      }
      // The discarded preview's credits were really consumed — fold them into
      // discardedCredits so the total keeps telling the truth.
      run.discardedCredits =
        (run.discardedCredits ?? 0) + (run.stages.preview.creditCost ?? 0);
      run.stages.preview = {
        stage: "preview",
        status: "pending",
        taskId: null,
        progress: 0,
        precedingTasks: null,
        creditCost: null,
        modelUrl: null,
        thumbnailUrl: null,
        startedAt: null,
        completedAt: null,
        error: null,
        haltReason: null,
      };
      run.status = "running";
      run.nextPollAt = null; // the next tick creates the new preview immediately
      recomputeCredits();
      emit();
      return clone(run);
    },

    tick: async () => {
      if (run.status !== "running") return clone(run);
      const now = clock.now();
      if (run.nextPollAt !== null && now < run.nextPollAt) return clone(run);

      try {
        await advance();
        consecutiveTickFailures = 0;
        run.waitingForQueue = false;
        run.rateLimitBackoffMs = null;
        run.nextPollAt = clock.now() + POLL_INTERVAL_MS;
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          // Too many requests per second: back off the send rate, doubling
          // per consecutive throttle up to a cap.
          const backoff =
            run.rateLimitBackoffMs === null
              ? RATE_LIMIT_BASE_BACKOFF_MS
              : Math.min(run.rateLimitBackoffMs * 2, RATE_LIMIT_MAX_BACKOFF_MS);
          run.rateLimitBackoffMs = backoff;
          run.nextPollAt = now + backoff;
          // The flavors are mutually exclusive in state, not just in copy.
          run.waitingForQueue = false;
          consecutiveTickFailures = 0; // throttled means the API is alive
        } else if (error instanceof NoMoreConcurrentTasksError) {
          // Queue full: nothing wrong with our rate — keep the normal cadence
          // and let the UI say "Meshy queue full — waiting".
          run.waitingForQueue = true;
          run.rateLimitBackoffMs = null;
          run.nextPollAt = now + POLL_INTERVAL_MS;
          consecutiveTickFailures = 0;
        } else if (consecutiveTickFailures + 1 < MAX_CONSECUTIVE_TICK_FAILURES) {
          consecutiveTickFailures += 1;
          emit();
          throw error; // surfaced as a transient tickError; cadence continues
        } else {
          // Patience exhausted: fail the active stage so the run goes
          // terminal and the retry / start-over affordances appear. The
          // give-up lands in haltReason, never in `error` — that field is
          // Meshy's verbatim words and this halt is ours; the task may in
          // fact still be running server-side.
          const message = error instanceof Error ? error.message : String(error);
          const active =
            PIPELINE_STAGES.find((stage) => run.stages[stage].status === "running") ??
            PIPELINE_STAGES.find((stage) => run.stages[stage].status === "pending");
          if (active !== undefined) {
            const state = run.stages[active];
            state.status = "failed";
            state.haltReason = `Gave up after ${MAX_CONSECUTIVE_TICK_FAILURES} failed checks. Last error: ${message}`;
            state.completedAt = clock.now();
          }
          run.status = "failed";
          run.completedAt = clock.now();
        }
      }

      emit();
      return clone(run);
    },
  };
}

function clone(run: PipelineRun): PipelineRun {
  return JSON.parse(JSON.stringify(run)) as PipelineRun;
}
