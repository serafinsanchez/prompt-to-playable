"use client";

/**
 * App-side singleton of the pipeline store, wired to the real browser deps:
 * proxy transport (x-meshy-key), Date.now clock, localStorage for run
 * snapshots, sessionStorage for the key. Components read slices through
 * usePipeline(); tests build their own store via createPipelineStore().
 *
 * Storage adapters resolve window lazily so importing this module during SSR
 * is safe — actions only run client-side (effects and event handlers).
 */

import { useStore } from "zustand";
import { createMeshyClient } from "../../lib/meshy/client";
import { createBrowserTransport } from "../../lib/meshy/transport";
import type { StorageAdapter } from "../../lib/meshy/storage";
import { createPipelineStore, type PipelineStoreState } from "./store";

function lazyStorage(resolve: () => Storage): StorageAdapter {
  const available = (): boolean => typeof window !== "undefined";
  return {
    getItem: (key) => (available() ? resolve().getItem(key) : null),
    setItem: (key, value) => {
      if (available()) resolve().setItem(key, value);
    },
    removeItem: (key) => {
      if (available()) resolve().removeItem(key);
    },
  };
}

export const pipelineStore = createPipelineStore({
  client: createMeshyClient(
    // Key read at call time from React state — never logged, never in URLs.
    createBrowserTransport({ getKey: () => pipelineStore.getState().apiKey }),
  ),
  clock: { now: () => Date.now() },
  runStorage: lazyStorage(() => window.localStorage),
  keyStorage: lazyStorage(() => window.sessionStorage),
});

export function usePipeline<T>(selector: (state: PipelineStoreState) => T): T {
  return useStore(pipelineStore, selector);
}
