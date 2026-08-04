/**
 * US-07: the completion-beat engine — pure sequencing logic behind the
 * signature stage-completion moment. The hook drives phases with timers;
 * everything testable lives here: transition detection, the fill-hold
 * override, the rail-advance gate, retry cleanup, reduced-motion collapse.
 */

import { describe, expect, it } from "vitest";
import {
  ADVANCE_HOLD_MS,
  BEAT_STAGGER_MS,
  FILL_HOLD_MS,
  beatPresentation,
  beatStarts,
  pruneRegressed,
  type Beat,
  type Beats,
} from "../../components/pipeline/completion-beat";
import type { RowKind, RowPresentation } from "../../components/pipeline/stage-meta";
import type { StageId } from "../../lib/meshy/types";

const kinds = (entries: Partial<Record<StageId, RowKind>>): Map<StageId, RowKind> =>
  new Map(Object.entries(entries) as Array<[StageId, RowKind]>);

const beats = (entries: Partial<Record<StageId, Beat>>): Beats =>
  new Map(Object.entries(entries) as Array<[StageId, Beat]>);

const row = (kind: RowKind, meta = ""): RowPresentation => ({ kind, meta });

describe("beat offsets", () => {
  it("derives from DESIGN.md tokens: fast fill hold, 60ms stagger scale", () => {
    expect(FILL_HOLD_MS).toBe(120);
    expect(BEAT_STAGGER_MS).toBe(60);
    // fill (120) → tick → +stagger thumbnail → +stagger rail advance
    expect(ADVANCE_HOLD_MS).toBe(FILL_HOLD_MS + 2 * BEAT_STAGGER_MS);
  });
});

describe("beatStarts", () => {
  it("detects running → succeeded as a succeeded beat", () => {
    expect(
      beatStarts(kinds({ preview: "running" }), kinds({ preview: "succeeded" })),
    ).toEqual([{ stage: "preview", target: "succeeded" }]);
  });

  it("detects queued → succeeded (a queued task can land off one poll)", () => {
    expect(
      beatStarts(kinds({ remesh: "queued" }), kinds({ remesh: "succeeded" })),
    ).toEqual([{ stage: "remesh", target: "succeeded" }]);
  });

  it("detects running → failed as a failed beat — the cross gets equal weight", () => {
    expect(beatStarts(kinds({ rig: "running" }), kinds({ rig: "failed" }))).toEqual([
      { stage: "rig", target: "failed" },
    ]);
  });

  it("ignores stages first observed already terminal (resume from storage)", () => {
    // Hydrating a half-done run must not replay old completions as beats.
    expect(beatStarts(new Map(), kinds({ preview: "succeeded", rig: "failed" }))).toEqual(
      [],
    );
  });

  it("ignores non-terminal transitions (pending → running, running → queued)", () => {
    expect(
      beatStarts(
        kinds({ refine: "pending", remesh: "running" }),
        kinds({ refine: "running", remesh: "queued" }),
      ),
    ).toEqual([]);
  });

  it("detects parallel animate clips completing in the same update", () => {
    expect(
      beatStarts(
        kinds({ "animate:idle": "running", "animate:walk": "running" }),
        kinds({ "animate:idle": "succeeded", "animate:walk": "succeeded" }),
      ),
    ).toEqual([
      { stage: "animate:idle", target: "succeeded" },
      { stage: "animate:walk", target: "succeeded" },
    ]);
  });
});

describe("pruneRegressed", () => {
  it("drops a beat whose stage regressed — retry resets the ring with no debris", () => {
    const active = beats({ rig: { target: "failed", phase: "filling" } });
    const pruned = pruneRegressed(active, kinds({ rig: "running" }));
    expect(pruned.has("rig")).toBe(false);
  });

  it("keeps beats whose stage still shows its landed kind", () => {
    const active = beats({ preview: { target: "succeeded", phase: "advancing" } });
    const pruned = pruneRegressed(active, kinds({ preview: "succeeded" }));
    expect(pruned.get("preview")).toEqual({ target: "succeeded", phase: "advancing" });
  });
});

describe("beatPresentation — the fill hold", () => {
  it("holds a succeeding stage at running 100% while filling", () => {
    const active = beats({ preview: { target: "succeeded", phase: "filling" } });
    const out = beatPresentation("preview", row("succeeded", "20c · 1:22"), 87, active);
    expect(out.presentation).toEqual({ kind: "running", meta: "100%" });
    expect(out.progress).toBe(100);
  });

  it("holds a failing stage at running with its last real progress", () => {
    const active = beats({ rig: { target: "failed", phase: "filling" } });
    const out = beatPresentation("rig", row("failed", "failed"), 42, active);
    expect(out.presentation).toEqual({ kind: "running", meta: "42%" });
    expect(out.progress).toBe(42);
  });

  it("reveals the landed kind once the beat advances — tick/cross entrance plays", () => {
    const active = beats({ preview: { target: "succeeded", phase: "advancing" } });
    const out = beatPresentation("preview", row("succeeded", "20c · 1:22"), 100, active);
    expect(out.presentation).toEqual({ kind: "succeeded", meta: "20c · 1:22" });
  });
});

describe("beatPresentation — the rail-advance gate", () => {
  const previewBeat = (phase: Beat["phase"]): Beats =>
    beats({ preview: { target: "succeeded", phase } });

  it("holds the next row at pending while an earlier linear stage is mid-beat", () => {
    for (const phase of ["filling", "advancing"] as const) {
      const out = beatPresentation("refine", row("running", "3%"), 3, previewBeat(phase));
      expect(out.presentation).toEqual({ kind: "pending", meta: "" });
      expect(out.progress).toBe(0);
    }
  });

  it("holds a queued next row too — queue copy waits for the beat", () => {
    const out = beatPresentation(
      "refine",
      row("queued", "queued behind 3 tasks"),
      0,
      previewBeat("filling"),
    );
    expect(out.presentation).toEqual({ kind: "pending", meta: "" });
  });

  it("gates the animate group while rig is mid-beat", () => {
    const rigBeat = beats({ rig: { target: "succeeded", phase: "filling" } });
    const out = beatPresentation("animate:idle", row("running", "1%"), 1, rigBeat);
    expect(out.presentation).toEqual({ kind: "pending", meta: "" });
  });

  it("never gates siblings on an animate clip's beat — the five run in parallel", () => {
    const clipBeat = beats({ "animate:idle": { target: "succeeded", phase: "filling" } });
    const out = beatPresentation("animate:walk", row("running", "55%"), 55, clipBeat);
    expect(out.presentation).toEqual({ kind: "running", meta: "55%" });
  });

  it("never gates on a failed beat — downstream rows stay honestly pending anyway", () => {
    const failedBeat = beats({ rig: { target: "failed", phase: "filling" } });
    const out = beatPresentation("animate:idle", row("pending"), 0, failedBeat);
    expect(out.presentation).toEqual({ kind: "pending", meta: "" });
  });

  it("never rewrites terminal rows behind the gate (resume shows history instantly)", () => {
    const out = beatPresentation(
      "refine",
      row("succeeded", "10c · 0:58"),
      100,
      beats({ preview: { target: "succeeded", phase: "filling" } }),
    );
    expect(out.presentation).toEqual({ kind: "succeeded", meta: "10c · 0:58" });
  });

  it("passes rows through untouched when no beats are active", () => {
    const out = beatPresentation("refine", row("running", "42%"), 42, new Map());
    expect(out.presentation).toEqual({ kind: "running", meta: "42%" });
    expect(out.progress).toBe(42);
  });
});
