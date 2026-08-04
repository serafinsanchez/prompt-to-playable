"use client";

/**
 * US-07: the completion-beat engine. The store flips a whole poll's worth of
 * state atomically — stage succeeded, next stage running — so without help
 * the tick, thumbnail, and rail advance all render in the same frame. This
 * module lets the DISPLAY lag reality by the DESIGN.md beat: ring holds its
 * filled arc (120ms) → tick lands → thumbnail clips in (+60ms, CSS delay) →
 * the rail's running highlight advances (240ms). Presentation only — the
 * store and pipeline logic never wait on it.
 *
 * Pure engine (beatStarts / pruneRegressed / beatPresentation) + a thin
 * timer-driving hook. Reduced motion creates no beats at all: display equals
 * reality instantly, states stay fully legible.
 */

import { useEffect, useRef, useState } from "react";
import { PIPELINE_STAGES, type PipelineRun, type StageId } from "../../lib/meshy/types";
import { usePrefersReducedMotion } from "../scene/use-prefers-reduced-motion";
import { rowPresentation, type RowKind, type RowPresentation } from "./stage-meta";

/** Ring holds its completed fill this long before the tick lands (--duration-fast). */
export const FILL_HOLD_MS = 120;
/** DESIGN.md: 60ms stagger between children — the beat's offset scale. */
export const BEAT_STAGGER_MS = 60;
/** Fill → tick → +stagger thumbnail → +stagger rail advance. */
export const ADVANCE_HOLD_MS = FILL_HOLD_MS + 2 * BEAT_STAGGER_MS;

export interface Beat {
  target: "succeeded" | "failed";
  /** filling: ring shows its completed arc; advancing: tick landed, rail still held. */
  phase: "filling" | "advancing";
}

export type Beats = ReadonlyMap<StageId, Beat>;

const TERMINAL: readonly RowKind[] = ["succeeded", "failed"];

/** Stages that flipped to a terminal kind since the last observation. */
export function beatStarts(
  prev: ReadonlyMap<StageId, RowKind>,
  next: ReadonlyMap<StageId, RowKind>,
): Array<{ stage: StageId; target: Beat["target"] }> {
  const starts: Array<{ stage: StageId; target: Beat["target"] }> = [];
  for (const [stage, kind] of next) {
    if (!TERMINAL.includes(kind)) continue;
    const before = prev.get(stage);
    // No `before` means first observation (hydrate/resume) — history, not news.
    if (before === undefined || before === kind || TERMINAL.includes(before)) continue;
    starts.push({ stage, target: kind as Beat["target"] });
  }
  return starts;
}

/** Retry (US-06) resets a stage: its beat must vanish with it — no debris. */
export function pruneRegressed(
  beats: Beats,
  kinds: ReadonlyMap<StageId, RowKind>,
): Beats {
  let pruned: Map<StageId, Beat> | null = null;
  for (const [stage, beat] of beats) {
    if (kinds.get(stage) === beat.target) continue;
    pruned ??= new Map(beats);
    pruned.delete(stage);
  }
  return pruned ?? beats;
}

/** Only linear stages gate the rows after them; the five clips are peers. */
function gatesAdvance(stage: StageId, beat: Beat): boolean {
  return beat.target === "succeeded" && !stage.startsWith("animate:");
}

/**
 * The display mapping. `actual` is the truthful presentation (backpressure
 * override already applied); `progress` is the stage's real percent.
 */
export function beatPresentation(
  stage: StageId,
  actual: RowPresentation,
  progress: number,
  beats: Beats,
): { presentation: RowPresentation; progress: number } {
  const own = beats.get(stage);
  if (own !== undefined && own.phase === "filling") {
    // The fill: a succeeding ring completes to 100; a failing one freezes
    // where it died. Either way it still reads as running for one breath.
    const held = own.target === "succeeded" ? 100 : progress;
    return {
      presentation: { kind: "running", meta: `${String(held)}%` },
      progress: held,
    };
  }

  if (actual.kind === "running" || actual.kind === "queued") {
    const index = PIPELINE_STAGES.indexOf(stage);
    for (const [beating, beat] of beats) {
      if (!gatesAdvance(beating, beat)) continue;
      if (PIPELINE_STAGES.indexOf(beating) < index) {
        // Held back until the beat resolves — the rail advances as a step
        // of the choreography, not as a side effect of the poll.
        return { presentation: { kind: "pending", meta: "" }, progress: 0 };
      }
    }
  }

  return { presentation: actual, progress };
}

