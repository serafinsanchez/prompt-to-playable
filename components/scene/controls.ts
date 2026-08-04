/**
 * The one place controls live (US-01b req 1). Key bindings, movement
 * speeds, and clip-blend tuning are all remapped here — nothing else
 * hardcodes a key or a velocity.
 */

/** drei <KeyboardControls> action names — ecctrl reads these five, we read the rest. */
export const CONTROL = {
  forward: "forward",
  backward: "backward",
  leftward: "leftward",
  rightward: "rightward",
  jump: "jump",
  run: "run",
  emote: "action1",
} as const;

/** KeyboardEvent codes per action. Arrows + WASD walk, Shift runs, Space jumps, E emotes. */
export const CONTROL_MAP = [
  { name: CONTROL.forward, keys: ["ArrowUp", "KeyW"] },
  { name: CONTROL.backward, keys: ["ArrowDown", "KeyS"] },
  { name: CONTROL.leftward, keys: ["ArrowLeft", "KeyA"] },
  { name: CONTROL.rightward, keys: ["ArrowRight", "KeyD"] },
  { name: CONTROL.jump, keys: ["Space"] },
  { name: CONTROL.run, keys: ["ShiftLeft", "ShiftRight"] },
  { name: CONTROL.emote, keys: ["KeyE"] },
];

/** Key codes that count as "the visitor moved" — the control hint fades on the first one. */
export const MOVEMENT_KEY_CODES = new Set(
  CONTROL_MAP.filter((entry) => entry.name !== CONTROL.emote).flatMap((entry) => entry.keys),
);

/** Ground speed (m/s) ecctrl holds at plain walk — its `maxVelLimit`. */
export const WALK_FULL_SPEED = 2.1;
/** Sprint multiplier — ecctrl's `sprintMult`; run cruise = walk × this. */
export const SPRINT_MULT = 2;
/** Ground speed at full sprint. */
export const RUN_FULL_SPEED = WALK_FULL_SPEED * SPRINT_MULT;
/** Below this planar speed the character is standing — idle owns the pose. */
export const IDLE_FULL_SPEED = 0.2;
/** Planar speed at which walk fully replaces idle. */
export const WALK_BLEND_IN_SPEED = 1.0;

/**
 * Ground speed (m/s) each loop was authored at — playback rate scales as
 * actualSpeed / authoredSpeed so feet plant instead of slide. Tuned by eye
 * against the spike knight (walk 4.23s loop, run 0.77s loop).
 */
export const WALK_CLIP_SPEED = 2.1;
export const RUN_CLIP_SPEED = 4.2;

/** Playback clamps — the 0.77s run loop strobes past ~1.15× (spike README QA flag). */
export const WALK_TIMESCALE_MIN = 0.6;
export const WALK_TIMESCALE_MAX = 1.5;
export const RUN_TIMESCALE_MIN = 0.85;
export const RUN_TIMESCALE_MAX = 1.15;

/** ecctrl jump impulse velocity. */
export const JUMP_VELOCITY = 3.6;

/** Square play-area half-extent (m) — invisible walls keep the knight on the lit stage. */
export const STAGE_BOUNDS = 8.5;

/** Camera: default and portrait follow distances (portrait pulls back, US-01a behavior). */
export const CAM_DISTANCE = 3.4;
export const CAM_DISTANCE_PORTRAIT = 4.4;
