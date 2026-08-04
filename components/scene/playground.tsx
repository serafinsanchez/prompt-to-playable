"use client";

import { ContactShadows, KeyboardControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect, useState } from "react";
import type { CharacterSource } from "./clip-binding";
import { SCENE_COLOR } from "./colors";
import { ControlledCharacter } from "./controlled-character";
import { CONTROL_MAP } from "./controls";

const CAMERA_POSITION: [number, number, number] = [0, 1.5, 3.4];
const LOOK_AT: [number, number, number] = [0, 0.9, 0];

/** Ground disc + fog + layered lights. Atmosphere, not props (DESIGN.md). */
function Stage() {
  return (
    <>
      <color attach="background" args={[SCENE_COLOR.background]} />
      <fog attach="fog" args={[SCENE_COLOR.background, 5.5, 12]} />

      <hemisphereLight args={[SCENE_COLOR.foreground, SCENE_COLOR.background, 0.45]} />
      {/* Warm key from camera-left; the follow cam rests at −Z (US-01b), so the key sits there too. */}
      <directionalLight position={[2.5, 4, -2.5]} intensity={0.9} color={SCENE_COLOR.foreground} />
      {/* Chartreuse rim from beyond the knight, low and grazing — silhouettes him against the dark; the one accent. */}
      <directionalLight position={[-3, 1.6, 2.2]} intensity={3.2} color={SCENE_COLOR.accent} />
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
      {/* Covers the whole playable square (±STAGE_BOUNDS) so the knight is always grounded. */}
      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.7}
        scale={20}
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
 * playable character, idle always playing. Fills its nearest positioned
 * ancestor. ecctrl owns the camera from first frame (US-01b).
 */
export function Playground({ character }: { character: CharacterSource }) {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: CAMERA_POSITION, fov: 42 }}
        onCreated={({ camera }) => camera.lookAt(...LOOK_AT)}
      >
        <Stage />
        <KeyboardControls map={CONTROL_MAP}>
          <Suspense fallback={null}>
            {/* Fixed timestep: GLB-parse frame stalls must not tunnel the capsule through the floor. */}
            <Physics>
              <ControlledCharacter source={character} />
            </Physics>
          </Suspense>
        </KeyboardControls>
      </Canvas>
      <LoadingVeil />
    </div>
  );
}
