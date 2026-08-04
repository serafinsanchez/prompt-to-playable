"use client";

/**
 * Prompt input + start action (US-03a). Biped guidance is the placeholder plus
 * one mono helper line (ARCHITECTURE §4 rigging gotcha) — no modal, no tooltip
 * tour. Start is disabled without a key, with an empty prompt, or mid-run
 * (that's the loading state: label swaps to "Generating"). Numbers are copy.
 */

import { useId, useState, type FormEvent } from "react";
import { detectActionLanguage, detectHeldProps } from "../../lib/meshy/prompt-craft";
import { usePipeline } from "./use-pipeline";

/** Quote the visitor's own words back, capped so the hint stays one breath. */
function quoteWords(words: string[]): string {
  return words
    .slice(0, 2)
    .map((word) => `"${word}"`)
    .join(" and ");
}

export function PromptBar() {
  const inputId = useId();
  const [prompt, setPrompt] = useState("");
  const apiKey = usePipeline((state) => state.apiKey);
  const keyError = usePipeline((state) => state.keyError);
  const runStatus = usePipeline((state) => state.run?.status ?? null);
  const start = usePipeline((state) => state.start);

  // "awaiting-review" counts as running here: the run holds the one slot and
  // the store refuses a second start — the button must not pretend otherwise.
  const running = runStatus === "running" || runStatus === "awaiting-review";
  const succeeded = runStatus === "succeeded";
  // A rejected key disables start too — the run it began would only 401.
  const canStart = apiKey !== "" && keyError === null && prompt.trim() !== "" && !running;
  // Accent discipline: after success "Play it" owns the glow; at the gate the
  // gate's continue button does. Either way this steps down to the outline.
  const quietCta = succeeded || runStatus === "awaiting-review";

  // Craft hints — advisory only, never blocking. Poses and props are the two
  // classic ways a character prompt sabotages the rig → animate stages.
  const actionWords = detectActionLanguage(prompt);
  const propWords = detectHeldProps(prompt);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (canStart) start(prompt);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="font-mono text-xs uppercase tracking-caps text-muted"
      >
        Character prompt
      </label>

      <div className="flex gap-2">
        <input
          id={inputId}
          data-testid="prompt-input"
          type="text"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="a standing biped — knight, astronaut, robot chef"
          disabled={running}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button
          type="submit"
          data-testid="pipeline-start"
          disabled={!canStart}
          aria-busy={runStatus === "running"}
          // Soft accent glow: DESIGN.md's one shadow exception, primary CTA
          // only — after a success, "Play it" owns the glow and this steps
          // down to the secondary treatment (accent discipline).
          className={
            quietCta
              ? "rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-caps text-foreground transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              : "rounded-md bg-accent px-4 py-2 font-mono text-xs uppercase tracking-caps text-accent-foreground shadow-[0_0_20px_-6px_var(--color-accent)] transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none motion-reduce:transition-none"
          }
        >
          {runStatus === "running"
            ? "Generating"
            : runStatus === "awaiting-review"
              ? "Paused"
              : "Generate"}
        </button>
      </div>

      {/* Craft hints, mono + warning tone. aria-live so screen readers hear
          them appear; hidden mid-run — the prompt is locked by then. */}
      {!running && (
        <div aria-live="polite" className="flex flex-col gap-1 empty:hidden">
          {actionWords.length > 0 && (
            <p data-testid="prompt-hint-action" className="font-mono text-xs text-warning">
              {quoteWords(actionWords)} {actionWords.length > 1 ? "bake" : "bakes"} an
              action pose into the mesh. Characters generate standing — the
              clips add the motion after.
            </p>
          )}
          {propWords.length > 0 && (
            <p data-testid="prompt-hint-prop" className="font-mono text-xs text-warning">
              A held {propWords[0]} fuses to the hands and stretches when
              animated. Empty hands animate cleanly.
            </p>
          )}
        </div>
      )}

      {/* The one mono helper line — biped guidance, DESIGN.md voice. Hidden
          once a run succeeds: its forecast would rhyme against the receipt. */}
      {!succeeded && (
        <p className="font-mono text-xs text-muted">
          Two legs rig best. 55 credits. About 10 minutes.
        </p>
      )}
    </form>
  );
}
