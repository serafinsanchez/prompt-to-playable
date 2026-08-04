/**
 * Stage status ring (US-03b). One SVG, five visual kinds — each kind gets a
 * distinct GLYPH, not just a color (a11y: state never reads by color alone):
 * pending = hollow, queued = queue bars, running = progress arc, succeeded =
 * tick, failed = cross. The accent + soft glow appear ONLY on the running
 * ring (DESIGN.md's single allowed glow). The tick lands with a 220ms
 * scale/opacity entrance — the structural half of the P2 signature moment.
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
      } ${kind === "queued" ? "animate-pulse motion-reduce:animate-none" : ""}`}
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
        <g strokeWidth="2" strokeLinecap="round" className={stroke}>
          <line x1="7.5" y1="7.5" x2="12.5" y2="12.5" />
          <line x1="12.5" y1="7.5" x2="7.5" y2="12.5" />
        </g>
      )}
    </svg>
  );
}
