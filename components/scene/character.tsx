"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import {
  bindCharacterClips,
  CLIP_NAMES,
  type BoundCharacter,
  type CharacterSource,
  type ClipName,
} from "./clip-binding";
import { normalizeClipFacing } from "./clip-facing";
import { normalizeMeshyMaterials } from "./meshy-material";

/**
 * Load a character's rig + clip GLBs and bind them through one mixer
 * (see `clip-binding.ts`). Suspends while GLBs load — call inside
 * <Suspense>. Both the idle display (US-01a) and the controller
 * (US-01b) build on this.
 */
export function useBoundCharacter(source: CharacterSource): {
  scene: THREE.Object3D;
  bound: BoundCharacter;
} {
  const rig = useGLTF(source.rig);
  const clipUrls = useMemo(
    () => CLIP_NAMES.map((name) => source.clips[name]),
    [source],
  );
  const clipGltfs = useGLTF(clipUrls);

  const bound = useMemo(() => {
    const clips = Object.fromEntries(
      CLIP_NAMES.map((name, i) => [name, clipGltfs[i].animations[0] ?? null]),
    ) as Record<ClipName, THREE.AnimationClip | null>;
    // Meshy clips don't share a root orientation — align them all to idle's.
    normalizeClipFacing(rig.scene, clips);
    // Meshy rigs glow their own basecolor and default to full metal — undo both.
    normalizeMeshyMaterials(rig.scene);
    return bindCharacterClips(rig.scene, clips);
  }, [rig.scene, clipGltfs]);

  useEffect(
    () => () => {
      bound.mixer.stopAllAction();
    },
    [bound],
  );

  return { scene: rig.scene, bound };
}

/**
 * Static display character: keeps the named clip playing. The
 * controllable knight lives in `controlled-character.tsx`.
 */
export function Character({
  source,
  clip = "idle",
}: {
  source: CharacterSource;
  clip?: ClipName;
}) {
  const { scene, bound } = useBoundCharacter(source);

  useEffect(() => {
    const action = bound.actions[clip];
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [bound, clip]);

  // The idle is content, not chrome — it keeps playing under reduced motion.
  useFrame((_, delta) => bound.mixer.update(delta));

  return <primitive object={scene} />;
}
