/**
 * Stage status ring (US-03b, US-06). One SVG, seven visual kinds — each kind
 * gets a distinct GLYPH, not just a color (a11y: state never reads by color
 * alone): pending = hollow, queued = queue bars, running = progress arc,
 * succeeded = tick, failed = cross, backoff = pause bars, queue-full = dots.
 * The accent + soft glow appear ONLY on the running ring (DESIGN.md's single
 * allowed glow). The tick lands with a 220ms scale/opacity entrance — the
 * structural half of the P2 signature moment.
 */

import type { RowKind } from "./stage-meta";

const CIRCUMFERENCE = 2 * Math.PI * 8;

interface ProgressRingProps {
  kind: RowKind;
  /** 0–100; only the running ring reads it. */
  progress: number;
  /** Compact rings for the animate group rows. */
  compact?: boolean;
}

export function ProgressRing({ kind, progress, compact = false }: ProgressRingProps) {
  const stroke = {
    pending: "stroke-border",
    queued: "stroke-muted",
    running: "stroke-accent",
    succeeded: "stroke-success",
    failed: "stroke-error",
    backoff: "stroke-warning",
    "queue-full": "stroke-warning",
  }[kind];

  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      data-ring={kind}
      className={`${compact ? "size-4" : "size-5"} shrink-0 ${
        // Low-alpha accent glow, main rings only — five parallel animate
        // clips must not glow in chorus ("if everything glows, nothing does").
        kind === "running" && !compact
          ? "[filter:drop-shadow(0_0_5px_color-mix(in_oklch,var(--color-accent)_50%,transparent))]"
          : ""
      } ${kind === "queued" || kind === "queue-full" ? "animate-pulse motion-reduce:animate-none" : ""}`}
    >
      {/* Track — every kind keeps the circle so rows stay aligned. */}
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        strokeWidth="1.5"
        className={kind === "running" ? "stroke-border" : `${stroke} ${kind === "pending" ? "opacity-60" : ""}`}
      />

      {kind === "running" && (
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress / 100)}
          transform="rotate(-90 10 10)"
          className="stroke-accent"
        />
      )}

      {kind === "queued" && (
        // Three stacked bars: "there's a line ahead of you".
        <g strokeWidth="1.5" strokeLinecap="round" className={stroke}>
          <line x1="7" y1="7.5" x2="13" y2="7.5" />
          <line x1="7" y1="10" x2="13" y2="10" />
          <line x1="7" y1="12.5" x2="13" y2="12.5" />
        </g>
      )}

      {kind === "succeeded" && (
        <path
          d="M6.5 10.5l2.5 2.5 4.5-5"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${stroke} origin-center transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:scale-75 starting:opacity-0 motion-reduce:transition-none`}
        />
      )}

      {kind === "failed" && (
        // The cross lands with the tick's exact entrance — every terminal
        // state gets the same choreography weight (US-07).
        <g
          strokeWidth="2"
          strokeLinecap="round"
          className={`${stroke} origin-center transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:scale-75 starting:opacity-0 motion-reduce:transition-none`}
        >
          <line x1="7.5" y1="7.5" x2="12.5" y2="12.5" />
          <line x1="12.5" y1="7.5" x2="7.5" y2="12.5" />
        </g>
      )}

      {kind === "backoff" && (
        // Pause bars: deliberately holding still, will resume itself.
        <g strokeWidth="2" strokeLinecap="round" className={stroke}>
          <line x1="8.25" y1="7" x2="8.25" y2="13" />
          <line x1="11.75" y1="7" x2="11.75" y2="13" />
        </g>
      )}

      {kind === "queue-full" && (
        // Waiting dots: a slot has to free up before the task even exists.
        <g className={`${stroke} fill-warning`} strokeWidth="0">
          <circle cx="6.5" cy="10" r="1" />
          <circle cx="10" cy="10" r="1" />
          <circle cx="13.5" cy="10" r="1" />
        </g>
      )}
    </svg>
  );
}
