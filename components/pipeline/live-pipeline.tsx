"use client";

/**
 * Live-generation panel (US-03a shell + US-03b rail): key entry + prompt +
 * the stage rail, docked left over the scene. Owns the store lifecycle —
 * hydrate on mount (restores key from sessionStorage, resumes a non-terminal
 * run from localStorage) and ticker cleanup on unmount. Terminal runs get a
 * "start over" affordance that calls clearRun via the store.
 */

import { useEffect } from "react";
import { KeyEntry } from "./key-entry";
import { PromptBar } from "./prompt-bar";
import { RunReadout } from "./run-readout";
import { StageRail } from "./stage-rail";
import { pipelineStore, usePipeline } from "./use-pipeline";

export function LivePipeline() {
  const run = usePipeline((state) => state.run);
  const startOver = usePipeline((state) => state.startOver);
  const terminal = run?.status === "succeeded" || run?.status === "failed";

  useEffect(() => {
    pipelineStore.getState().hydrate();
    return () => pipelineStore.getState().stopTicker();
  }, []);

  return (
    <section
      aria-label="Live generation"
      data-testid="live-pipeline"
      // Docks left on desktop, bottom-sheet on small screens (DESIGN.md layout).
      className="fixed inset-x-0 bottom-0 flex max-h-[60dvh] flex-col gap-4 overflow-y-auto rounded-t-lg border border-border bg-surface p-4 md:absolute md:inset-x-auto md:bottom-auto md:left-6 md:top-24 md:max-h-[calc(100dvh-8rem)] md:w-80 md:overflow-y-auto md:rounded-lg"
    >
      <h2 className="font-mono text-xs uppercase tracking-caps text-muted">
        Generate your own
      </h2>

      <KeyEntry />
      <PromptBar />

      {run !== null && (
        <>
          <RunReadout />
          <StageRail />
          {terminal && (
            <button
              type="button"
              data-testid="start-over"
              onClick={startOver}
              className="self-start rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-caps text-muted transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            >
              Start over
            </button>
          )}
        </>
      )}
    </section>
  );
}
