import { describe, expect, it } from "vitest";

import { clearRun, loadRun, saveRun, STORAGE_KEY, STORAGE_VERSION, type StorageAdapter } from "../storage";
import { PIPELINE_STAGES, type PipelineRun, type StageState } from "../types";

function memoryStorage(): StorageAdapter & { dump(): Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => map,
  };
}

function sampleRun(): PipelineRun {
  const stages = Object.fromEntries(
    PIPELINE_STAGES.map((stage): [string, StageState] => [
      stage,
      {
        stage,
        status: stage === "preview" ? "succeeded" : stage === "refine" ? "running" : "pending",
        taskId: stage === "preview" ? "preview-0001" : stage === "refine" ? "refine-0002" : null,
        progress: stage === "preview" ? 100 : 0,
        creditCost: stage === "preview" ? 20 : null,
        modelUrl: stage === "preview" ? "https://assets.meshy.test/preview-0001.glb" : null,
        startedAt: stage === "preview" ? 1_000 : stage === "refine" ? 61_000 : null,
        completedAt: stage === "preview" ? 60_000 : null,
        error: null,
      },
    ]),
  ) as PipelineRun["stages"];

  return {
    prompt: "a brave knight",
    status: "running",
    stages,
    startedAt: 1_000,
    completedAt: null,
    creditsSpent: 20,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: 65_000,
  };
}

describe("storage", () => {
  it("round-trips a mid-pipeline run through save and load", () => {
    const storage = memoryStorage();
    const run = sampleRun();

    saveRun(storage, run);
    const restored = loadRun(storage);

    expect(restored).toEqual(run);
    expect(restored).not.toBe(run);
  });

  it("stores a versioned envelope under the stable key", () => {
    const storage = memoryStorage();

    saveRun(storage, sampleRun());

    const raw = storage.dump().get(STORAGE_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!).version).toBe(STORAGE_VERSION);
  });

  it("discards an incompatible version cleanly: returns null and removes the entry", () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION + 1, run: sampleRun() }),
    );

    expect(loadRun(storage)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards corrupt JSON cleanly", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");

    expect(loadRun(storage)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(loadRun(memoryStorage())).toBeNull();
  });

  it("clearRun removes the stored run", () => {
    const storage = memoryStorage();
    saveRun(storage, sampleRun());

    clearRun(storage);

    expect(loadRun(storage)).toBeNull();
  });
});
