"use client";

/**
 * US-06 failure panel — expands under a failed stage row. Honest, in-rail,
 * mono throughout (CLAUDE.md: all pipeline text is mono; no toasts, no
 * modals): Meshy's task_error verbatim, the auto-refund teaching moment, a
 * plain-words explainer for input-shaped failures (rig biped / preview
 * prompt), and a user-clicked retry that re-spends only this stage — credits
 * are real money, so retry is never automatic.
 */

import type { PipelineRun, StageState } from "../../lib/meshy/types";
import { failureCopy } from "./stage-meta";
import { usePipeline } from "./use-pipeline";

const PANEL_ENTRANCE =
  "transition-[opacity,translate] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none";

export function StageFailure({ run, state }: { run: PipelineRun; state: StageState }) {
  const retry = usePipeline((store) => store.retry);
  const apiKey = usePipeline((store) => store.apiKey);
  const copy = failureCopy(run);
  if (copy === null || state.error === null) return null;

  return (
    // role="status": the panel mounts exactly when the failure lands off a
    // poll — screen readers get the announcement the sighted rail implies.
    <div
      data-testid={`stage-failure-${state.stage}`}
      role="status"
      className={`ml-4 flex flex-col gap-2 border-l border-error/40 pl-4 ${PANEL_ENTRANCE}`}
    >
      {/* Meshy's task_error, verbatim — trimmed, never rewritten. */}
      <p
        data-testid={`stage-error-${state.stage}`}
        className="font-mono text-xs leading-relaxed text-error"
      >
        {state.error.trim()}
      </p>

      <p className="font-mono text-xs leading-relaxed text-muted">{copy.refundLine}</p>

      {copy.explainer !== null && (
        <p
          data-testid={`stage-explainer-${state.stage}`}
          className="font-mono text-xs leading-relaxed text-foreground"
        >
          {copy.explainer}
        </p>
      )}

      {copy.keptLine !== null && (
        <p data-testid={`stage-kept-${state.stage}`} className="font-mono text-xs text-muted">
          {copy.keptLine}
        </p>
      )}

      {/* The CTA is the panel's terminal beat; py-3 keeps it a real thumb
          target on the 375px bottom sheet. */}
      <button
        type="button"
        data-testid={`stage-retry-${state.stage}`}
        onClick={retry}
        disabled={apiKey === ""}
        className="self-start rounded-md border border-accent px-3 py-3 font-mono text-xs uppercase tracking-caps text-accent transition-[transform,opacity] duration-(--duration-fast) ease-(--ease-stage) hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {copy.retryLabel}
      </button>

      {apiKey === "" && (
        <p className="font-mono text-xs text-muted">Add your Meshy key above to retry.</p>
      )}
    </div>
  );
}