function currentKinds(run: PipelineRun): Map<StageId, RowKind> {
  const kinds = new Map<StageId, RowKind>();
  for (const stage of PIPELINE_STAGES) {
    kinds.set(stage, rowPresentation(run.stages[stage]).kind);
  }
  return kinds;
}

function sameKinds(
  a: ReadonlyMap<StageId, RowKind>,
  b: ReadonlyMap<StageId, RowKind>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [stage, kind] of a) {
    if (b.get(stage) !== kind) return false;
  }
  return true;
}

interface BeatTrack {
  /** run.startedAt of the run these kinds belong to. */
  runKey: number | null;
  kinds: Map<StageId, RowKind>;
  beats: Map<StageId, Beat>;
}

const IDLE_TRACK: BeatTrack = { runKey: null, kinds: new Map(), beats: new Map() };

/**
 * Timer driver. Observes the run's kinds during render (the codebase's
 * render-time-adjustment pattern — no setState-in-effect), starts beats for
 * fresh terminal transitions, and walks each beat filling → advancing → gone
 * on the DESIGN.md offsets. Returns the active beats for beatPresentation.
 */
export function useCompletionBeat(run: PipelineRun | null): Beats {
  const reducedMotion = usePrefersReducedMotion();
  const [track, setTrack] = useState<BeatTrack>(IDLE_TRACK);

  // Render-time observation: diff the store's truth against the last look.
  const kinds = run === null ? IDLE_TRACK.kinds : currentKinds(run);
  const runKey = run?.startedAt ?? null;
  if (runKey !== track.runKey || !sameKinds(kinds, track.kinds)) {
    const fresh = runKey !== track.runKey;
    const prev = fresh ? IDLE_TRACK.kinds : track.kinds;
    const starts = reducedMotion || run === null ? [] : beatStarts(prev, kinds);
    const beats = new Map(fresh ? [] : pruneRegressed(track.beats, kinds));
    for (const { stage, target } of starts) beats.set(stage, { target, phase: "filling" });
    setTrack({ runKey, kinds, beats });
  }

  // One timer pair per beat, keyed by stage — a sibling clip starting its own
  // beat must not reset an in-flight fill hold.
  const scheduled = useRef(new Map<StageId, Array<ReturnType<typeof setTimeout>>>());

  useEffect(() => {
    for (const [stage, beat] of track.beats) {
      if (beat.phase !== "filling" || scheduled.current.has(stage)) continue;
      const advance = setTimeout(() => {
        setTrack((current) => {
          const active = current.beats.get(stage);
          if (active === undefined || active.phase !== "filling") return current;
          const beats = new Map(current.beats);
          beats.set(stage, { ...active, phase: "advancing" });
          return { ...current, beats };
        });
      }, FILL_HOLD_MS);
      const settle = setTimeout(() => {
        scheduled.current.delete(stage);
        setTrack((current) => {
          if (!current.beats.has(stage)) return current;
          const beats = new Map(current.beats);
          beats.delete(stage);
          return { ...current, beats };
        });
      }, ADVANCE_HOLD_MS);
      scheduled.current.set(stage, [advance, settle]);
    }
    // A beat that vanished under its timers (retry, start-over) releases them.
    for (const [stage, timers] of scheduled.current) {
      if (track.beats.has(stage)) continue;
      for (const timer of timers) clearTimeout(timer);
      scheduled.current.delete(stage);
    }
  }, [track.beats]);

  useEffect(() => {
    const live = scheduled.current;
    return () => {
      for (const timers of live.values()) {
        for (const timer of timers) clearTimeout(timer);
      }
    };
  }, []);

  return track.beats;
}
