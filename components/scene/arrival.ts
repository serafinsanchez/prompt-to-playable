/**
 * US-07: the 380ms swap-in arrival. When a character takes the stage the
 * scene gives it one breath of entrance — a transform-only scale settle on
 * DESIGN.md's slow duration and brand curve. Pure math; the scene applies it
 * per-frame so the beat stays deterministic and reduced-motion collapses to
 * a cut (scale 1 from the first frame).
 */

/** DESIGN.md slow — stage transitions, character swap-in. */
export const ARRIVAL_MS = 380;
/** Entrance scale: a settle, not a pop — the character is content, not chrome. */
export const ARRIVAL_SCALE_FROM = 0.94;

const P1X = 0.16;
const P1Y = 1;
const P2X = 0.3;
const P2Y = 1;

function bezierAxis(u: number, c1: number, c2: number): number {
  const inverse = 1 - u;
  return 3 * inverse * inverse * u * c1 + 3 * inverse * u * u * c2 + u * u * u;
}

/**
 * y for x on cubic-bezier(0.16, 1, 0.3, 1) — the --ease-stage curve. x is
 * monotone on [0,1] for these control points, so bisection converges fast.
 */
export function easeStage(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 32; step++) {
    const mid = (low + high) / 2;
    if (bezierAxis(mid, P1X, P2X) < x) low = mid;
    else high = mid;
  }
  const u = (low + high) / 2;
  return bezierAxis(u, P1Y, P2Y);
}

/** Character scale `elapsedMs` into the arrival; 1 immediately under reduced motion. */
export function arrivalScale(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || elapsedMs >= ARRIVAL_MS) return 1;
  const eased = easeStage(elapsedMs / ARRIVAL_MS);
  return ARRIVAL_SCALE_FROM + (1 - ARRIVAL_SCALE_FROM) * eased;
}
