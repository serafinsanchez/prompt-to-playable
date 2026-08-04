"use client";

import { useKeyboardControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import Ecctrl, { useGame } from "ecctrl";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useBoundCharacter } from "./character";
import { CLIP_NAMES, type CharacterSource, type ClipName } from "./clip-binding";
import {
  CAM_DISTANCE,
  CAM_DISTANCE_PORTRAIT,
  CONTROL,
  JUMP_VELOCITY,
  SPRINT_MULT,
  STAGE_BOUNDS,
  WALK_FULL_SPEED,
} from "./controls";
import { computeClipTargets, type MotionMode } from "./locomotion";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

declare global {
  interface Window {
    /** Test bridge: the knight's world position, updated every frame (Playwright reads it). */
    __ptpCharacterPosition?: [number, number, number];
  }
}

/**
 * ecctrl state names → our clip names. jumpIdle stays on the jump clip
 * (clamped last frame) while airborne; jumpLand hands back to idle.
 */
const ANIMATION_SET = {
  idle: "idle",
  walk: "walk",
  run: "run",
  jump: "jump",
  jumpIdle: "jump",
  jumpLand: "idle",
  action1: "emote",
} as const;

/** How fast mixer weights chase their targets (exponential damping λ). */
const WEIGHT_DAMP = 10;
/** Smoothing for the measured ground speed — physics jitter stays out of the blend. */
const SPEED_DAMP = 12;

function motionModeFor(curAnimation: string | null): MotionMode {
  if (curAnimation === "jump") return "airborne";
  if (curAnimation === "emote") return "emote";
  return "locomotion";
}

/** Invisible floor + four walls: the knight stays on the lit stage (US-01b req 4). */
function StageColliders() {
  const wall = STAGE_BOUNDS + 0.5;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[wall + 2, 1, wall + 2]} position={[0, -1, 0]} />
      <CuboidCollider args={[0.5, 4, wall + 2]} position={[wall, 4, 0]} />
      <CuboidCollider args={[0.5, 4, wall + 2]} position={[-wall, 4, 0]} />
      <CuboidCollider args={[wall + 2, 4, 0.5]} position={[0, 4, wall]} />
      <CuboidCollider args={[wall + 2, 4, 0.5]} position={[0, 4, -wall]} />
    </RigidBody>
  );
}

/**
 * The rigged knight inside ecctrl's capsule: drives US-01a's bound clip
 * actions from ecctrl's movement state + measured ground speed. Idle is
 * the mathematical floor of the blend — the character is never frozen.
 */
