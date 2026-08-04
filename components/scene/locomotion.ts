import { CLIP_NAMES, type ClipName } from "./clip-binding";
import {
  IDLE_FULL_SPEED,
  RUN_CLIP_SPEED,
  RUN_FULL_SPEED,
  RUN_TIMESCALE_MAX,
  RUN_TIMESCALE_MIN,
  WALK_BLEND_IN_SPEED,
  WALK_CLIP_SPEED,
  WALK_FULL_SPEED,
  WALK_TIMESCALE_MAX,
  WALK_TIMESCALE_MIN,
} from "./controls";

/**
 * What the body is doing, coarsely. Locomotion blends idle/walk/run by
 * speed; airborne and emote hand the pose to their one-shot clip.
 */
export type MotionMode = "locomotion" | "airborne" | "emote";

export interface ClipTargets {
  /** Normalized blend weight per clip — always sums to 1. */
  weights: Record<ClipName, number>;
  /** Playback rate per clip — walk/run track ground speed to kill foot-slide. */
  timeScales: Record<ClipName, number>;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** 0 below `from`, 1 above `to`, linear ramp between. */
const ramp = (value: number, from: number, to: number) =>
  clamp((value - from) / (to - from), 0, 1);

/**
 * Pure clip-blend policy (US-01b req 2): continuous idle↔walk↔run by
 * planar ground speed, playback rate matched to speed. The controller
 * damps actual mixer weights toward these targets each frame.
 */
export function computeClipTargets(mode: MotionMode, planarSpeed: number): ClipTargets {
  const weights: Record<ClipName, number> = {
    idle: 0,
    walk: 0,
    run: 0,
    jump: 0,
    emote: 0,
  };

  if (mode === "airborne") {
    weights.jump = 1;
  } else if (mode === "emote") {
    weights.emote = 1;
  } else {
    const runWeight = ramp(planarSpeed, WALK_FULL_SPEED, RUN_FULL_SPEED);
    const walkIn = ramp(planarSpeed, IDLE_FULL_SPEED, WALK_BLEND_IN_SPEED);
    weights.run = runWeight;
    weights.walk = walkIn * (1 - runWeight);
    weights.idle = 1 - walkIn;
  }

  const timeScales = Object.fromEntries(CLIP_NAMES.map((name) => [name, 1])) as Record<
    ClipName,
    number
  >;
  if (mode === "locomotion") {
    timeScales.walk = clamp(
      planarSpeed / WALK_CLIP_SPEED,
      WALK_TIMESCALE_MIN,
      WALK_TIMESCALE_MAX,
    );
    timeScales.run = clamp(planarSpeed / RUN_CLIP_SPEED, RUN_TIMESCALE_MIN, RUN_TIMESCALE_MAX);
  }

  return { weights, timeScales };
}
