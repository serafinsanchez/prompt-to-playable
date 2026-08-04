"use client";

import { useId, useState } from "react";
import type { GalleryEntry, GalleryManifest } from "../../scripts/pregen/manifest";
import { formatReceipt, galleryDownloadPlan } from "./manifest";

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

/**
 * Download disclosure for the on-stage card — its own block because the card
 * is a single <button> and links can't nest inside it. Same pattern as the
 * live run's completion download list (US-05): plain anchors, same-origin
 * static paths, `download` honored.
 */
function GalleryDownloads({ entry }: { entry: GalleryEntry }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const plan = galleryDownloadPlan(entry);

  return (
    // Desktop only, like the card's stage breakdown — on phones the strip is a
    // cramped horizontal rail over the scene and an open list collides with
    // the pipeline sheet (DESIGN.md: the scene stays the hero).
    <div className="mt-2 hidden rounded-md border border-border bg-surface p-2 md:block">
      <button
        type="button"
        data-testid={`gallery-download-toggle-${entry.slug}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-caps text-foreground transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 motion-reduce:transition-none"
      >
        Download <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul
          id={listId}
          data-testid={`gallery-download-list-${entry.slug}`}
          className="mt-2 flex flex-col gap-1 border-t border-border pt-2 transition-[opacity,translate] duration-(--duration-normal) ease-(--ease-stage) starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none"
        >
          {plan.map((item) => (
            <li key={item.filename}>
              <a
                href={item.url}
                download={item.filename}
                data-testid={`gallery-download-${item.filename}`}
                className="group flex items-baseline justify-between gap-3 rounded-sm px-1 py-1 font-mono text-xs text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <span className="shrink-0 text-foreground group-hover:text-accent">
                  {item.shortName}
                </span>
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      className={`w-full min-w-0 overflow-hidden rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait ${
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
      {/* Active card shows the whole prompt (it's the one being read); others stay one-line. */}
      <span className={`mt-1 block font-sans text-xs text-muted ${active ? "break-words" : "truncate"}`}>
        {entry.prompt}
      </span>
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
      <div className="pointer-events-auto flex max-w-full items-start gap-3 overflow-x-auto pb-2 md:max-h-[70dvh] md:flex-col md:overflow-x-visible md:overflow-y-auto md:pb-0">
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
            // Wrapper owns the strip sizing; the card button fills it, and the
            // active card's download block sits below as a sibling (links
            // can't nest inside the card button).
            <div key={entry.slug} className="w-56 shrink-0 md:w-full">
              <GalleryCard
                entry={entry}
                active={entry.slug === activeSlug}
                pending={entry.slug === pendingSlug}
                onSelect={() => onSelect(entry)}
                onPreload={() => onPreload(entry)}
              />
              {entry.slug === activeSlug && <GalleryDownloads entry={entry} />}
            </div>
          ))}
      </div>
    </section>
  );
}
