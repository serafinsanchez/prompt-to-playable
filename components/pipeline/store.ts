/**
 * Zustand pipeline store — orchestration ONLY (US-03a). The state machine in
 * lib/meshy/pipeline.ts owns all pipeline logic; this store just wires it to
 * the app: subscribe → mirror snapshots into Zustand → saveRun on every emit →
 * setInterval-driven tick() at POLL_INTERVAL_MS. Nothing here re-implements
 * machine behavior.
 *
 * Storage split (docs/ARCHITECTURE.md §4 — never mix):
 * - runStorage  (localStorage)   → task ids / run snapshots only, never the key.
 * - keyStorage  (sessionStorage) → the visitor's Meshy key only, never run data.
 *
 * Every dependency is injected so tests drive the store against the fixture
 * transport with a manual clock and scheduler — no window, no timers.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import type { MeshyClient } from "../../lib/meshy/client";
import {
  createPipeline,
  POLL_INTERVAL_MS,
  type Clock,
  type Pipeline,
} from "../../lib/meshy/pipeline";
import {
  clearRun,
  loadRun,
  saveRun,
  type StorageAdapter,
} from "../../lib/meshy/storage";
import { MeshyApiError, type PipelineRun } from "../../lib/meshy/types";

/** sessionStorage key for the visitor's Meshy key. Never localStorage. */
export const KEY_STORAGE_KEY = "prompt-to-playable:meshy-key";

/** Proxy 401 copy — DESIGN.md voice: short, plain. */
export const KEY_REJECTED_COPY = "Key rejected. Check it and paste again.";

/** Injectable interval source so tests fire ticks by hand. */
export interface TickScheduler {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface PipelineStoreDeps {
  client: MeshyClient;
  clock: Clock;
  /** localStorage-backed adapter — run snapshots (task ids), never the key. */
  runStorage: StorageAdapter;
  /** sessionStorage-backed adapter — the key, never run data. */
  keyStorage: StorageAdapter;
  scheduler?: TickScheduler;
}

export interface PipelineStoreState {
  /** The visitor's Meshy key — React state mirrored to sessionStorage. */
  apiKey: string;
  /** Set when the proxy answers 401 — surfaced as "key rejected" copy. */
  keyError: string | null;
  /** Latest machine snapshot; null until a run starts or resumes. */
  run: PipelineRun | null;
  /** Non-fatal tick failure (network blip etc.); cleared by the next good tick. */
  tickError: string | null;
  /** True after hydrate() ran once — guards React strict-mode double mounts. */
  hydrated: boolean;
  /** True while the 4s interval is registered. */
  ticking: boolean;

  setKey(key: string): void;
  clearKey(): void;
  /** On mount: restore key + run; a non-terminal run resumes and keeps ticking. */
  hydrate(): void;
  start(prompt: string): void;
  /** Terminal affordance: clearRun + reset to the idle prompt state. */
  startOver(): void;
  /** Unmount cleanup — interval off; a later hydrate() resumes it. */
  stopTicker(): void;
  /** Restart the interval for a still-running run (after remount or key fix). */
  resumeTicker(): void;
}

const defaultScheduler: TickScheduler = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

function isTerminal(run: PipelineRun | null): boolean {
  return run !== null && (run.status === "succeeded" || run.status === "failed");
}

export function createPipelineStore(
  deps: PipelineStoreDeps,
): StoreApi<PipelineStoreState> {
  const { client, clock, runStorage, keyStorage, scheduler = defaultScheduler } = deps;

  let pipeline: Pipeline | null = null;
  let unsubscribe: (() => void) | null = null;
  let intervalHandle: unknown = null;
  let tickInFlight = false;

  return createStore<PipelineStoreState>()((set, get) => {
    const stopTicking = (): void => {
      if (intervalHandle !== null) {
        scheduler.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      if (get().ticking) set({ ticking: false });
    };

    /** One guarded machine advance. 401 → key rejected + ticker off. */
    const tickSafe = async (): Promise<void> => {
      if (pipeline === null || tickInFlight) return;
      tickInFlight = true;
      try {
        await pipeline.tick();
        if (get().tickError !== null) set({ tickError: null });
      } catch (error) {
        if (error instanceof MeshyApiError && error.status === 401) {
          stopTicking();
          set({ keyError: KEY_REJECTED_COPY });
        } else {
          // Transient (network blip): keep the cadence, surface one mono line.
          set({ tickError: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        tickInFlight = false;
      }
    };

    const startTicking = (): void => {
      if (intervalHandle !== null) return;
      intervalHandle = scheduler.setInterval(() => void tickSafe(), POLL_INTERVAL_MS);
      set({ ticking: true });
      void tickSafe(); // first advance now, not 4s from now
    };

    const detach = (): void => {
      stopTicking();
      unsubscribe?.();
      unsubscribe = null;
      pipeline = null;
    };

    /** Build a machine (fresh or restored) and mirror every emit into the store. */
    const attach = (run?: PipelineRun): Pipeline => {
      detach();
      pipeline = createPipeline({ client, clock, ...(run !== undefined ? { run } : {}) });
      unsubscribe = pipeline.subscribe((snapshot) => {
        saveRun(runStorage, snapshot);
        set({ run: snapshot });
        if (isTerminal(snapshot)) stopTicking();
      });
      return pipeline;
    };

    return {
      apiKey: "",
      keyError: null,
      run: null,
      tickError: null,
      hydrated: false,
      ticking: false,

      setKey: (key) => {
        if (key === "") {
          get().clearKey();
          return;
        }
        keyStorage.setItem(KEY_STORAGE_KEY, key);
        set({ apiKey: key, keyError: null });
        get().resumeTicker(); // a fixed key un-sticks a 401-stopped run
      },

      clearKey: () => {
        keyStorage.removeItem(KEY_STORAGE_KEY);
        stopTicking(); // no key means every poll would 401 — don't bother
        set({ apiKey: "", keyError: null });
      },

      hydrate: () => {
        if (get().hydrated) {
          get().resumeTicker(); // strict-mode remount: just pick the tick back up
          return;
        }
        const storedKey = keyStorage.getItem(KEY_STORAGE_KEY);
        const storedRun = loadRun(runStorage);
        set({
          hydrated: true,
          ...(storedKey !== null ? { apiKey: storedKey } : {}),
          ...(storedRun !== null ? { run: storedRun } : {}),
        });
        if (storedRun !== null && storedRun.status === "running") {
          attach(storedRun);
          startTicking();
        }
      },

      start: (prompt) => {
        const { apiKey, run } = get();
        if (apiKey === "" || run?.status === "running" || prompt.trim() === "") return;
        attach().start(prompt.trim()); // emit → subscriber saves + mirrors
        startTicking();
      },

      startOver: () => {
        detach();
        clearRun(runStorage);
        set({ run: null, tickError: null });
      },

      stopTicker: () => stopTicking(),

      resumeTicker: () => {
        const { run, keyError, apiKey } = get();
        if (pipeline === null || run?.status !== "running") return;
        if (apiKey === "" || keyError !== null) return;
        startTicking();
      },
    };
  });
}
