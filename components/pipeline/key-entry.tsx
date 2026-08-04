"use client";

/**
 * Meshy key entry (US-03a). The key lives in React state + sessionStorage only
 * (docs/ARCHITECTURE.md §4) — masked on screen, one click to clear, and a
 * proxy 401 surfaces here as "key rejected" copy. Interactive states: empty
 * (placeholder), filled (clear button), error (border + copy); hover /
 * focus-visible / active / disabled are defined on both controls. No loading
 * state — the key is never validated by its own request, only by the run's.
 */

import { useId } from "react";
import { usePipeline } from "./use-pipeline";

export function KeyEntry() {
  const inputId = useId();
  const apiKey = usePipeline((state) => state.apiKey);
  const keyError = usePipeline((state) => state.keyError);
  const setKey = usePipeline((state) => state.setKey);
  const clearKey = usePipeline((state) => state.clearKey);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="font-mono text-xs uppercase tracking-caps text-muted"
      >
        Meshy API key
      </label>

      {/* Deliberately never disabled, even mid-run: fixing a rejected key is
          the 401 recovery path, so the input and clear stay live. The
          disabled: styles below define the state for future callers. */}
      <div className="flex gap-2">
        <input
          id={inputId}
          data-testid="key-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setKey(event.target.value)}
          placeholder="msy_…"
          aria-invalid={keyError !== null}
          aria-describedby={keyError !== null ? `${inputId}-error` : undefined}
          className={`min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${
            keyError !== null ? "border-error" : "border-border"
          }`}
        />
        {apiKey !== "" && (
          <button
            type="button"
            data-testid="key-clear"
            onClick={clearKey}
            className="rounded-md border border-border px-3 font-mono text-xs uppercase tracking-caps text-muted transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Clear
          </button>
        )}
      </div>

      {keyError !== null && (
        <p
          id={`${inputId}-error`}
          data-testid="key-error"
          role="alert"
          className="font-mono text-xs text-error"
        >
          {keyError}
        </p>
      )}
    </div>
  );
}
