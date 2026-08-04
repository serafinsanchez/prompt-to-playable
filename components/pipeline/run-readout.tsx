"use client";

/**
 * Mono credit + elapsed readout (US-03a). Both numbers come from the machine:
 * creditsSpent from terminal-stage consumed_credits, elapsed from the run's
 * own startedAt/completedAt timestamps — truthful across refreshes, never
 * remount-relative. A 1s re-render keeps the clock moving while running.
 */

import { useEffect, useState } from "react";
import { usePipeline } from "./use-pipeline";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function RunReadout() {
  const run = usePipeline((state) => state.run);
  const tickError = usePipeline((state) => state.tickError);
  const running = run?.status === "running";
  // Wall-clock lives in state, never read during render (react-hooks/purity).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const sync = (): void => setNow(Date.now());
    // First sync lands async (rAF) — no synchronous setState in the effect.
    const frame = requestAnimationFrame(sync);
    const timer = running ? setInterval(sync, 1000) : null;
    return () => {
      cancelAnimationFrame(frame);
      if (timer !== null) clearInterval(timer);
    };
  }, [running]);

  if (run === null || run.startedAt === null) return null;
  const elapsed = (run.completedAt ?? now ?? run.startedAt) - run.startedAt;

  return (
    <div className="flex flex-col gap-1">
      <p data-testid="run-readout" className="font-mono text-xs text-muted">
        {run.creditsSpent} credits. {formatElapsed(elapsed)} elapsed.
      </p>
      {/* The two 429 flavors render on the active stage row (US-06), not here. */}
      {tickError !== null && (
        <p className="font-mono text-xs text-warning">Poll failed — retrying. {tickError}</p>
      )}
    </div>
  );
}
