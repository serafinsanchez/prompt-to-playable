"use client";

import { ContactShadows, useProgress } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { Character } from "./character";
import type { CharacterSource } from "./clip-binding";
import { SCENE_COLOR } from "./colors";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const CAMERA_POSITION: [number, number, number] = [0, 1.5, 3.4];
const LOOK_AT: [number, number, number] = [0, 0.9, 0];

/** Barely-there orbit of the resting camera. Chrome, not content — off under reduced motion. */
function CameraDrift({ enabled }: { enabled: boolean }) {
  useFrame((state) => {
    const { camera, clock, size } = state;
    if (enabled) {
      const t = clock.elapsedTime;
      camera.position.x = Math.sin(t * 0.22) * 0.14;
      camera.position.y = CAMERA_POSITION[1] + Math.sin(t * 0.16) * 0.05;
    }
    // Portrait viewports: pull back so the header never overlaps the knight.
    camera.position.z = size.width / size.height < 0.75 ? 4.4 : CAMERA_POSITION[2];
    camera.lookAt(...LOOK_AT);
  });
  return null;
}

/** Ground disc + fog + layered lights. Atmosphere, not props (DESIGN.md). */
function Stage() {
  return (
    <>
      <color attach="background" args={[SCENE_COLOR.background]} />
      <fog attach="fog" args={[SCENE_COLOR.background, 5.5, 12]} />

      <hemisphereLight args={[SCENE_COLOR.foreground, SCENE_COLOR.background, 0.45]} />
      {/* Warm key from front-left; character reads without washing out the dark. */}
      <directionalLight position={[2.5, 4, 2.5]} intensity={0.9} color={SCENE_COLOR.foreground} />
      {/* Chartreuse rim from behind — the scene's single accent, never decorative. */}
      <directionalLight position={[-2, 3, -3.5]} intensity={1.2} color={SCENE_COLOR.accent} />
      {/* Overhead pool of light: anchors the knight to the floor, stage-style. */}
      <spotLight
        position={[0, 5.5, 0.8]}
        angle={0.34}
        penumbra={1}
        intensity={750}
        color={SCENE_COLOR.foreground}
        target-position={[0, 0, 0]}
      />

      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[24, 64]} />
        <meshStandardMaterial color={SCENE_COLOR.surface} roughness={1} metalness={0} />
      </mesh>
      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.7}
        scale={7}
        blur={2.4}
        far={2.5}
        color={SCENE_COLOR.shadow}
      />
    </>
  );
}

/**
 * Loading line, DESIGN.md voice — mono, short, no spinner. Sits like the
 * first line of a build log; fades out 220ms after the GLBs land.
 */
function LoadingVeil() {
  const { active, progress } = useProgress();
  const done = !active && progress === 100;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setGone(true), 260);
    return () => clearTimeout(timer);
  }, [done]);

  if (gone) return null;

  return (
    <div
      role="status"
      data-testid="scene-loading"
      className={`pointer-events-none absolute inset-0 flex items-end px-6 pb-16 transition-opacity duration-(--duration-normal) ease-(--ease-stage) motion-reduce:transition-none ${
        done ? "opacity-0" : "opacity-100"
      }`}
    >
      <p className="font-mono text-sm uppercase tracking-caps text-muted">
        Loading the knight. Six files, zero spinners.
      </p>
    </div>
  );
}

/**
 * The full-bleed playground stage (ARCHITECTURE §3): dark stage, one
 * character, idle always playing. Fills its nearest positioned ancestor.
 */
export function Playground({ character }: { character: CharacterSource }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: CAMERA_POSITION, fov: 42 }}
        onCreated={({ camera }) => camera.lookAt(...LOOK_AT)}
      >
        <Stage />
        <CameraDrift enabled={!reducedMotion} />
        <Suspense fallback={null}>
          {/* Meshy rigs face −X; +75° turns the knight into a 3/4 view toward camera. */}
          <group rotation-y={1.3}>
            <Character source={character} clip="idle" />
          </group>
        </Suspense>
      </Canvas>
      <LoadingVeil />
    </div>
  );
}
