"use client";

/**
 * US-08: the artifact lightbox. The rail's thumbnail is 32px — a status dot,
 * not a preview. This opens the same artifact at up to 640px so a visitor can
 * actually read pose, symmetry, and texture.
 *
 * Portals to document.body: the rail is `overflow-y-auto` on desktop and a
 * `max-h-[60dvh]` bottom sheet on mobile, so an in-tree dialog would be
 * clipped by its own scroll container.
 *
 * The dialog owns its step index. StageRail mounts it only while open, so the
 * initialIndex prop is read once per open. `onClose`, however, is NOT stable
 * across renders: StageRail passes a fresh inline closure, and its own
 * `run` selector yields a new reference on every ~4s poll tick while a run
 * is active. If the focus-trap effect below depended on `onClose` directly,
 * it would tear down and rebuild on every tick — yanking focus out to the
 * opener and back in, visibly, while the dialog is open. `onClose` is read
 * through a ref instead, so the effect's dependency array is `[]` and setup
 * / teardown happen only on true mount / unmount.
 *
 * Hand-rolled focus trap — no new packages (CLAUDE.md). DESIGN.md forbids
 * backdrop-blur and shadows: the scrim is a flat tint, depth is the elevated
 * surface plus a border.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MeshArtifact } from "./artifacts";
import { snapshotGlb } from "./artifact-thumbnail";

export interface ArtifactLightboxProps {
  /** Every landed mesh artifact, in pipeline order. */
  artifacts: MeshArtifact[];
  /** Which one the visitor clicked. */
  initialIndex: number;
  onClose: () => void;
}

export function ArtifactLightbox({ artifacts, initialIndex, onClose }: ArtifactLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [fallback, setFallback] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const artifact = artifacts[index];

  // Always the latest onClose, read by the mount-only effect below — see the
  // file header for why this can't just be an effect dependency. Updated in
  // its own effect (no deps: runs after every render) rather than during
  // render itself, which React forbids for ref writes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // No pre-rendered PNG (legacy run, or a task Meshy never rendered): take a
  // one-shot 512px snapshot through the shared offscreen renderer — the same
  // path and the same serialized queue the rail uses. Null whenever a real
  // PNG exists or the index is out of range, which is also the effect's guard.
  const snapshotSource =
    artifact !== undefined && artifact.imageUrl === null ? artifact.modelUrl : null;

  useEffect(() => {
    if (snapshotSource === null) return;
    let cancelled = false;
    void snapshotGlb(snapshotSource)
      .then((dataUrl) => {
        if (!cancelled) setFallback(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFallback(null);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotSource]);

  const atStart = index === 0;
  const atEnd = index === artifacts.length - 1;
  const step = (delta: number): void => {
    setIndex((current) => Math.min(Math.max(current + delta, 0), artifacts.length - 1));
  };

  // Captured once per render so the focus-trap effect's dependency below is a
  // number, not the `artifacts` array identity — see the file header for why
  // that effect can't take per-render values directly.
  const total = artifacts.length;

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null) return;
    // Restore focus to whatever opened us — the thumbnail's enlarge button.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const delta = event.key === "ArrowRight" ? 1 : -1;
        setIndex((current) => Math.min(Math.max(current + delta, 0), total - 1));
        return;
      }
      if (event.key !== "Tab" || node === null) return;
      const focusables = node.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
    // Mount/unmount plus artifact-count changes only — see file header and
    // the onCloseRef comment above. `total` is a number, stable across
    // re-renders where the `artifacts` array identity is not.
  }, [total]);

  // Every hook above runs unconditionally — React requires stable hook order,
  // so this guard cannot move up.
  if (artifact === undefined) return null;
  const caption = `${artifact.label} · ${artifact.meta}`;
  const shown = artifact.imageUrl ?? fallback;

  return createPortal(
    <div
      data-testid="lightbox-scrim"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none"
    >
      <div
        ref={dialogRef}
        data-testid="artifact-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={caption}
        // The frame is inside the scrim, so its own clicks must not dismiss.
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="flex w-full max-w-[min(80vw,640px)] flex-col gap-3 transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="lightbox-prev"
            aria-label="Previous stage"
            disabled={atStart}
            onClick={() => {
              step(-1);
            }}
            className="shrink-0 rounded-sm border border-border p-2 text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            <svg
              viewBox="0 0 8 8"
              aria-hidden
              className="size-3 rotate-180 stroke-current"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 1.5L5.5 4 3 6.5" />
            </svg>
          </button>

          {/* The box is reserved up front and pulses while the snapshot
              renders, so the caption never jumps under the pointer. */}
          <span
            className={`relative block aspect-square min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-elevated ${
              shown === null ? "animate-pulse motion-reduce:animate-none" : ""
            }`}
          >
            {shown !== null && (
              /* eslint-disable-next-line @next/next/no-img-element -- signed Meshy PNG or an inline data URL; next/image optimizes neither */
              <img
                key={artifact.stage}
                data-testid="lightbox-image"
                src={shown}
                alt={`${artifact.label} stage mesh, enlarged`}
                draggable={false}
                className="size-full object-contain transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none"
              />
            )}
          </span>

          <button
            type="button"
            data-testid="lightbox-next"
            aria-label="Next stage"
            disabled={atEnd}
            onClick={() => {
              step(1);
            }}
            className="shrink-0 rounded-sm border border-border p-2 text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            <svg
              viewBox="0 0 8 8"
              aria-hidden
              className="size-3 stroke-current"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 1.5L5.5 4 3 6.5" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="lightbox-caption"
            className="font-mono text-xs uppercase tracking-caps text-muted"
          >
            {caption}
          </span>
          <button
            ref={closeRef}
            type="button"
            data-testid="lightbox-close"
            onClick={onClose}
            className="rounded-sm border border-border px-2 py-1 font-mono text-xs uppercase tracking-caps text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent motion-reduce:transition-none"
          >
            esc
          </button>
        </div>

        {/* The progression, not a carousel: one dot per landed mesh stage. */}
        <ol
          data-testid="lightbox-dots"
          aria-hidden
          className="flex items-center justify-center gap-2"
        >
          {artifacts.map((entry, position) => (
            <li
              key={entry.stage}
              data-dot={position === index ? "current" : "other"}
              className={`size-1 rounded-full transition-colors duration-(--duration-fast) ease-(--ease-stage) motion-reduce:transition-none ${
                position === index ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </ol>
      </div>
    </div>,
    document.body,
  );
}
