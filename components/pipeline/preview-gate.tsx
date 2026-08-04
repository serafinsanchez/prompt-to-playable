"use client";

/**
 * Preview gate — the blockout review. The machine pauses at "awaiting-review"
 * after the preview mesh lands (20 credits down); the remaining ~35 credits
 * (refine → remesh → rig → animate ×5) wait for a human eye. Approve continues;
 * re-roll discards the mesh (spend stays counted — honesty over comfort) and
 * generates a fresh preview. Keyless or rejected-key restores can look but not
 * decide: the store guards both, so the buttons disable for both.
 */

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../scene/use-prefers-reduced-motion";
import { meshArtifacts } from "./artifacts";
import { ArtifactLightbox } from "./artifact-lightbox";
import { usePipeline } from "./use-pipeline";

export function PreviewGate() {
  const run = usePipeline((state) => state.run);
  const apiKey = usePipeline((state) => state.apiKey);
  const keyError = usePipeline((state) => state.keyError);
  const approve = usePipeline((state) => state.approvePreview);
  const reroll = usePipeline((state) => state.rerollPreview);
  const [thumbState, setThumbState] = useState<"loading" | "loaded" | "failed">("loading");
  const [enlarged, setEnlarged] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const gated = run?.status === "awaiting-review";

  // The gate can appear above the visitor's scroll position (mobile bottom
  // sheet especially) — bring it into view or the pipeline just looks stalled.
  useEffect(() => {
    if (!gated) return;
    containerRef.current?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [gated, reducedMotion]);

  if (!gated || run === null) return null;

  const thumbnail = run.stages.preview.thumbnailUrl ?? null;
  // Mirrors the store's own approve/reroll guards: no key, or a rejected key,
  // means the click would be silently swallowed — disable instead.
  const blocked = apiKey === "" || keyError !== null;

  return (
    <div
      ref={containerRef}
      data-testid="preview-gate"
      // status: the run stopping to ask a question is exactly what a screen
      // reader needs announced.
      role="status"
      className="flex flex-col gap-3 rounded-md border border-border bg-elevated p-3"
    >
      <h3 className="font-mono text-xs uppercase tracking-caps text-accent">
        Preview check
      </h3>

      {/* Meshy's pre-rendered PNG, big enough to judge pose and symmetry. The
          aspect box is reserved up front so the image decoding never shoves
          the buttons under the pointer; it pulses while loading and the image
          clips in (the 220ms completion beat). Signed URLs die in ~3 days —
          a dead image collapses the box; the rail's thumbnail still works. */}
      {thumbnail !== null && thumbState !== "failed" && (
        <button
          type="button"
          data-testid="gate-enlarge"
          aria-label="Enlarge preview mesh"
          onClick={() => {
            setEnlarged(true);
          }}
          className={`block aspect-square w-full cursor-zoom-in overflow-hidden rounded-sm border border-border bg-background transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 active:border-accent motion-reduce:transition-none motion-reduce:active:scale-100 ${
            thumbState === "loading" ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Meshy PNG; next/image optimizes nothing here */}
          <img
            src={thumbnail}
            alt="Preview mesh, ready for review"
            draggable={false}
            onLoad={() => setThumbState("loaded")}
            onError={() => setThumbState("failed")}
            className={
              thumbState === "loaded"
                ? "size-full object-cover transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
                : "hidden"
            }
          />
        </button>
      )}

      {enlarged && (
        <ArtifactLightbox
          artifacts={meshArtifacts(run)}
          initialIndex={0}
          onClose={() => {
            setEnlarged(false);
          }}
        />
      )}

      <p className="font-mono text-xs text-muted">35 credits ride on this mesh.</p>
      <p className="font-mono text-xs text-muted">
        Standing neutral? Two matching feet? Empty hands?
      </p>

      {blocked && (
        <p data-testid="gate-keyless" className="font-mono text-xs text-muted">
          Add your key to decide.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="gate-approve"
          onClick={approve}
          disabled={blocked}
          className="rounded-md bg-accent px-3 py-2 font-mono text-xs uppercase tracking-caps text-accent-foreground shadow-[0_0_20px_-6px_var(--color-accent)] transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-elevated active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          Looks right
        </button>
        <button
          type="button"
          data-testid="gate-reroll"
          onClick={reroll}
          disabled={blocked}
          className="rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-caps text-muted transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          Re-roll — 20c
        </button>
      </div>
    </div>
  );
}
