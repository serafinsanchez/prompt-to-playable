/**
 * Pure presentation mapping for stage rail rows (US-03b). One StageState in,
 * one visual kind + mono meta line out — the components stay markup-only.
 *
 * "queued" is a machine-status "running" whose task is still PENDING behind
 * Meshy's shared queue (precedingTasks > 0, no progress yet). It is distinct
 * from the run-level waitingForQueue flag (account concurrency cap, task not
 * created yet) — those two must never merge (docs/ARCHITECTURE.md §4).
 */

import {
  PIPELINE_STAGES,
  STAGE_CREDITS,
  type AnimationClip,
  type PipelineRun,
  type StageId,
  type StageState,
} from "../../lib/meshy/types";

/** Visual state of a rail row — drives glyph, ring, and copy together (a11y: never color alone). */
export type RowKind =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "backoff"
  | "queue-full";

export interface RowPresentation {
  kind: RowKind;
  /** Right-aligned mono copy for the row; empty string renders nothing. */
  meta: string;
}

/** Animate rows drop the group prefix — the group header owns "animate". */
export function stageDisplayName(stage: StageId): string {
  return stage.startsWith("animate:")
    ? (stage.slice("animate:".length) as AnimationClip)
    : stage;
}

/** Stage duration from its own timestamps, as m:ss — truthful across refreshes. */
function formatDuration(startedAt: number, completedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

export function rowPresentation(state: StageState): RowPresentation {
  if (state.status === "failed") return { kind: "failed", meta: "failed" };

  if (state.status === "succeeded") {
    const credits = `${String(state.creditCost ?? 0)}c`;
    const duration =
      state.startedAt !== null && state.completedAt !== null
        ? ` · ${formatDuration(state.startedAt, state.completedAt)}`
        : "";
    return { kind: "succeeded", meta: `${credits}${duration}` };
  }

  if (state.status === "running") {
    // Honest queue copy only while the task is genuinely parked: a depth of 0
    // or any real progress means it's moving — show the ring, not the queue.
    if (state.progress === 0 && state.precedingTasks !== null && state.precedingTasks > 0) {
      const noun = state.precedingTasks === 1 ? "task" : "tasks";
      return { kind: "queued", meta: `queued behind ${String(state.precedingTasks)} ${noun}` };
    }
    return { kind: "running", meta: `${String(state.progress)}%` };
  }

  return { kind: "pending", meta: "" };
}

/**
 * US-06: the two run-level 429 flavors land on the ACTIVE row — the first
 * stage still doing (or waiting to do) work. They stay out of rowPresentation
 * so per-stage mapping remains pure; the rail overlays this on one row only.
 * Backoff (RateLimitExceeded, auto-retries itself) wins over queue-full
 * (NoMoreConcurrentTasks, normal cadence) when both flags linger.
 */
export function backpressure(
  run: PipelineRun,
): { stage: StageId; presentation: RowPresentation } | null {
  if (run.status !== "running") return null;

  if (run.rateLimitBackoffMs !== null) {
    const active = PIPELINE_STAGES.find((s) => run.stages[s].status !== "succeeded");
    if (active === undefined) return null;
    const seconds = Math.round(run.rateLimitBackoffMs / 1000);
    return {
      stage: active,
      presentation: { kind: "backoff", meta: `backing off · ${String(seconds)}s` },
    };
  }

  if (run.waitingForQueue) {
    // The blocked stage is the one whose create bounced: first with no task yet.
    const blocked = PIPELINE_STAGES.find(
      (s) => run.stages[s].status !== "succeeded" && run.stages[s].taskId === null,
    );
    if (blocked === undefined) return null;
    return {
      stage: blocked,
      presentation: { kind: "queue-full", meta: "queue full — waiting" },
    };
  }

  return null;
}

/** The common case — auto-refund is the DevEx teaching moment. */
export const AUTO_REFUND_COPY = "Failed tasks auto-refund. This stage cost 0 credits.";

export interface FailureCopy {
  /** Credit outcome of the failure, derived from the stage's actual creditCost. */
  refundLine: string;
  /** Plain-words context for input-shaped failures; null when the error speaks for itself. */
  explainer: string | null;
  /** "Retry rig — 5 credits." — the published price of re-running just this stage. */
  retryLabel: string;
  /** "Preview, refine, remesh are kept." — null when nothing upstream succeeded. */
  keptLine: string | null;
}

const RIG_EXPLAINER =
  "Rigging needs a standing, bipedal, humanoid character. Reshape the prompt toward that.";
const PREVIEW_EXPLAINER =
  "Preview failed before any geometry existed — the prompt is the input. Edit it, or retry as-is.";

/** US-06 failure panel copy for the run's failed stage; null if none failed. */
export function failureCopy(run: PipelineRun): FailureCopy | null {
  const failedStage = PIPELINE_STAGES.find((s) => run.stages[s].status === "failed");
  if (failedStage === undefined) return null;

  const kept = PIPELINE_STAGES.filter((s) => run.stages[s].status === "succeeded").map(
    stageDisplayName,
  );
  const keptLine =
    kept.length === 0
      ? null
      : `${capitalize(kept.join(", "))} ${kept.length === 1 ? "is" : "are"} kept.`;

  // Poll halt (haltReason) — OUR give-up, not a Meshy task failure. Every
  // Meshy-failure line would be false here: no auto-refund happened, the
  // prompt was never diagnosed, and with a live task id a retry re-polls
  // for free instead of re-spending.
  const failed = run.stages[failedStage];
  if ((failed.haltReason ?? null) !== null) {
    return {
      refundLine:
        failed.taskId !== null
          ? "The task may still be running at Meshy. Nothing extra was charged here."
          : "The request never reached Meshy. Nothing was charged.",
      explainer: null,
      retryLabel:
        failed.taskId !== null
          ? "Check again — no new credits."
          : `Retry ${stageDisplayName(failedStage)} — ${String(STAGE_CREDITS[failedStage])} credits.`,
      keptLine,
    };
  }

  // Honest accounting that keeps the teaching moment: auto-refund is the
  // rule, so a non-zero charge is stated as the exception — never silently
  // swapped for a blind "0 credits" claim, never dropped.
  const consumed = run.stages[failedStage].creditCost ?? 0;
  const refundLine =
    consumed > 0
      ? `Failed tasks usually auto-refund. Meshy charged ${String(consumed)} credits for this one.`
      : AUTO_REFUND_COPY;

  return {
    refundLine,
    explainer:
      failedStage === "rig" ? RIG_EXPLAINER : failedStage === "preview" ? PREVIEW_EXPLAINER : null,
    retryLabel: `Retry ${stageDisplayName(failedStage)} — ${String(STAGE_CREDITS[failedStage])} credits.`,
    keptLine,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
