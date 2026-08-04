"use client";

/**
 * Live-generation panel (US-03a shell + US-03b rail): key entry + prompt +
 * the stage rail, docked left over the scene. Owns the store lifecycle —
 * hydrate on mount (restores key from sessionStorage, resumes a non-terminal
 * run from localStorage) and ticker cleanup on unmount. Terminal runs get a
 * "start over" affordance that calls clearRun via the store.
 */

import { useEffect } from "react";
import { CompletionActions } from "./completion-actions";
import { KeyEntry } from "./key-entry";
import { PreviewGate } from "./preview-gate";
import { PromptBar } from "./prompt-bar";
import { RunReadout } from "./run-readout";
import { StageRail } from "./stage-rail";
import { pipelineStore, usePipeline } from "./use-pipeline";

export interface LivePipelineProps {
  /** True while the generated character is on stage (US-05; page owns the slot). */
  playingGenerated: boolean;
  /** Swap the succeeded run's character onto the stage. */
  onPlayGenerated: () => void;
  /** True while the play swap's GLBs are still streaming in. */
  playPending: boolean;
}

export function LivePipeline({
  playingGenerated,
  onPlayGenerated,
  playPending,
}: LivePipelineProps) {
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
          {/* On success the receipt line carries the numbers — no double readout. */}
          {run.status === "succeeded" ? (
            <CompletionActions
              run={run}
              playing={playingGenerated}
              onPlay={onPlayGenerated}
              playPending={playPending}
            />
          ) : (
            <RunReadout />
          )}
          {/* The blockout review — renders only at "awaiting-review". */}
          <PreviewGate />
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
