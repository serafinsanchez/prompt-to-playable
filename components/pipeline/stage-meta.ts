/**
 * Pure presentation mapping for stage rail rows (US-03b). One StageState in,
 * one visual kind + mono meta line out — the components stay markup-only.
 *
 * "queued" is a machine-status "running" whose task is still PENDING behind
 * Meshy's shared queue (precedingTasks > 0, no progress yet). It is distinct
 * from the run-level waitingForQueue flag (account concurrency cap, task not
 * created yet) — those two must never merge (docs/ARCHITECTURE.md §4).
 */

import type { AnimationClip, StageId, StageState } from "../../lib/meshy/types";

/** Visual state of a rail row — drives glyph, ring, and copy together (a11y: never color alone). */
export type RowKind = "pending" | "queued" | "running" | "succeeded" | "failed";

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
