import * as THREE from "three";

/** The five clips every character ships with (pipeline animate ×5). */
export const CLIP_NAMES = ["idle", "walk", "run", "jump", "emote"] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/**
 * Manifest-shaped pointer to a character's GLBs. US-02 swaps sources
 * (spike knight → gallery manifest entries) without touching the loaders.
 */
export interface CharacterSource {
  rig: string;
  clips: Record<ClipName, string>;
}

export interface BoundCharacter {
  mixer: THREE.AnimationMixer;
  actions: Record<ClipName, THREE.AnimationAction>;
}

/**
 * Bind the five animation clips to a rigged scene through a single
 * AnimationMixer. Proven in the TASK-05 spike: Meshy's animate GLBs each
 * carry one AnimationClip whose tracks target the rig skeleton directly,
 * so binding is zero-retarget.
 */
export function bindCharacterClips(
  rigScene: THREE.Object3D,
  clips: Record<ClipName, THREE.AnimationClip | null | undefined>,
): BoundCharacter {
  const missing = CLIP_NAMES.filter((name) => !clips[name]);
  if (missing.length > 0) {
    throw new Error(
      `Character clips missing from their GLBs: ${missing.join(", ")}. ` +
        "Each animate GLB must contain exactly one AnimationClip.",
    );
  }

  const mixer = new THREE.AnimationMixer(rigScene);
  const actions = Object.fromEntries(
    CLIP_NAMES.map((name) => [name, mixer.clipAction(clips[name] as THREE.AnimationClip)]),
  ) as Record<ClipName, THREE.AnimationAction>;

  return { mixer, actions };
}
