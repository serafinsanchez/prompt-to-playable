/**
 * Versioned persistence of a PipelineRun against an injected storage adapter
 * (localStorage in the app, an in-memory map in tests/Node). The stored
 * envelope carries a `version` field so a breaking schema change simply
 * invalidates old runs instead of resuming into garbage
 * (docs/ARCHITECTURE.md §2). No window/localStorage access here — isomorphic.
 */

import type { PipelineRun } from "./types";

/** Bump on any breaking change to the PipelineRun shape. */
export const STORAGE_VERSION = 1;

export const STORAGE_KEY = "prompt-to-playable:pipeline-run";

/** Structural subset of Web Storage so any key-value store can back it. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredEnvelope {
  version: number;
  run: PipelineRun;
}

export function saveRun(storage: StorageAdapter, run: PipelineRun): void {
  const envelope: StoredEnvelope = { version: STORAGE_VERSION, run };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export function loadRun(storage: StorageAdapter): PipelineRun | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    clearRun(storage);
    return null;
  }

  if (
    typeof envelope !== "object" ||
    envelope === null ||
    (envelope as StoredEnvelope).version !== STORAGE_VERSION ||
    typeof (envelope as StoredEnvelope).run !== "object" ||
    (envelope as StoredEnvelope).run === null
  ) {
    clearRun(storage);
    return null;
  }

  return (envelope as StoredEnvelope).run;
}

export function clearRun(storage: StorageAdapter): void {
  storage.removeItem(STORAGE_KEY);
}
