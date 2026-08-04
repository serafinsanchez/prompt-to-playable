"use client";

/**
 * The stage rail (US-03b) — replaces US-03a's plain stage list. Nine stages:
 * four linear rows plus the animate ×5 group, each row a status ring +
 * mono name + honest right-aligned meta (percent, queue depth, credits +
 * duration). Mesh stages (preview/refine/remesh) get an artifact thumbnail
 * as they land; rig/animate stay iconographic — US-05 owns the scene payoff.
 *
 * Failure states are US-06: a failed row expands into the StageFailure panel
 * (verbatim error, auto-refund note, retry), and the run-level 429 flavors
 * overlay the active row via backpressure(). The signature completion
 * choreography is P2 US-07 — this builds the structure (ring, tick,
 * thumbnail slot) only.
 */

import { useState } from "react";
import { proxiedAssetUrl } from "../../lib/meshy/assets";
import {
  ANIMATION_CLIPS,
  type PipelineRun,
  type StageId,
  type StageState,
} from "../../lib/meshy/types";
import { ApiPanel } from "./api-panel";
import { ArtifactLightbox } from "./artifact-lightbox";
import { ArtifactThumbnail } from "./artifact-thumbnail";
import { beatPresentation, useCompletionBeat } from "./completion-beat";
import { ProgressRing } from "./progress-ring";
import { MESH_STAGES, meshArtifacts, type MeshArtifact } from "./artifacts";
import { backpressure, rowPresentation, stageDisplayName, type RowPresentation } from "./stage-meta";
import { StageFailure } from "./stage-failure";
import { usePipeline } from "./use-pipeline";

const LINEAR_ROWS: readonly StageId[] = ["preview", "refine", "remesh", "rig"];

/** Entrance stagger (DESIGN.md: 60ms between rail children). */
function staggerStyle(index: number): React.CSSProperties {
  return { transitionDelay: `${String(index * 60)}ms` };
}

const ROW_ENTRANCE =
  "transition-[opacity,translate] duration-(--duration-slow) ease-(--ease-stage) starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none";

function StageRow({
  run,
  state,
  index,
  compact = false,
  presentation,
  ringProgress,
  onEnlarge,
}: {
  run: PipelineRun;
  state: StageState;
  index: number;
  compact?: boolean;
  /** Display truth for this row — backpressure and the US-07 beat already applied. */
  presentation: RowPresentation;
  /** Ring percent, beat-adjusted (a filling ring completes to 100 before the tick). */
  ringProgress: number;
  /** US-08: opens the lightbox on this stage's artifact via `onEnlarge(stage)`.
      Passed to every row — rig and all five animate:* clips included — the
      enlarge button itself only renders where `hasArtifact` is true below. */
  onEnlarge?: ((stage: StageId) => void) | undefined;
}) {
  const { kind, meta } = presentation;
  const name = stageDisplayName(state.stage);
  // US-04: every row expands to the API call that produced it.
  const [expanded, setExpanded] = useState(false);
  const hasArtifact =
    kind === "succeeded" && MESH_STAGES.includes(state.stage) && state.modelUrl !== null;

  return (
    <li
      data-testid={`stage-row-${state.stage}`}
      data-kind={kind}
      style={staggerStyle(index)}
      className={`flex flex-col gap-1 ${ROW_ENTRANCE}`}
    >
      {/* US-08: the enlarge control is a SIBLING of the row toggle, layered
          over the thumbnail slot. The row is already a button (US-04) and a
          nested button is invalid HTML; this keeps the rail's visual layout
          and the caret's hit area exactly as they were. */}
      <div className="relative flex items-center">
        <button
          type="button"
          data-testid={`stage-toggle-${state.stage}`}
          aria-expanded={expanded}
          aria-controls={`api-panel-${state.stage}`}
          onClick={() => setExpanded((open) => !open)}
          className={`flex w-full items-center gap-3 rounded-sm text-left hover:bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 ${compact ? "min-h-5" : "min-h-6"}`}
        >
          <ProgressRing kind={kind} progress={ringProgress} compact={compact} />
          <span
            className={`font-mono text-xs uppercase tracking-caps ${
              kind === "pending" ? "text-muted" : kind === "running" ? "text-accent" : "text-foreground"
            }`}
          >
            {name}
          </span>
          {/* Screen readers + the US-03a resume spec both read the state word;
              failed rows say it in the visible meta, and the backpressure kinds
              already read well from their visible copy — no slug announcements. */}
          {kind !== "failed" && kind !== "backoff" && kind !== "queue-full" && (
            <span className="sr-only">{kind}</span>
          )}
          <span className="flex-1" aria-hidden />
          {meta !== "" && (
            <span
              className={`text-right font-mono text-xs tabular-nums ${
                kind === "failed"
                  ? "text-error"
                  : kind === "backoff" || kind === "queue-full"
                    ? "text-warning"
                    : kind === "succeeded"
                      ? "text-muted"
                      : "text-foreground"
              }`}
            >
              {meta}
            </span>
          )}
          {hasArtifact && state.modelUrl !== null && (
            // Thumbnail PNG renders directly (<img> needs no CORS); the GLB
            // fallback goes through the proxy — state holds raw signed URLs.
            // (hasArtifact already guarantees this; repeated so TS narrows.)
            <ArtifactThumbnail
              url={proxiedAssetUrl(state.modelUrl)}
              thumbnailUrl={state.thumbnailUrl ?? null}
              label={state.stage}
            />
          )}
          {/* Caret — the only affordance hint; rotates open, transform-only. */}
          <svg
            viewBox="0 0 8 8"
            aria-hidden
            className={`size-2 shrink-0 stroke-muted transition-transform duration-(--duration-fast) ease-(--ease-stage) motion-reduce:transition-none ${
              expanded ? "rotate-90" : ""
            }`}
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 1.5L5.5 4 3 6.5" />
          </svg>
        </button>

        {hasArtifact && onEnlarge !== undefined && (
          <button
            type="button"
            data-testid={`enlarge-${state.stage}`}
            aria-label={`Enlarge ${name} mesh`}
            onClick={() => {
              onEnlarge(state.stage);
            }}
            // right-5 = the caret (size-2 = 8px) plus the gap-3 (12px) that
            // precedes it, so this lands exactly on the 32px thumbnail slot.
            // tests/stage-rail.spec.ts asserts the overlap geometrically.
            className="absolute right-5 size-8 cursor-zoom-in rounded-sm border border-transparent transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 active:border-accent motion-reduce:transition-none motion-reduce:active:scale-100"
          />
        )}
      </div>

      {expanded && <ApiPanel run={run} stage={state.stage} />}

      {kind === "failed" && <StageFailure run={run} state={state} />}
    </li>
  );
}

