"use client";

/**
 * Intermediate artifact preview (US-03b): a tiny one-shot GLB render. One
 * shared offscreen WebGLRenderer snapshots the mesh to a data URL, then the
 * GL context is left idle — no per-thumbnail canvases competing with the
 * playground scene. Load failures (CORS, expired Meshy URL, fixture URLs in
 * tests) degrade to an iconographic cube; the rail never breaks on assets.
 */

import { useEffect, useState } from "react";
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const SNAPSHOT_SIZE = 96;

let renderer: WebGLRenderer | null = null;
/** Serializes snapshots — one shared renderer, one job at a time. */
let queue: Promise<unknown> = Promise.resolve();

async function snapshotGlb(url: string): Promise<string> {
  if (renderer === null) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SNAPSHOT_SIZE, SNAPSHOT_SIZE);
  }

  // Meshy live artifacts are plain GLBs, but pregen gallery meshes use
  // EXT_meshopt_compression — support both, like the scene loader does.
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = new Scene();
  scene.add(gltf.scene);
  scene.add(new HemisphereLight(0xffffff, 0x444444, 2.4));
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(2, 4, 3);
  scene.add(key);

  // Frame the mesh from a low three-quarter angle.
  const box = new Box3().setFromObject(gltf.scene);
  const center = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2 || 1;
  const camera = new PerspectiveCamera(35, 1, radius / 100, radius * 10);
  camera.position
    .copy(center)
    .add(new Vector3(0.7, 0.45, 1).normalize().multiplyScalar(radius * 2.0));
  camera.lookAt(center);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  // Free GPU memory — the data URL is all the rail keeps.
  scene.traverse((object) => {
    if ("geometry" in object) (object.geometry as { dispose?: () => void }).dispose?.();
    if ("material" in object) {
      const material = object.material as { dispose?: () => void } | Array<{ dispose?: () => void }>;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose?.());
      else material.dispose?.();
    }
  });

  return dataUrl;
}

interface ArtifactThumbnailProps {
  url: string;
  /** Stage name for alt text + testids, e.g. "preview". */
  label: string;
}

export function ArtifactThumbnail({ url, label }: ArtifactThumbnailProps) {
  const [snapshot, setSnapshot] = useState<string | "failed" | null>(null);

  // Reset to the loading state when the URL changes — render-time adjustment,
  // not an effect setState (react-hooks/set-state-in-effect).
  const [snapshotUrl, setSnapshotUrl] = useState(url);
  if (snapshotUrl !== url) {
    setSnapshotUrl(url);
    setSnapshot(null);
  }

  useEffect(() => {
    let cancelled = false;
    queue = queue
      .then(() => snapshotGlb(url))
      .then((dataUrl) => {
        if (!cancelled) setSnapshot(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSnapshot("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <span
      data-testid={`artifact-thumb-${label}`}
      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-background"
    >
      {typeof snapshot === "string" && snapshot !== "failed" ? (
        // eslint-disable-next-line @next/next/no-img-element -- inline data URL; next/image optimizes nothing here
        <img
          src={snapshot}
          alt={`${label} stage mesh`}
          draggable={false}
          className="size-full object-cover transition-[transform,opacity] duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
        />
      ) : (
        // Loading and failed share the iconographic cube; loading pulses.
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`size-4 stroke-muted ${
            snapshot === null ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
          fill="none"
          strokeWidth="1"
          strokeLinejoin="round"
        >
          <path d="M8 1.5l5.5 3v7l-5.5 3-5.5-3v-7z" />
          <path d="M8 1.5v7M2.5 4.5L8 8.5l5.5-4" />
        </svg>
      )}
    </span>
  );
}
