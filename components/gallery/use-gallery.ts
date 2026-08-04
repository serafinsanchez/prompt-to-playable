"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CharacterSource } from "../scene/clip-binding";
import { CLIP_NAMES } from "../scene/clip-binding";
import { DEFAULT_CHARACTER } from "../scene/default-character";
import type { GalleryEntry } from "../../scripts/pregen/manifest";
import type { GalleryStatus } from "./gallery-strip";
import { loadGalleryManifest, toCharacterSource } from "./manifest";

/**
 * Gallery state for the page: manifest fetch, selection, hover preload,
 * and transition-wrapped swaps so the outgoing character stays on stage
 * until the incoming GLBs are ready (no gap, no full-screen state).
 *
 * The active source prefers the manifest (optimized GLBs, ~2.5 MB) —
 * the raw 53 MB spike set is only the fallback when the manifest fails.
 */
export function useGallery(): {
  status: GalleryStatus;
  source: CharacterSource | null;
  activeSlug: string | null;
  pendingSlug: string | null;
  select: (entry: GalleryEntry) => void;
  preload: (entry: GalleryEntry) => void;
} {
  const [status, setStatus] = useState<GalleryStatus>({ state: "loading" });
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [targetSlug, setTargetSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    loadGalleryManifest()
      .then((entries) => {
        if (alive) setStatus({ state: "ready", entries });
      })
      .catch(() => {
        if (alive) {
          setStatus({ state: "error", message: "Gallery manifest didn't load." });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const fallback = status.state === "ready" ? (status.entries[0] ?? null) : null;
  const active = selected ?? fallback;

  const source = useMemo(() => {
    if (active) return toCharacterSource(active);
    // Manifest failed: the raw spike knight still gives the visitor a character.
    return status.state === "error" ? DEFAULT_CHARACTER : null;
  }, [active, status.state]);

  const preload = (entry: GalleryEntry) => {
    useGLTF.preload(entry.glbPath);
    for (const clip of CLIP_NAMES) useGLTF.preload(entry.clipPaths[clip]);
  };

  const select = (entry: GalleryEntry) => {
    if (entry.slug === active?.slug) return;
    preload(entry);
    setTargetSlug(entry.slug);
    // Transition: React keeps the current character mounted while the new
    // one's GLBs suspend — the stage never goes empty mid-swap.
    startTransition(() => setSelected(entry));
  };

  return {
    status,
    source,
    activeSlug: active?.slug ?? null,
    pendingSlug: isPending ? targetSlug : null,
    select,
    preload,
  };
}
