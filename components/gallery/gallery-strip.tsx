"use client";

import type { GalleryEntry, GalleryManifest } from "../../scripts/pregen/manifest";
import { formatReceipt } from "./manifest";

/**
 * Gallery rail (US-02): one card per manifest entry — all of them, always.
 * Desktop: vertical rail docked right (the pipeline panel owns the left).
 * Small screens: horizontal strip under the header, above the pipeline
 * sheet. The scene stays the hero; this recedes (DESIGN.md layout).
 */

export type GalleryStatus =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; entries: GalleryManifest };

interface GalleryStripProps {
  status: GalleryStatus;
  /** Slug of the entry currently on stage. */
  activeSlug: string;
  /** Slug of an entry whose GLBs are still streaming in, if any. */
  pendingSlug: string | null;
  onSelect: (entry: GalleryEntry) => void;
  onPreload: (entry: GalleryEntry) => void;
}

/** Per-stage receipt lines for the active card — mono, real numbers only. */
function StageBreakdown({ entry }: { entry: GalleryEntry }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2">
      {Object.entries(entry.stageCredits).map(([stage, credits]) => (
        <div key={stage} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted">{stage}</dt>
          <dd className="text-right text-foreground">{credits}c</dd>
        </div>
      ))}
      <div className="col-span-2 grid grid-cols-subgrid border-t border-border pt-1">
        <dt className="text-muted">polys</dt>
        <dd className="text-right text-foreground">{entry.polyCount.toLocaleString()}</dd>
      </div>
    </dl>
  );
}

function GalleryCard({
  entry,
  active,
  pending,
  onSelect,
  onPreload,
}: {
  entry: GalleryEntry;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
  onPreload: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`gallery-card-${entry.slug}`}
      aria-pressed={active}
      disabled={pending}
      onClick={onSelect}
      onMouseEnter={onPreload}
      onFocus={onPreload}
      className={`w-56 min-w-0 shrink-0 overflow-hidden rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait md:w-full ${
        active
          ? "border-accent bg-surface"
          : "border-border bg-surface/80 hover:border-muted active:bg-elevated"
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display text-base font-extrabold tracking-display">
          {entry.slug}
        </span>
        {active && (
          <span className="font-mono text-xs uppercase tracking-caps text-accent">
            on stage
          </span>
        )}
        {pending && (
          <span className="font-mono text-xs uppercase tracking-caps text-muted">
            loading
          </span>
        )}
      </span>
      <span className="mt-1 block truncate font-sans text-xs text-muted">{entry.prompt}</span>
      <span className="mt-2 block font-mono text-xs uppercase tracking-caps text-foreground">
        {formatReceipt(entry)}
      </span>
      {/* Receipt detail: desktop only — on phones the scene stays the hero. */}
      {active && (
        <span className="hidden font-mono text-xs md:block">
          <StageBreakdown entry={entry} />
        </span>
      )}
    </button>
  );
}

export function GalleryStrip({
  status,
  activeSlug,
  pendingSlug,
  onSelect,
  onPreload,
}: GalleryStripProps) {
  return (
    <section
      aria-label="Character gallery"
      data-testid="gallery-strip"
      className="pointer-events-none fixed inset-x-0 top-24 px-4 md:absolute md:inset-x-auto md:right-6 md:top-24 md:bottom-auto md:w-64 md:px-0"
    >
      <h2 className="sr-only">Character gallery</h2>
      <div className="pointer-events-auto flex max-w-full gap-3 overflow-x-auto pb-2 md:max-h-[70dvh] md:flex-col md:overflow-x-visible md:overflow-y-auto md:pb-0">
        {status.state === "loading" && (
          <p className="font-mono text-xs uppercase tracking-caps text-muted">
            Reading the gallery manifest.
          </p>
        )}
        {status.state === "error" && (
          <p role="alert" className="font-mono text-xs uppercase tracking-caps text-warning">
            {status.message}
          </p>
        )}
        {status.state === "ready" && status.entries.length === 0 && (
          <p className="font-mono text-xs uppercase tracking-caps text-muted">
            Gallery is empty. Run npm run pregen to fill it.
          </p>
        )}
        {status.state === "ready" &&
          status.entries.map((entry) => (
            <GalleryCard
              key={entry.slug}
              entry={entry}
              active={entry.slug === activeSlug}
              pending={entry.slug === pendingSlug}
              onSelect={() => onSelect(entry)}
              onPreload={() => onPreload(entry)}
            />
          ))}
      </div>
    </section>
  );
}