export function StageRail() {
  const run = usePipeline((state) => state.run);
  // `openIndex` indexes into `artifacts` below; safe only because artifacts
  // append in pipeline order and never shrink while a run is live, so an
  // open index can never outrun the array it was captured against.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // US-07: the completion beat — display lags the store by the DESIGN.md
  // offsets so tick, thumbnail, and rail advance land as a sequence.
  const beats = useCompletionBeat(run);
  if (run === null) return null;
  // US-06: at most one row carries the run-level 429 overlay.
  const pressure = backpressure(run);
  const artifacts: MeshArtifact[] = meshArtifacts(run);
  const enlarge = (stage: StageId): void => {
    const index = artifacts.findIndex((artifact) => artifact.stage === stage);
    if (index !== -1) setOpenIndex(index);
  };
  const display = (stage: StageId): { presentation: RowPresentation; progress: number } => {
    const state = run.stages[stage];
    const actual =
      pressure?.stage === stage ? pressure.presentation : rowPresentation(state);
    return beatPresentation(stage, actual, state.progress, beats);
  };

  return (
    <div
      data-testid="stage-list"
      role="region"
      aria-label="Pipeline stages"
      tabIndex={0}
      className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <ol className="flex flex-col gap-2">
        {LINEAR_ROWS.map((stage, index) => {
          const { presentation, progress } = display(stage);
          return (
            <StageRow
              key={stage}
              run={run}
              state={run.stages[stage]}
              index={index}
              presentation={presentation}
              ringProgress={progress}
              onEnlarge={enlarge}
            />
          );
        })}
      </ol>

      {/* The five clips run as one parallel group — rendered as one cluster. */}
      <section
        data-testid="stage-group-animate"
        aria-label="Animate — five clips in parallel"
        style={staggerStyle(LINEAR_ROWS.length)}
        className={`flex flex-col gap-2 ${ROW_ENTRANCE}`}
      >
        <h3 className="font-mono text-xs uppercase tracking-caps text-muted">
          animate ×5
        </h3>
        <ol className="flex flex-col gap-2 border-l border-border pl-3">
          {ANIMATION_CLIPS.map((clip, index) => {
            const { presentation, progress } = display(`animate:${clip}`);
            return (
              <StageRow
                key={clip}
                run={run}
                state={run.stages[`animate:${clip}`]}
                index={LINEAR_ROWS.length + 1 + index}
                compact
                presentation={presentation}
                ringProgress={progress}
                onEnlarge={enlarge}
              />
            );
          })}
        </ol>
      </section>

      {openIndex !== null && (
        <ArtifactLightbox
          artifacts={artifacts}
          initialIndex={openIndex}
          onClose={() => {
            setOpenIndex(null);
          }}
        />
      )}
    </div>
  );
}