function CharacterBody({ source }: { source: CharacterSource }) {
  const { scene, bound } = useBoundCharacter(source);
  const group = useRef<THREE.Group>(null);
  const lastPosition = useRef<THREE.Vector3 | null>(null);
  const smoothedSpeed = useRef(0);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);

  const [subscribeKeys] = useKeyboardControls();

  // Every clip runs from frame one; weights decide who owns the pose.
  useEffect(() => {
    for (const name of CLIP_NAMES) {
      const action = bound.actions[name];
      action.play();
      action.setEffectiveWeight(name === "idle" ? 1 : 0);
    }
  }, [bound]);

  // Hand ecctrl our clip names so its state machine speaks them back.
  useEffect(() => {
    useGame.getState().initializeAnimationSet(ANIMATION_SET);
  }, []);

  // ecctrl only fires action1 from gamepads — wire the emote key ourselves.
  // The store gates it to idle, so movement naturally blocks the wave.
  useEffect(() => {
    if (!subscribeKeys) return;
    return subscribeKeys(
      (state) => state[CONTROL.emote],
      (pressed) => {
        if (pressed) useGame.getState().action1?.();
      },
    );
  }, [subscribeKeys]);

  // One-shots: restart the clip when its state begins; emote hands back to idle when done.
  useEffect(
    () =>
      useGame.subscribe(
        (state) => state.curAnimation,
        (curAnimation) => {
          if (curAnimation !== "jump" && curAnimation !== "emote") return;
          const action = bound.actions[curAnimation as ClipName];
          action.reset().setLoop(THREE.LoopOnce, 1).play();
          action.clampWhenFinished = true;
        },
      ),
    [bound],
  );

  useEffect(() => {
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action === bound.actions.emote) useGame.getState().reset();
    };
    bound.mixer.addEventListener("finished", onFinished);
    return () => bound.mixer.removeEventListener("finished", onFinished);
  }, [bound]);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.getWorldPosition(worldPosition);

      // Measured planar ground speed — feeds the blend and the playback rate.
      if (lastPosition.current && delta > 0) {
        const dx = worldPosition.x - lastPosition.current.x;
        const dz = worldPosition.z - lastPosition.current.z;
        const speed = Math.hypot(dx, dz) / delta;
        smoothedSpeed.current = THREE.MathUtils.damp(
          smoothedSpeed.current,
          speed,
          SPEED_DAMP,
          delta,
        );
      }
      lastPosition.current = (lastPosition.current ?? new THREE.Vector3()).copy(worldPosition);
      window.__ptpCharacterPosition = [worldPosition.x, worldPosition.y, worldPosition.z];
    }

    const mode = motionModeFor(useGame.getState().curAnimation);
    const targets = computeClipTargets(mode, smoothedSpeed.current);
    for (const name of CLIP_NAMES) {
      const action = bound.actions[name];
      action.setEffectiveWeight(
        THREE.MathUtils.damp(action.getEffectiveWeight(), targets.weights[name], WEIGHT_DAMP, delta),
      );
      action.setEffectiveTimeScale(targets.timeScales[name]);
    }

    bound.mixer.update(delta);
  });

  return (
    <group ref={group}>
      {/* Feet sit at the capsule's floating base; Meshy rigs face −X, ecctrl moves along +Z. */}
      <group position={[0, -0.9, 0]} rotation-y={Math.PI / 2}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/**
 * ecctrl-driven playable knight (US-01b): WASD/arrows walk, Shift runs,
 * Space jumps, E waves; smooth-damped follow cam that respects
 * `prefers-reduced-motion` by cutting instead of gliding.
 */
export function ControlledCharacter({ source }: { source: CharacterSource }) {
  const reducedMotion = usePrefersReducedMotion();
  const size = useThree((state) => state.size);
  // Frozen at mount: ecctrl reads camInitDis once, and remounting would teleport the knight.
  const [camDistance] = useState(() =>
    size.width / size.height < 0.75 ? CAM_DISTANCE_PORTRAIT : CAM_DISTANCE,
  );

  return (
    <>
      <StageColliders />
      <Ecctrl
        animated
        ccd
        position={[0, 1.2, 0]}
        capsuleHalfHeight={0.55}
        capsuleRadius={0.3}
        floatHeight={0.2}
        maxVelLimit={WALK_FULL_SPEED}
        sprintMult={SPRINT_MULT}
        jumpVel={JUMP_VELOCITY}
        camInitDis={-camDistance}
        camMaxDis={-camDistance - 2}
        camMinDis={-1.4}
        camTargetPos={{ x: 0, y: -0.1, z: 0 }}
        // Start above and behind, pitched down — the lit floor pool stays in frame.
        camInitDir={{ x: 0.3, y: 0 }}
        // Camera pitch floor stays above the horizon — it can never dip under the stage.
        camLowLimit={0.12}
        camUpLimit={1.2}
        camCollision
        // Reduced motion: lerp factors this high are cuts, not glides (DESIGN.md).
        camFollowMult={reducedMotion ? 1000 : 11}
        camLerpMult={reducedMotion ? 1000 : 25}
        turnSpeed={reducedMotion ? 100 : 15}
      >
        <CharacterBody source={source} />
      </Ecctrl>
    </>
  );
}
