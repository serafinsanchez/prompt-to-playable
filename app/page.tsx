"use client";

import { useGLTF } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { GalleryStrip } from "@/components/gallery/gallery-strip";
import type { GalleryEntry } from "@/scripts/pregen/manifest";
import { useGallery } from "@/components/gallery/use-gallery";
import { generatedCharacterSource } from "@/components/pipeline/completion";
import { LivePipeline } from "@/components/pipeline/live-pipeline";
import { usePipeline } from "@/components/pipeline/use-pipeline";
import { CLIP_NAMES, type CharacterSource } from "@/components/scene/clip-binding";
import { MOVEMENT_KEY_CODES } from "@/components/scene/controls";
import { Playground } from "@/components/scene/playground";

const HINT_STORAGE_KEY = "ptp-hint-dismissed";

const HINT_KEYS: Array<[keys: string, does: string]> = [
  ["wasd", "walk"],
  ["shift", "run"],
  ["space", "jump"],
  ["e", "wave"],
];

/**
 * The 15-second bet (PRD metric): no instructions, one mono line that
 * fades on first movement and stays gone for the session.
 */
const noopSubscribe = () => () => {};

function ControlHint() {
  // Server snapshot says "seen" so returning visitors never get a flash.
  const seenThisSession = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem(HINT_STORAGE_KEY) !== null,
    () => true,
  );
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">("shown");

  useEffect(() => {
    if (seenThisSession || phase !== "shown") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!MOVEMENT_KEY_CODES.has(event.code)) return;
      sessionStorage.setItem(HINT_STORAGE_KEY, "1");
      setPhase("fading");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seenThisSession, phase]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => setPhase("gone"), 260);
    return () => clearTimeout(timer);
  }, [phase]);

  if (seenThisSession || phase === "gone") return null;

  return (
    <div
      data-testid="control-hint"
      className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none sm:bottom-8 ${
        phase === "shown" ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 rounded-md bg-background/60 px-4 py-3 font-mono text-xs uppercase tracking-caps">
        {HINT_KEYS.map(([keys, does]) => (
          <span key={keys} className="flex items-baseline gap-x-2">
            <kbd className="rounded-sm border border-border bg-surface/80 px-2 py-1 font-mono text-foreground">
              {keys}
            </kbd>
            <span className="text-muted">{does}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * US-05 stage arbitration: the generated character claims the stage only via
 * an explicit "Play it" (never auto-swap — no scene hijack mid-control), and
 * only for the run it was clicked on: `playingRunStart` pins the claim to
 * run.startedAt, so start-over and fresh runs fall back to the gallery.
 */
function useGeneratedCharacter(gallerySource: CharacterSource | null): {
  character: CharacterSource | null;
  playing: boolean;
  playPending: boolean;
  play: () => void;
  release: () => void;
} {
  const run = usePipeline((state) => state.run);
  const [playingRunStart, setPlayingRunStart] = useState<number | null>(null);
  const [playPending, startTransition] = useTransition();

  const generated = useMemo(
    () => (run?.status === "succeeded" ? generatedCharacterSource(run) : null),
    [run],
  );
  const playing =
    generated !== null && run?.startedAt !== null && run?.startedAt === playingRunStart;

  const play = () => {
    if (generated === null || run?.startedAt == null) return;
    useGLTF.preload(generated.rig);
    // Array form — useBoundCharacter suspends on useGLTF(clipUrls), whose
    // cache key is the whole array; per-URL preloads would never be read.
    useGLTF.preload(CLIP_NAMES.map((clip) => generated.clips[clip]));
    const startedAt = run.startedAt;
    // Transition: the outgoing character stays on stage while the generated
    // GLBs suspend — same no-gap swap as the gallery (US-02).
    startTransition(() => setPlayingRunStart(startedAt));
  };

  return {
    character: playing ? generated : gallerySource,
    playing,
    playPending,
    play,
    release: () => setPlayingRunStart(null),
  };
}

/**
 * drei caches GLB load *rejections* forever (suspend-react has no eviction),
 * so without this a retried Play would re-throw the stale error instantly.
 * Clear both cache keys useBoundCharacter reads: the rig and the clip array.
 */
function evictCharacterCache(source: CharacterSource): void {
  useGLTF.clear(source.rig);
  useGLTF.clear(CLIP_NAMES.map((clip) => source.clips[clip]));
}

export default function Home() {
  const gallery = useGallery();
  const generated = useGeneratedCharacter(gallery.source);

  // Failed load: evict the poisoned cache entries so a later attempt can
  // actually refetch, then hand the stage back to the gallery.
  const handleCharacterError = () => {
    if (generated.character !== null) evictCharacterCache(generated.character);
    generated.release();
  };

  // Picking a gallery card hands the stage back — "your character" stays one
  // click away in the completion block for the rest of the session.
  const selectGalleryEntry = (entry: GalleryEntry) => {
    generated.release();
    gallery.select(entry);
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* On a failed character load (expired assets, network) hand the stage
          back to the gallery instead of letting the error unmount the app. */}
      <Playground character={generated.character} onCharacterError={handleCharacterError} />

      {/* Thin overlay chrome — the scene is the hero (DESIGN.md). */}
      <header className="pointer-events-none absolute inset-x-0 top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 pt-6">
          {/* Wordmark is a noun, not a promise — the tagline beside it does the
              explaining. "First playable" is the game-dev term for the first
              build you can actually pick up and control. */}
          <h1 className="font-display text-md font-extrabold tracking-display">
            First Playable
          </h1>
          <p className="font-mono text-xs uppercase tracking-caps text-muted">
            Type a character. Play it.
          </p>
        </div>
      </header>

      <ControlHint />

      {/* US-02: browse the pregen gallery, swap the stage character in place.
          While the generated character holds the stage, no card claims it. */}
      <GalleryStrip
        status={gallery.status}
        activeSlug={generated.playing ? "" : (gallery.activeSlug ?? "")}
        pendingSlug={gallery.pendingSlug}
        onSelect={selectGalleryEntry}
        onPreload={gallery.preload}
      />

      {/* US-03a/US-03b: live pipeline (key entry, prompt, stage rail) */}
      <LivePipeline
        playingGenerated={generated.playing}
        onPlayGenerated={generated.play}
        playPending={generated.playPending}
      />
    </main>
  );
}
