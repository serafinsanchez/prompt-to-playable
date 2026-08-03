"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import {
  bindCharacterClips,
  CLIP_NAMES,
  type CharacterSource,
  type ClipName,
} from "./clip-binding";

/**
 * Loads a character's rig + clip GLBs, binds them through one mixer
 * (see `clip-binding.ts`), and keeps the named clip playing. Suspends
 * while GLBs load — mount inside <Suspense>.
 */
export function Character({
  source,
  clip = "idle",
}: {
  source: CharacterSource;
  clip?: ClipName;
}) {
  const rig = useGLTF(source.rig);
  const clipUrls = useMemo(
    () => CLIP_NAMES.map((name) => source.clips[name]),
    [source],
  );
  const clipGltfs = useGLTF(clipUrls);

  const bound = useMemo(
    () =>
      bindCharacterClips(
        rig.scene,
        Object.fromEntries(
          CLIP_NAMES.map((name, i) => [name, clipGltfs[i].animations[0] ?? null]),
        ) as Record<ClipName, THREE.AnimationClip | null>,
      ),
    [rig.scene, clipGltfs],
  );

  useEffect(() => {
    const action = bound.actions[clip];
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [bound, clip]);

  useEffect(
    () => () => {
      bound.mixer.stopAllAction();
    },
    [bound],
  );

  // The idle is content, not chrome — it keeps playing under reduced motion.
  useFrame((_, delta) => bound.mixer.update(delta));

  return <primitive object={rig.scene} />;
}
