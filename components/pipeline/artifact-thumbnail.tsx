"use client";

/**
 * Intermediate artifact preview (US-03b). Preferred path: Meshy's
 * pre-rendered `thumbnail_url` PNG in a plain <img> — a few hundred KB, no
 * CORS needed (image elements aren't CORS-checked for display), no WebGL.
 * Fallback (runs persisted before thumbnailUrl existed, or tasks without
 * one): a one-shot GLB render through a shared offscreen WebGLRenderer —
 * this downloads the full mesh (10–30 MB per stage), which is exactly why
 * it is no longer the primary path. GLB URLs arrive already proxied
 * same-origin (lib/meshy/assets.ts — assets.meshy.ai is CORS-opaque to
 * fetch). All load failures degrade to an iconographic cube; the rail
 * never breaks on assets.
 *
 * `snapshotGlb` is exported so the US-08 lightbox shares this same
 * renderer for its own fallback snapshot. Serialization lives *inside*
 * `snapshotGlb` (the module-level `queue`) rather than in each caller's
 * effect, so every caller — this component and the lightbox — is
 * serialized onto the one WebGLRenderer by construction; no caller has to
 * remember to chain onto a shared queue itself.
 */

import { useEffect, useState } from "react";
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 512, not the rail's display size: the same snapshot backs the US-08
// lightbox at up to 640px, and upscaling a 96px render is mush. One-shot
// cost, and the rail's 32px slot gets a sharper downscale on hi-DPI for free.
const SNAPSHOT_SIZE = 512;

let renderer: WebGLRenderer | null = null;

async function renderSnapshot(url: string): Promise<string> {
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

  // Free GPU memory — the data URL is all the rail keeps. Material.dispose()
  // does NOT release the textures it references, and a PBR refine GLB carries
  // 2K–4K maps, so dispose texture values explicitly or they pin GPU memory
  // on the shared renderer for the session.
  const disposeMaterial = (material: object): void => {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) value.dispose();
    }
    (material as { dispose?: () => void }).dispose?.();
  };
  scene.traverse((object) => {
    if ("geometry" in object) (object.geometry as { dispose?: () => void }).dispose?.();
    if ("material" in object) {
      const material = object.material as object | object[];
      if (Array.isArray(material)) material.forEach(disposeMaterial);
      else disposeMaterial(material);
    }
  });

  return dataUrl;
}

/** Serializes every caller onto the one shared renderer — one job at a time. */
let queue: Promise<void> = Promise.resolve();

/**
 * Snapshots a GLB through the one shared offscreen renderer. Chains onto
 * `queue` internally so any number of concurrent callers (this component's
 * own effect, the US-08 lightbox fallback) still run one render job at a
 * time — the queue update always resolves regardless of this job's outcome,
 * so one caller's rejection can never stall the callers queued behind it.
 */
export async function snapshotGlb(url: string): Promise<string> {
  const job = queue.then(() => renderSnapshot(url));
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

interface ArtifactThumbnailProps {
  /** GLB URL — the fallback snapshot source when no thumbnail image exists. */
  url: string;
  /** Meshy's pre-rendered PNG; when present the mesh is never downloaded. */
  thumbnailUrl?: string | null;
  /** Stage name for alt text + testids, e.g. "preview". */
  label: string;
}

export function ArtifactThumbnail({ url, thumbnailUrl, label }: ArtifactThumbnailProps) {
  // Image path state: loading (pulse) → loaded (clip-in) | failed (GLB fallback).
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">("loading");
  const [snapshot, setSnapshot] = useState<string | "failed" | null>(null);
  // An expired thumbnail PNG (signed URLs die in ~3 days) falls back to the
  // GLB snapshot instead of a dead cube — resumed runs keep their previews.
  const image = imageState === "failed" ? null : (thumbnailUrl ?? null);

  // Reset to the loading state when the source changes — render-time
  // adjustment, not an effect setState (react-hooks/set-state-in-effect).
  // NUL-separated: a URL can contain a space but never a NUL, so this can't
  // collide the way "a b" + "c" vs "a" + "b c" could with a plain join.
  const source = `${thumbnailUrl ?? ""}\0${url}`;
  const [prevSource, setPrevSource] = useState(source);
  if (prevSource !== source) {
    setPrevSource(source);
    setImageState("loading");
    setSnapshot(null);
  }

  useEffect(() => {
    if (image !== null) return; // <img> path — no GLB download, no WebGL
    let cancelled = false;
    // snapshotGlb serializes internally — no need to chain a module-level
    // queue here too.
    void snapshotGlb(url)
      .then((dataUrl) => {
        if (!cancelled) setSnapshot(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSnapshot("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [image, url]);

  const shownSrc =
    image !== null
      ? imageState === "loaded"
        ? image
        : null
      : typeof snapshot === "string" && snapshot !== "failed"
        ? snapshot
        : null;
  const settledFailed = image === null && snapshot === "failed";

  return (
    <span
      data-testid={`artifact-thumb-${label}`}
      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-background"
    >
      {/* The <img> mounts hidden while the PNG streams so onLoad can fire;
          flipping display re-triggers @starting-style, so the 220ms clip-in
          (DESIGN.md's completion beat) animates real pixels, not an empty
          well. onError falls back to the GLB snapshot path. */}
      {image !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- signed Meshy PNG; next/image optimizes nothing here
        <img
          src={image}
          alt={`${label} stage mesh`}
          draggable={false}
          onLoad={() => setImageState("loaded")}
          onError={() => setImageState("failed")}
          className={
            imageState === "loaded"
              ? "size-full object-cover transition-[transform,opacity] delay-(--duration-stagger) duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
              : "hidden"
          }
        />
      )}
      {image === null && shownSrc !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- inline data URL; next/image optimizes nothing here
        <img
          src={shownSrc}
          alt={`${label} stage mesh`}
          draggable={false}
          className="size-full object-cover transition-[transform,opacity] delay-(--duration-stagger) duration-(--duration-normal) ease-(--ease-stage) starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
        />
      )}
      {shownSrc === null && (
        // Loading and failed share the iconographic cube; loading pulses.
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`size-4 stroke-muted ${
            settledFailed ? "" : "animate-pulse motion-reduce:animate-none"
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
