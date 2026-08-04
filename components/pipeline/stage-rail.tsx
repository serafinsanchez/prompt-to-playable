"use client";

/**
 * The stage rail (US-03b) — replaces US-03a's plain stage list. Nine stages:
 * four linear rows plus the animate ×5 group, each row a status ring +
 * mono name + honest right-aligned meta (percent, queue depth, credits +
 * duration). Mesh stages (preview/refine/remesh) get an artifact thumbnail
 * as they land; rig/animate stay iconographic — US-05 owns the scene payoff.
 *
 * Failure copy and retry are US-06; a failed row here renders its verbatim
 * error string plainly and stops. The signature completion choreography is
 * P2 US-07 — this builds the structure (ring, tick, thumbnail slot) only.
 */

import { useState } from "react";
import {
  ANIMATION_CLIPS,
  type PipelineRun,
  type StageId,
  type StageState,
} from "../../lib/meshy/types";
import { ApiPanel } from "./api-panel";
import { ArtifactThumbnail } from "./artifact-thumbnail";
import { ProgressRing } from "./progress-ring";
import { rowPresentation, stageDisplayName } from "./stage-meta";
import { usePipeline } from "./use-pipeline";

const LINEAR_ROWS: readonly StageId[] = ["preview", "refine", "remesh", "rig"];
/** Stages whose artifact is a mesh GLB worth previewing inline. */
const MESH_STAGES: ReadonlySet<StageId> = new Set(["preview", "refine", "remesh"]);

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
}: {
  run: PipelineRun;
  state: StageState;
  index: number;
  compact?: boolean;
}) {
  const { kind, meta } = rowPresentation(state);
  const name = stageDisplayName(state.stage);
  // US-04: every row expands to the API call that produced it.
  const [expanded, setExpanded] = useState(false);

  return (
    <li
      data-testid={`stage-row-${state.stage}`}
      data-kind={kind}
      style={staggerStyle(index)}
      className={`flex flex-col gap-1 ${ROW_ENTRANCE}`}
    >
      <button
        type="button"
        data-testid={`stage-toggle-${state.stage}`}
        aria-expanded={expanded}
        aria-controls={`api-panel-${state.stage}`}
        onClick={() => setExpanded((open) => !open)}
        className={`flex w-full items-center gap-3 rounded-sm text-left hover:bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 ${compact ? "min-h-5" : "min-h-6"}`}
      >
        <ProgressRing kind={kind} progress={state.progress} compact={compact} />
        <span
          className={`font-mono text-xs uppercase tracking-caps ${
            kind === "pending" ? "text-muted" : kind === "running" ? "text-accent" : "text-foreground"
          }`}
        >
          {name}
        </span>
        {/* Screen readers + the US-03a resume spec both read the state word;
            failed rows already say it in the visible meta. */}
        {kind !== "failed" && <span className="sr-only">{kind}</span>}
        <span className="flex-1" aria-hidden />
        {meta !== "" && (
          <span
            className={`text-right font-mono text-xs tabular-nums ${
              kind === "failed" ? "text-error" : kind === "succeeded" ? "text-muted" : "text-foreground"
            }`}
          >
            {meta}
          </span>
        )}
        {kind === "succeeded" && MESH_STAGES.has(state.stage) && state.modelUrl !== null && (
          <ArtifactThumbnail url={state.modelUrl} label={state.stage} />
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

      {expanded && <ApiPanel run={run} stage={state.stage} />}

      {/* US-06 owns failure copy/retry — render the verbatim error plainly. */}
      {state.error !== null && (
        <p
          data-testid={`stage-error-${state.stage}`}
          className="pl-8 font-mono text-xs leading-relaxed text-error"
        >
          {state.error}
        </p>
      )}
    </li>
  );
}

export function StageRail() {
  const run = usePipeline((state) => state.run);
  if (run === null) return null;

  return (
    <div
      data-testid="stage-list"
      role="region"
      aria-label="Pipeline stages"
      tabIndex={0}
      className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <ol className="flex flex-col gap-2">
        {LINEAR_ROWS.map((stage, index) => (
          <StageRow key={stage} run={run} state={run.stages[stage]} index={index} />
        ))}
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
          {ANIMATION_CLIPS.map((clip, index) => (
            <StageRow
              key={clip}
              run={run}
              state={run.stages[`animate:${clip}`]}
              index={LINEAR_ROWS.length + 1 + index}
              compact
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
