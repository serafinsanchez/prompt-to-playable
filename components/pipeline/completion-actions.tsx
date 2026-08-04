"use client";

/**
 * US-05 completion state: the payoff receipt, "Play it", and the download
 * disclosure. Renders only for a succeeded run. Downloads are plain anchors
 * straight at Meshy's signed URLs — no client-side transform pass
 * (ARCHITECTURE §5), no proxy involvement. Past Meshy's ~3-day retention
 * the whole block degrades to honest copy instead of broken buttons.
 */

import { useEffect, useId, useState } from "react";
import type { PipelineRun } from "../../lib/meshy/types";
import {
  completionReceipt,
  downloadPlan,
  generatedCharacterSource,
  runAssetsExpired,
} from "./completion";

export const EXPIRED_COPY = "Assets expired. Meshy keeps results for 3 days.";

export interface CompletionActionsProps {
  run: PipelineRun;
  /** True while the generated character is the one on stage. */
  playing: boolean;
  /** Swap the generated character onto the stage (page owns the slot). */
  onPlay: () => void;
  /** True while the play swap's GLBs are still streaming in. */
  playPending: boolean;
}

export function CompletionActions({
  run,
  playing,
  onPlay,
  playPending,
}: CompletionActionsProps) {
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const downloadsId = useId();
  // Wall-clock lives in state, never read during render (react-hooks/purity);
  // the block waits one frame for it so an expired run never flashes buttons.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (now === null) return null;

  const expired = runAssetsExpired(run, now);
  const plan = expired ? [] : downloadPlan(run);
  // Play exists exactly when the swap will work: rig + all five clips.
  const playable = !expired && generatedCharacterSource(run) !== null;

  return (
    <div
      data-testid="completion"
      className="flex flex-col gap-3 rounded-md border border-border bg-elevated p-3 transition-[opacity,translate] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
    >
      {/* Your character finally gets a name — the prompt, in display type. */}
      <h3 className="truncate font-display text-base font-extrabold tracking-display">
        {run.prompt}
      </h3>
      <p
        data-testid="completion-receipt"
        className="font-mono text-base font-semibold text-foreground"
      >
        {completionReceipt(run)}
      </p>

      {expired ? (
        <p data-testid="completion-expired" className="font-mono text-xs text-muted">
          {EXPIRED_COPY}
        </p>
      ) : plan.length === 0 ? (
        <p className="font-mono text-xs text-muted">
          No files came back with this run. Start over to regenerate.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {playable && (
              <button
                type="button"
                data-testid="play-generated"
                onClick={onPlay}
                disabled={playing || playPending}
                aria-pressed={playing}
                className="rounded-md bg-accent px-4 py-2 font-mono text-xs uppercase tracking-caps text-accent-foreground shadow-[0_0_20px_-6px_var(--color-accent)] transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-elevated active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none motion-reduce:transition-none"
              >
                {playing ? "On stage" : playPending ? "Loading…" : "Play it"}
              </button>
            )}
            {plan.length > 0 && (
              <button
                type="button"
                data-testid="download-toggle"
                onClick={() => setDownloadsOpen((open) => !open)}
                aria-expanded={downloadsOpen}
                aria-controls={downloadsId}
                className="rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-caps text-foreground transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 motion-reduce:transition-none"
              >
                Download <span aria-hidden="true">{downloadsOpen ? "▴" : "▾"}</span>
              </button>
            )}
          </div>

          {downloadsOpen && (
            <ul
              id={downloadsId}
              data-testid="download-list"
              className="flex flex-col gap-1 border-t border-border pt-2 transition-[opacity,translate] duration-(--duration-normal) ease-(--ease-stage) starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none"
            >
              {plan.map((entry) => (
                <li key={entry.filename}>
                  {/* New tab: if a signed URL lacks Content-Disposition, the
                      click must not navigate away from the character. */}
                  <a
                    href={entry.url}
                    download={entry.filename}
                    target="_blank"
                    rel="noopener"
                    data-testid={`download-${entry.filename}`}
                    className="group flex items-baseline justify-between gap-3 rounded-sm px-1 py-1 font-mono text-xs text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <span className="shrink-0 text-foreground group-hover:text-accent">
                      {entry.shortName}
                    </span>
                    <span className="truncate">{entry.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
