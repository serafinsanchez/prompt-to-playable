/**
 * Raw sRGB equivalents of the OKLCH tokens in `app/globals.css` — three.js
 * cannot parse `oklch()`, so the scene duplicates the literals here.
 * Keep in sync with DESIGN.md §Color.
 */
export const SCENE_COLOR = {
  /** --color-background: oklch(0.15 0.008 80) */
  background: "#0d0b08",
  /** --color-surface: oklch(0.20 0.01 80) */
  surface: "#181611",
  /** --color-border: oklch(0.30 0.012 80) */
  border: "#312d27",
  /** --color-foreground: oklch(0.93 0.005 80) — key light tint */
  foreground: "#eae7e4",
  /** --color-accent: oklch(0.87 0.24 128) — the one accent; rim light only */
  accent: "#a6ef00",
  /** Contact-shadow tint — true black is intentional for shadow only, not a surface. */
  shadow: "#000000",
} as const;
