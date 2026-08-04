/**
 * Pure presentation logic for stage rows (US-03b). The machine's StageState
 * maps to exactly one visual kind; copy rules follow DESIGN.md voice (numbers
 * are copy, mono) and the architecture review's advisories: precedingTasks 0
 * is NOT "queued behind 0 tasks", and account-cap waiting (waitingForQueue)
 * is a run-level concern that never leaks into per-stage meta.
 */

import { describe, expect, it } from "vitest";

import type { StageState } from "../../lib/meshy/types";
import { rowPresentation, stageDisplayName } from "../../components/pipeline/stage-meta";

function state(overrides: Partial<StageState> = {}): StageState {
  return {
    stage: "preview",
    status: "pending",
    taskId: null,
    progress: 0,
    precedingTasks: null,
    creditCost: null,
    modelUrl: null,
    startedAt: null,
    completedAt: null,
    error: null,
    ...overrides,
  };
}

describe("stageDisplayName", () => {
  it("uses the plain stage id for linear stages", () => {
    expect(stageDisplayName("preview")).toBe("preview");
    expect(stageDisplayName("rig")).toBe("rig");
  });

  it("strips the group prefix for animate stages — the group header owns it", () => {
    expect(stageDisplayName("animate:idle")).toBe("idle");
    expect(stageDisplayName("animate:emote")).toBe("emote");
  });
});

describe("rowPresentation", () => {
  it("pending: dim row, no meta text", () => {
    const row = rowPresentation(state());
    expect(row.kind).toBe("pending");
    expect(row.meta).toBe("");
  });

  it("running with progress: percent as mono copy", () => {
    const row = rowPresentation(state({ status: "running", progress: 42 }));
    expect(row.kind).toBe("running");
    expect(row.meta).toBe("42%");
  });

  it("running but PENDING behind a queue: honest queue copy instead of a dead ring", () => {
    const row = rowPresentation(
      state({ status: "running", progress: 0, precedingTasks: 477 }),
    );
    expect(row.kind).toBe("queued");
    expect(row.meta).toBe("queued behind 477 tasks");
  });

  it("a queue depth of 1 reads singular", () => {
    const row = rowPresentation(
      state({ status: "running", progress: 0, precedingTasks: 1 }),
    );
    expect(row.meta).toBe("queued behind 1 task");
  });

  it("a queue depth of exactly 0 is NOT queue copy — it renders as a normal running row", () => {
    const row = rowPresentation(
      state({ status: "running", progress: 0, precedingTasks: 0 }),
    );
    expect(row.kind).toBe("running");
    expect(row.meta).toBe("0%");
  });

  it("progress kills stale queue copy even if precedingTasks lingers in the snapshot", () => {
    const row = rowPresentation(
      state({ status: "running", progress: 12, precedingTasks: 3 }),
    );
    expect(row.kind).toBe("running");
    expect(row.meta).toBe("12%");
  });

  it("succeeded: real credits and duration from the stage's own timestamps", () => {
    const row = rowPresentation(
      state({
        status: "succeeded",
        progress: 100,
        creditCost: 10,
        startedAt: 60_000,
        completedAt: 142_000,
      }),
    );
    expect(row.kind).toBe("succeeded");
    expect(row.meta).toBe("10c · 1:22");
  });

  it("succeeded with auto-refund shows 0c honestly", () => {
    const row = rowPresentation(
      state({ status: "succeeded", creditCost: 0, startedAt: 0, completedAt: 4_000 }),
    );
    expect(row.meta).toBe("0c · 0:04");
  });

  it("failed: failed kind; the verbatim error is surfaced separately, not in meta", () => {
    const row = rowPresentation(
      state({ status: "failed", error: "Pose estimation failed", creditCost: 0 }),
    );
    expect(row.kind).toBe("failed");
    expect(row.meta).toBe("failed");
  });
});
