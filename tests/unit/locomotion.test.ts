import { describe, expect, it } from "vitest";
import { CLIP_NAMES, type ClipName } from "../../components/scene/clip-binding";
import {
  IDLE_FULL_SPEED,
  RUN_FULL_SPEED,
  RUN_TIMESCALE_MAX,
  WALK_FULL_SPEED,
} from "../../components/scene/controls";
import { computeClipTargets, type MotionMode } from "../../components/scene/locomotion";

function weightSum(weights: Record<ClipName, number>): number {
  return CLIP_NAMES.reduce((sum, name) => sum + weights[name], 0);
}

describe("computeClipTargets", () => {
  it("returns pure idle when standing still", () => {
    const { weights } = computeClipTargets("locomotion", 0);
    expect(weights.idle).toBe(1);
    expect(weights.walk).toBe(0);
    expect(weights.run).toBe(0);
    expect(weights.jump).toBe(0);
    expect(weights.emote).toBe(0);
  });

  it("is walk-dominant at walk cruise speed with idle and run silent", () => {
    const { weights } = computeClipTargets("locomotion", WALK_FULL_SPEED);
    expect(weights.walk).toBeGreaterThan(0.99);
    expect(weights.idle).toBe(0);
    expect(weights.run).toBe(0);
  });

  it("is run-only at sprint cruise speed", () => {
    const { weights } = computeClipTargets("locomotion", RUN_FULL_SPEED);
    expect(weights.run).toBe(1);
    expect(weights.walk).toBe(0);
    expect(weights.idle).toBe(0);
  });

  it("cross-blends walk and run between the two cruise speeds", () => {
    const mid = (WALK_FULL_SPEED + RUN_FULL_SPEED) / 2;
    const { weights } = computeClipTargets("locomotion", mid);
    expect(weights.walk).toBeGreaterThan(0.1);
    expect(weights.run).toBeGreaterThan(0.1);
  });

  it("keeps weights normalized and in [0, 1] across the whole speed sweep", () => {
    for (let speed = 0; speed <= RUN_FULL_SPEED * 1.5; speed += 0.05) {
      const { weights } = computeClipTargets("locomotion", speed);
      for (const name of CLIP_NAMES) {
        expect(weights[name]).toBeGreaterThanOrEqual(0);
        expect(weights[name]).toBeLessThanOrEqual(1);
      }
      expect(weightSum(weights)).toBeCloseTo(1, 5);
    }
  });

  it("run weight grows monotonically with speed", () => {
    let previous = 0;
    for (let speed = 0; speed <= RUN_FULL_SPEED; speed += 0.05) {
      const { weights } = computeClipTargets("locomotion", speed);
      expect(weights.run).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = weights.run;
    }
  });

  it("scales walk playback with ground speed so feet do not slide", () => {
    const cruise = computeClipTargets("locomotion", WALK_FULL_SPEED);
    const half = computeClipTargets("locomotion", WALK_FULL_SPEED / 2);
    expect(cruise.timeScales.walk).toBeCloseTo(1, 1);
    expect(half.timeScales.walk).toBeLessThan(cruise.timeScales.walk);
    expect(half.timeScales.walk).toBeGreaterThan(0);
  });

  it("clamps run playback so the 0.77s loop never strobes", () => {
    const { timeScales } = computeClipTargets("locomotion", RUN_FULL_SPEED * 2);
    expect(timeScales.run).toBeLessThanOrEqual(RUN_TIMESCALE_MAX);
  });

  it("gives the jump clip full weight while airborne, at natural playback", () => {
    const { weights, timeScales } = computeClipTargets("airborne", RUN_FULL_SPEED);
    expect(weights.jump).toBe(1);
    expect(weightSum(weights)).toBeCloseTo(1, 5);
    expect(timeScales.jump).toBe(1);
  });

  it("gives the emote clip full weight while emoting", () => {
    const { weights } = computeClipTargets("emote", 0);
    expect(weights.emote).toBe(1);
    expect(weightSum(weights)).toBeCloseTo(1, 5);
  });

  it("treats sub-threshold drift as standing still", () => {
    const { weights } = computeClipTargets("locomotion", IDLE_FULL_SPEED / 2);
    expect(weights.idle).toBe(1);
  });

  const modes: MotionMode[] = ["locomotion", "airborne", "emote"];
  it("always returns a timescale for every clip in every mode", () => {
    for (const mode of modes) {
      const { timeScales } = computeClipTargets(mode, 1);
      for (const name of CLIP_NAMES) {
        expect(timeScales[name]).toBeGreaterThan(0);
      }
    }
  });
});
