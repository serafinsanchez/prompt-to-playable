/**
 * US-07: the 380ms swap-in arrival — pure easing math for the character's
 * entrance scale. The scene applies this per-frame; determinism and the
 * reduced-motion collapse are what matter here.
 */

import { describe, expect, it } from "vitest";
import {
  ARRIVAL_MS,
  ARRIVAL_SCALE_FROM,
  arrivalScale,
  easeStage,
} from "../../components/scene/arrival";

describe("easeStage — cubic-bezier(0.16, 1, 0.3, 1)", () => {
  it("anchors at 0 and 1", () => {
    expect(easeStage(0)).toBeCloseTo(0, 5);
    expect(easeStage(1)).toBeCloseTo(1, 5);
  });

  it("is a hard ease-out: most of the travel lands early", () => {
    expect(easeStage(0.25)).toBeGreaterThan(0.6);
    expect(easeStage(0.5)).toBeGreaterThan(0.85);
  });

  it("is monotonically non-decreasing", () => {
    let previous = 0;
    for (let step = 0; step <= 100; step++) {
      const value = easeStage(step / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = value;
    }
  });

  it("clamps out-of-range inputs", () => {
    expect(easeStage(-0.5)).toBe(0);
    expect(easeStage(1.5)).toBe(1);
  });
});

describe("arrivalScale", () => {
  it("uses DESIGN.md's slow duration — 380ms, the character swap-in beat", () => {
    expect(ARRIVAL_MS).toBe(380);
  });

  it("starts at the entrance scale and settles at 1", () => {
    expect(arrivalScale(0, false)).toBeCloseTo(ARRIVAL_SCALE_FROM, 5);
    expect(arrivalScale(ARRIVAL_MS, false)).toBe(1);
    expect(arrivalScale(ARRIVAL_MS * 4, false)).toBe(1);
  });

  it("moves toward 1 on the brand curve, never overshooting", () => {
    const mid = arrivalScale(ARRIVAL_MS / 2, false);
    expect(mid).toBeGreaterThan(ARRIVAL_SCALE_FROM);
    expect(mid).toBeLessThanOrEqual(1);
  });

  it("collapses under reduced motion — full scale from the first frame", () => {
    expect(arrivalScale(0, true)).toBe(1);
    expect(arrivalScale(ARRIVAL_MS / 2, true)).toBe(1);
  });
});
