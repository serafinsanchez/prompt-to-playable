"use client";

/**
 * Deliberately PLAIN stage list (US-03a scaffolding): stage name + status +
 * progress number, all mono. US-03b's stage rail replaces this file — no
 * progress rings, no artifact previews, no failure-copy polish here.
 */

import { PIPELINE_STAGES, type StageStatus } from "../../lib/meshy/types";
import { usePipeline } from "./use-pipeline";

const STATUS_CLASS: Record<StageStatus, string> = {
  pending: "text-muted",
  running: "text-accent",
  succeeded: "text-success",
  failed: "text-error",
};

export function StageList() {
  const run = usePipeline((state) => state.run);
  if (run === null) return null;

  return (
    <ol data-testid="stage-list" className="flex flex-col gap-1">
      {PIPELINE_STAGES.map((id) => {
        const stage = run.stages[id];
        return (
          <li
            key={id}
            data-testid={`stage-row-${id}`}
            className="flex items-baseline gap-3 font-mono text-xs"
          >
            <span className="uppercase tracking-caps text-foreground">
              {id.replace(":", " ")}
            </span>
            <span className="flex-1" aria-hidden />
            <span className={STATUS_CLASS[stage.status]}>{stage.status}</span>
            <span className="w-8 text-right tabular-nums text-muted">
              {stage.progress}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
