/**
 * Pure presentation logic for stage rows (US-03b). The machine's StageState
 * maps to exactly one visual kind; copy rules follow DESIGN.md voice (numbers
 * are copy, mono) and the architecture review's advisories: precedingTasks 0
 * is NOT "queued behind 0 tasks", and account-cap waiting (waitingForQueue)
 * is a run-level concern that never leaks into per-stage meta.
 */

import { describe, expect, it } from "vitest";

import { createEmptyRun } from "../../lib/meshy/pipeline";
import type { PipelineRun, StageId, StageState } from "../../lib/meshy/types";
import {
  backpressure,
  failureCopy,
  rowPresentation,
  stageDisplayName,
} from "../../components/pipeline/stage-meta";

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

/** A running run with the listed stages succeeded (task ids kept) and the next stage optionally shaped. */
function runWith(
  succeededStages: StageId[],
  overrides: Partial<PipelineRun> = {},
  stageOverrides: Partial<Record<StageId, Partial<StageState>>> = {},
): PipelineRun {
  const run = createEmptyRun("a brave knight");
  run.status = "running";
  for (const [index, stage] of succeededStages.entries()) {
    Object.assign(run.stages[stage], {
      status: "succeeded",
      taskId: `${stage}-000${String(index + 1)}`,
      progress: 100,
      creditCost: 5,
      startedAt: 0,
      completedAt: 1000,
    });
  }
  for (const [stage, patch] of Object.entries(stageOverrides) as [StageId, Partial<StageState>][]) {
    Object.assign(run.stages[stage], patch);
  }
  return { ...run, ...overrides };
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

describe("backpressure (US-06: run-level 429s land on the active row)", () => {
  it("returns null while the run is healthy or terminal", () => {
    expect(backpressure(runWith([], {}, { preview: { status: "running", taskId: "preview-0001" } }))).toBeNull();
    expect(backpressure(runWith([], { status: "failed" }))).toBeNull();
    expect(
      backpressure(runWith([], { status: "failed", rateLimitBackoffMs: 8000 })),
    ).toBeNull();
  });

  it("RateLimitExceeded: the active row backs off with mono seconds", () => {
    const run = runWith(
      ["preview"],
      { rateLimitBackoffMs: 16_000 },
      { refine: { status: "running", taskId: "refine-0002" } },
    );
    expect(backpressure(run)).toEqual({
      stage: "refine",
      presentation: { kind: "backoff", meta: "backing off · 16s" },
    });
  });

  it("backoff also lands on a not-yet-created stage (throttled create)", () => {
    const run = runWith(["preview", "refine"], { rateLimitBackoffMs: 8000 });
    expect(backpressure(run)?.stage).toBe("remesh");
    expect(backpressure(run)?.presentation.meta).toBe("backing off · 8s");
  });

  it("NoMoreConcurrentTasks: the blocked (uncreated) stage reads queue full — waiting", () => {
    const run = runWith(["preview", "refine", "remesh"], { waitingForQueue: true });
    expect(backpressure(run)).toEqual({
      stage: "rig",
      presentation: { kind: "queue-full", meta: "queue full — waiting" },
    });
  });

  it("queue-full lands on the first uncreated animate clip mid-group", () => {
    const run = runWith(
      ["preview", "refine", "remesh", "rig", "animate:idle"],
      { waitingForQueue: true },
      { "animate:walk": { status: "running", taskId: "animate-0005" } },
    );
    expect(backpressure(run)?.stage).toBe("animate:run");
  });

  it("backoff wins when both flags are set — it is the stricter state", () => {
    const run = runWith(["preview"], { waitingForQueue: true, rateLimitBackoffMs: 8000 });
    expect(backpressure(run)?.presentation.kind).toBe("backoff");
  });
});

describe("failureCopy (US-06: honest retry economics + contextual explainers)", () => {
  it("rig failure: biped explainer, published retry price, kept upstream stages", () => {
    const run = runWith(["preview", "refine", "remesh"], { status: "failed" }, {
      rig: { status: "failed", error: "422 Pose estimation failed", creditCost: 0 },
    });
    const copy = failureCopy(run);
    expect(copy?.explainer).toMatch(/standing, bipedal, humanoid/);
    expect(copy?.retryLabel).toBe("Retry rig — 5 credits.");
    expect(copy?.keptLine).toBe("Preview, refine, remesh are kept.");
    expect(copy?.refundLine).toBe("Failed tasks auto-refund. This stage cost 0 credits.");
  });

  it("refund copy derives from the stage's actual creditCost, never asserted blindly", () => {
    const run = runWith(["preview"], { status: "failed" }, {
      refine: { status: "failed", error: "texture generation failed", creditCost: 2 },
    });
    expect(failureCopy(run)?.refundLine).toBe(
      "Failed tasks usually auto-refund. Meshy charged 2 credits for this one.",
    );
  });

  it("preview failure: points at the prompt; nothing upstream to keep", () => {
    const run = runWith([], { status: "failed" }, {
      preview: { status: "failed", error: "prompt rejected by moderation", creditCost: 0 },
    });
    const copy = failureCopy(run);
    expect(copy?.explainer).toMatch(/prompt/);
    expect(copy?.retryLabel).toBe("Retry preview — 20 credits.");
    expect(copy?.keptLine).toBeNull();
  });

  it("refine failure: no special explainer, kept line lists preview only", () => {
    const run = runWith(["preview"], { status: "failed" }, {
      refine: { status: "failed", error: "texture generation failed", creditCost: 0 },
    });
    const copy = failureCopy(run);
    expect(copy?.explainer).toBeNull();
    expect(copy?.retryLabel).toBe("Retry refine — 10 credits.");
    expect(copy?.keptLine).toBe("Preview is kept.");
  });

  it("animate clip failure: kept line uses display names for succeeded stages", () => {
    const run = runWith(["preview", "refine", "remesh", "rig"], { status: "failed" }, {
      "animate:idle": { status: "failed", error: "animation solver error", creditCost: 0 },
      "animate:walk": { status: "running", taskId: "animate-0005" },
    });
    const copy = failureCopy(run);
    expect(copy?.retryLabel).toBe("Retry idle — 3 credits.");
    expect(copy?.keptLine).toBe("Preview, refine, remesh, rig are kept.");
  });

  it("returns null when the run has no failed stage", () => {
    expect(failureCopy(runWith(["preview"]))).toBeNull();
  });
});
