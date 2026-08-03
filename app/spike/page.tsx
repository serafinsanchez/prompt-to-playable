"use client";

/**
 * TASK-05 spike harness — NOT product UI. Loads the rigged GLB plus the five
 * downloaded animation GLBs from /spike/ (populated by
 * scripts/spike/run-pipeline.ts), binds every AnimationClip to the rigged
 * skeleton, and switches clips on keys 1–5. Deleted or gated before P2 ships.
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";

const CLIPS = ["idle", "walk", "run", "jump", "emote"] as const;
const CLIP_URLS = CLIPS.map((clip) => `/spike/animate-${clip}.glb`);
const RIG_URL = "/spike/rig.glb";

interface BoundClip {
  name: string;
  duration: number;
  tracks: number;
}

function Character({
  activeIndex,
  onBound,
}: {
  activeIndex: number;
  onBound: (clips: BoundClip[]) => void;
}) {
  const rig = useGLTF(RIG_URL);
  const clipGltfs = useGLTF(CLIP_URLS);
  const mixer = useMemo(() => new THREE.AnimationMixer(rig.scene), [rig.scene]);

  const clips = useMemo(
    () => clipGltfs.map((gltf) => gltf.animations[0] ?? null),
    [clipGltfs],
  );

  useEffect(() => {
    onBound(
      clips.map((clip, i) => ({
        name: clip ? `${CLIPS[i]} (${clip.name})` : `${CLIPS[i]} — NO CLIP IN GLB`,
        duration: clip?.duration ?? 0,
        tracks: clip?.tracks.length ?? 0,
      })),
    );
  }, [clips, onBound]);

  useEffect(() => {
    const clip = clips[activeIndex];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset().fadeIn(0.15).play();
    return () => {
      action.fadeOut(0.15);
    };
  }, [activeIndex, clips, mixer]);

  useFrame((_, delta) => mixer.update(delta));

  return <primitive object={rig.scene} />;
}

class GlbBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null };
  static getDerivedStateFromError(error: unknown) {
    return { failed: String(error) };
  }
  render() {
    if (this.state.failed !== null) {
      return (
        <main className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
          <div className="max-w-lg font-mono text-sm">
            <p className="text-error">Spike GLBs not found.</p>
            <p className="mt-4 text-muted">
              Run <span className="text-accent">npx tsx scripts/spike/run-pipeline.ts</span> with a
              real MESHY_API_KEY first — it downloads the rigged character and the five clips into
              public/spike/.
            </p>
            <p className="mt-4 break-all text-muted">{this.state.failed}</p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function SpikePage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [bound, setBound] = useState<BoundClip[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (index >= 0 && index < CLIPS.length) setActiveIndex(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <GlbBoundary>
      <main className="relative h-screen w-screen bg-background text-foreground">
        <Canvas camera={{ position: [0, 1.4, 3], fov: 50 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 2]} intensity={1.4} />
          <Suspense fallback={null}>
            <Character activeIndex={activeIndex} onBound={setBound} />
          </Suspense>
          <Grid args={[20, 20]} cellColor="#444444" sectionColor="#666666" />
          <OrbitControls target={[0, 0.9, 0]} />
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 font-mono text-xs">
          <p className="text-accent">TASK-05 spike harness — keys 1–5 switch clips</p>
          <ul className="mt-2">
            {bound.map((clip, i) => (
              <li key={clip.name} className={i === activeIndex ? "text-foreground" : "text-muted"}>
                [{i + 1}] {clip.name} — {clip.duration.toFixed(2)}s, {clip.tracks} tracks
              </li>
            ))}
          </ul>
        </div>
      </main>
    </GlbBoundary>
  );
}
