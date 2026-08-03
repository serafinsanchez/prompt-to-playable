import type { CharacterSource } from "./clip-binding";

/**
 * The spike knight (P0 #4). ~8.5 MB per GLB — accepted placeholder until
 * TASK-06a produces the optimized gallery knight; same manifest shape.
 */
export const DEFAULT_CHARACTER: CharacterSource = {
  rig: "/spike/rig.glb",
  clips: {
    idle: "/spike/animate-idle.glb",
    walk: "/spike/animate-walk.glb",
    run: "/spike/animate-run.glb",
    jump: "/spike/animate-jump.glb",
    emote: "/spike/animate-emote.glb",
  },
};
