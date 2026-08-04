"use client";

/**
 * Prompt input + start action (US-03a). Biped guidance is the placeholder plus
 * one mono helper line (ARCHITECTURE §4 rigging gotcha) — no modal, no tooltip
 * tour. Start is disabled without a key, with an empty prompt, or mid-run
 * (that's the loading state: label swaps to "Generating"). Numbers are copy.
 */

import { useId, useState, type FormEvent } from "react";
import { usePipeline } from "./use-pipeline";

export function PromptBar() {
  const inputId = useId();
  const [prompt, setPrompt] = useState("");
  const apiKey = usePipeline((state) => state.apiKey);
  const runStatus = usePipeline((state) => state.run?.status ?? null);
  const start = usePipeline((state) => state.start);

  const running = runStatus === "running";
  const canStart = apiKey !== "" && prompt.trim() !== "" && !running;

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
          aria-busy={running}
          // Soft accent glow: DESIGN.md's one shadow exception, primary CTA only.
          className="rounded-md bg-accent px-4 py-2 font-mono text-xs uppercase tracking-caps text-accent-foreground shadow-[0_0_20px_-6px_var(--color-accent)] transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none motion-reduce:transition-none"
        >
          {running ? "Generating" : "Generate"}
        </button>
      </div>

      {/* The one mono helper line — biped guidance, DESIGN.md voice. */}
      <p className="font-mono text-xs text-muted">
        Two legs rig best. 55 credits. About 4 minutes.
      </p>
    </form>
  );
}
