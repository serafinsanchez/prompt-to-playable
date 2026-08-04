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
 * The artifact count that clamps stepping has the same problem: a stage
 * landing while the dialog is open (the run keeps polling) grows `artifacts`,
 * so if the effect depended on the count directly it would rerun on landing
 * too — recapturing `document.activeElement` as the "opener" and refocusing
 * close, silently discarding wherever the visitor had actually tabbed to.
 * The count is read through `totalRef` instead, kept current by its own
 * no-deps effect, for the same reason `onClose` goes through a ref.
 *
 * Hand-rolled focus trap — no new packages (CLAUDE.md). DESIGN.md forbids
 * backdrop-blur and shadows: the scrim is a flat tint, depth is the elevated
 * surface plus a border.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MeshArtifact } from "./artifacts";
import { snapshotGlb } from "./artifact-thumbnail";

/** Shared by `step()` and the arrow-key handler so the two clamps can't drift. */
function clampIndex(value: number, length: number): number {
  return Math.min(Math.max(value, 0), length - 1);
}

export interface ArtifactLightboxProps {
  /** Every landed mesh artifact, in pipeline order. */
  artifacts: MeshArtifact[];
  /** Which one the visitor clicked. */
  initialIndex: number;
  onClose: () => void;
}

export function ArtifactLightbox({ artifacts, initialIndex, onClose }: ArtifactLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  // Whether the *primary* `artifact.imageUrl` has errored (signed Meshy PNGs
  // die in ~3 days; a resumed run's stale URL 404s). Tri-state fallback below
  // mirrors artifact-thumbnail.tsx's `snapshot` state so a failed GLB render
  // has a settled state instead of pulsing forever.
  const [imageFailed, setImageFailed] = useState(false);
  const [fallback, setFallback] = useState<string | "failed" | null>(null);
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

  // Reset the image state when the artifact itself changes — a render-time
  // adjustment, not an effect setState (react-hooks/set-state-in-effect).
  // Without this, stepping to a new artifact kept the previous artifact's
  // rendered `fallback` snapshot around: `shown` below would show it under
  // the new caption for however long the new GLB takes to download and
  // render. NUL-separated so a URL containing a space can't collide the way
  // "a b"+"c" vs "a"+"b c" could (mirrors artifact-thumbnail.tsx's reset).
  const source = `${artifact?.imageUrl ?? ""}\0${artifact?.modelUrl ?? ""}`;
  const [prevSource, setPrevSource] = useState(source);
  if (prevSource !== source) {
    setPrevSource(source);
    setImageFailed(false);
    setFallback(null);
  }

  // Meshy's pre-rendered PNG, unless it errored — onError below routes here.
  const image = imageFailed ? null : (artifact?.imageUrl ?? null);

  // No pre-rendered PNG (legacy run, a task Meshy never rendered, or a dead
  // signed URL): take a one-shot 512px snapshot through the shared offscreen
  // renderer — the same path and the same serialized queue the rail uses.
  // Null whenever a real image is showing or the index is out of range,
  // which is also the effect's guard.
  const snapshotSource = artifact !== undefined && image === null ? artifact.modelUrl : null;

  useEffect(() => {
    if (snapshotSource === null) return;
    let cancelled = false;
    void snapshotGlb(snapshotSource)
      .then((dataUrl) => {
        if (!cancelled) setFallback(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFallback("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotSource]);

  const atStart = index === 0;
  const atEnd = index === artifacts.length - 1;
  const step = (delta: number): void => {
    setIndex((current) => clampIndex(current + delta, artifacts.length));
  };

  // Always the latest artifact count, read by the mount-only effect below —
  // see the file header. Same pattern as onCloseRef: React forbids writing a
  // ref during render, so it's updated in its own no-deps effect (runs after
  // every render) instead.
  const totalRef = useRef(artifacts.length);
  useEffect(() => {
    totalRef.current = artifacts.length;
  });

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null) return;

    // The dialog covers the viewport; the rail behind it must not scroll
    // with it (mouse wheel, arrow keys landing on an ancestor).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Restore focus to whatever opened us — the thumbnail's enlarge button.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        setIndex((current) => clampIndex(current + delta, totalRef.current));
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
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
    // Mount/unmount only — see file header and the onCloseRef comment above.
  }, []);

  // Every hook above runs unconditionally — React requires stable hook order,
  // so this guard cannot move up.
  if (artifact === undefined) return null;
  const caption = `${artifact.label} · ${artifact.meta}`;
  const shown = image ?? (fallback !== null && fallback !== "failed" ? fallback : null);
  // Settled failure: the primary image errored (or never existed) AND the
  // GLB snapshot rejected. Distinct from `shown === null` mid-flight, which
  // is still loading and should keep pulsing.
  const settledFailed = image === null && fallback === "failed";

  return createPortal(
    <div
      data-testid="lightbox-scrim"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none sm:p-6"
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
        className="flex w-full max-w-[min(92vw,640px)] flex-col gap-3 rounded-md border border-border bg-elevated p-3 transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
      >
        <div className="relative flex items-center">
          <button
            type="button"
            data-testid="lightbox-prev"
            aria-label="Previous stage"
            disabled={atStart}
            onClick={() => {
              step(-1);
            }}
            className="absolute left-2 z-10 shrink-0 rounded-sm border border-border bg-elevated/90 p-2 text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none motion-reduce:active:scale-100"
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
              renders, so the caption never jumps under the pointer. Settles
              to the iconographic cube on a dead URL + a failed GLB render,
              rather than pulsing forever. */}
          <span
            data-testid="lightbox-frame"
            className={`relative flex min-w-0 flex-1 items-center justify-center aspect-square overflow-hidden rounded-md border border-border bg-elevated ${
              shown === null && !settledFailed ? "animate-pulse motion-reduce:animate-none" : ""
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
                // Only the primary image can 404 out from under us (signed
                // URLs die in ~3 days) — the fallback snapshot is an
                // already-rendered data URL with its own failure path below.
                onError={image !== null ? () => setImageFailed(true) : undefined}
                className="size-full object-contain transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none"
              />
            )}
            {settledFailed && (
              <svg
                data-testid="lightbox-artifact-error"
                viewBox="0 0 16 16"
                aria-hidden
                className="size-12 stroke-muted"
                fill="none"
                strokeWidth="1"
                strokeLinejoin="round"
              >
                <path d="M8 1.5l5.5 3v7l-5.5 3-5.5-3v-7z" />
                <path d="M8 1.5v7M2.5 4.5L8 8.5l5.5-4" />
              </svg>
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
            className="absolute right-2 z-10 shrink-0 rounded-sm border border-border bg-elevated/90 p-2 text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none motion-reduce:active:scale-100"
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
          {/* Screen readers generally don't re-announce a dialog's name on
              step (see the aria-label above), so this is the only channel
              that tells a screen-reader user which stage they just moved
              to. */}
          <span
            data-testid="lightbox-caption"
            aria-live="polite"
            className="font-mono text-xs uppercase tracking-caps text-muted"
          >
            {caption}
          </span>
          <button
            ref={closeRef}
            type="button"
            data-testid="lightbox-close"
            aria-label="Close"
            onClick={onClose}
            className="rounded-sm border border-border px-2 py-1 font-mono text-xs uppercase tracking-caps text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
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
