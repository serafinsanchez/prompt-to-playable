/**
 * US-03a store tests — orchestration against the fixture transport. The
 * machine's own branches live in lib/meshy/__tests__/pipeline.test.ts; here we
 * only verify the wiring: start → interval tick → snapshot mirroring, saveRun
 * on every emit, key/session-storage discipline, 401 → key rejected, resume
 * from a stored mid-flight run, and terminal/unmount interval cleanup.
 */

import { describe, expect, it } from "vitest";

import {
  createPipelineStore,
  KEY_REJECTED_COPY,
  KEY_STORAGE_KEY,
  type TickScheduler,
} from "../../components/pipeline/store";
import {
  ANIMATIONS_PATH,
  createMeshyClient,
  REMESH_PATH,
  RIGGING_PATH,
  TEXT_TO_3D_PATH,
} from "../../lib/meshy/client";
import { POLL_INTERVAL_MS } from "../../lib/meshy/pipeline";
import { scaffoldPrompt } from "../../lib/meshy/prompt-craft";
import { loadRun, saveRun, STORAGE_KEY, type StorageAdapter } from "../../lib/meshy/storage";
import { MeshyApiError, type PipelineRun } from "../../lib/meshy/types";
import {
  animationSucceeded,
  makeFixtureTransport,
  rigSucceeded,
  succeeded,
  task,
  type FixtureTable,
} from "../../lib/meshy/__tests__/fixtures";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function memoryStorage(): StorageAdapter & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/** Records the interval and lets the test fire the tick callback by hand. */
function manualScheduler(): TickScheduler & {
  callback: (() => void) | null;
  intervalMs: number | null;
  cleared: number;
} {
  const scheduler = {
    callback: null as (() => void) | null,
    intervalMs: null as number | null,
    cleared: 0,
    setInterval(callback: () => void, ms: number): unknown {
      scheduler.callback = callback;
      scheduler.intervalMs = ms;
      return "interval-handle";
    },
    clearInterval(): void {
      scheduler.cleared += 1;
      scheduler.callback = null;
      scheduler.intervalMs = null;
    },
  };
  return scheduler;
}

function storeWith(table: FixtureTable) {
  const { transport, calls } = makeFixtureTransport(table);
  let now = 0;
  const runStorage = memoryStorage();
  const keyStorage = memoryStorage();
  const scheduler = manualScheduler();
  const store = createPipelineStore({
    client: createMeshyClient(transport),
    clock: { now: () => now },
    runStorage,
    keyStorage,
    scheduler,
  });
  const advance = async (ms: number): Promise<void> => {
    now += ms;
    scheduler.callback?.();
    await drain();
  };
  return { store, calls, runStorage, keyStorage, scheduler, advance, setNow: (t: number) => (now = t) };
}

/** Let the async tickSafe promise chain settle. */
async function drain(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

const ANIMATION_IDS = ["animate-0004", "animate-0005", "animate-0006", "animate-0007", "animate-0008"];

/** Full happy-path table: every stage succeeds on its first poll. */
function happyTable(): FixtureTable {
  return {
    [`POST ${TEXT_TO_3D_PATH}`]: [
      { body: { result: "preview-0001" } },
      { body: { result: "refine-0002" } },
    ],
    [`GET ${TEXT_TO_3D_PATH}/:id`]: [
      { body: succeeded("preview-0001", 20) },
      { body: succeeded("refine-0002", 10) },
    ],
    [`POST ${REMESH_PATH}`]: [{ body: { result: "remesh-0003" } }],
    [`GET ${REMESH_PATH}/:id`]: [{ body: succeeded("remesh-0003", 5) }],
    [`POST ${RIGGING_PATH}`]: [{ body: { result: "rigging-0003" } }],
    [`GET ${RIGGING_PATH}/:id`]: [{ body: rigSucceeded("rigging-0003", 5) }],
    [`POST ${ANIMATIONS_PATH}`]: ANIMATION_IDS.map((id) => ({ body: { result: id } })),
    [`GET ${ANIMATIONS_PATH}/:id`]: ANIMATION_IDS.map((id) => ({ body: animationSucceeded(id, 3) })),
  };
}

// ---------------------------------------------------------------------------
// Key handling
// ---------------------------------------------------------------------------

describe("key handling", () => {
  it("mirrors the key to sessionStorage and never to run storage", () => {
    const { store, keyStorage, runStorage } = storeWith({});

    store.getState().setKey("msy_test_key");

    expect(store.getState().apiKey).toBe("msy_test_key");
    expect(keyStorage.getItem(KEY_STORAGE_KEY)).toBe("msy_test_key");
    expect(JSON.stringify(runStorage.dump())).not.toContain("msy_test_key");
  });

  it("clearKey wipes state and sessionStorage", () => {
    const { store, keyStorage } = storeWith({});

    store.getState().setKey("msy_test_key");
    store.getState().clearKey();

    expect(store.getState().apiKey).toBe("");
    expect(keyStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
  });

  it("hydrate restores the key from sessionStorage", () => {
    const { store, keyStorage } = storeWith({});
    keyStorage.setItem(KEY_STORAGE_KEY, "msy_restored");

    store.getState().hydrate();

    expect(store.getState().apiKey).toBe("msy_restored");
  });
});

// ---------------------------------------------------------------------------
// Start → tick → snapshot flow
// ---------------------------------------------------------------------------

describe("start and tick flow", () => {
  it("start registers a POLL_INTERVAL_MS ticker and the first tick creates preview", async () => {
    const { store, calls, scheduler, advance } = storeWith(happyTable());
    store.getState().setKey("msy_test_key");

    store.getState().start("a bronze knight");
    await drain(); // immediate first tick

    expect(scheduler.intervalMs).toBe(POLL_INTERVAL_MS);
    expect(store.getState().ticking).toBe(true);
    expect(calls[0]?.key).toBe(`POST ${TEXT_TO_3D_PATH}`);
    expect(store.getState().run?.stages.preview.taskId).toBe("preview-0001");

    await advance(POLL_INTERVAL_MS);
    expect(store.getState().run?.stages.preview.status).toBe("succeeded");
  });

  it("scaffolds the prompt with character phrasing before it reaches Meshy", async () => {
    const { store, calls } = storeWith(happyTable());
    store.getState().setKey("msy_test_key");

    store.getState().start("  a basketball player  ");
    await drain();

    const previewBody = calls[0]?.body as { prompt: string };
    expect(previewBody.prompt).toBe(scaffoldPrompt("a basketball player"));
    // The run snapshot carries the scaffolded prompt too — the API panel
    // shows exactly what was sent, never a prettied-up version.
    expect(store.getState().run?.prompt).toBe(scaffoldPrompt("a basketball player"));
  });

  it("refuses to start without a key or with a blank prompt", () => {
    const { store, calls } = storeWith(happyTable());

    store.getState().start("a bronze knight"); // no key
    store.getState().setKey("msy_test_key");
    store.getState().start("   "); // blank prompt

    expect(store.getState().run).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("saves the run to storage on every emit, without ever touching the key", async () => {
    const { store, runStorage, advance } = storeWith(happyTable());
    store.getState().setKey("msy_secret_key");

    store.getState().start("a bronze knight");
    await drain();

    const afterStart = loadRun(runStorage);
    expect(afterStart?.stages.preview.taskId).toBe("preview-0001");

    await advance(POLL_INTERVAL_MS);
    const afterPoll = loadRun(runStorage);
    expect(afterPoll?.stages.preview.status).toBe("succeeded");
    expect(JSON.stringify(runStorage.dump())).not.toContain("msy_secret_key");
  });

  it("runs the full graph to succeeded and cleans up the interval", async () => {
    const { store, scheduler, advance } = storeWith(happyTable());
    store.getState().setKey("msy_test_key");

    store.getState().start("a bronze knight");
    await drain();
    // Generous upper bound of ticks; the machine no-ops after terminal. The
    // preview gate is approved as soon as it appears — this test is about the
    // graph, the gate has its own describe.
    for (let i = 0; i < 12; i += 1) {
      const status = store.getState().run?.status;
      if (status === "awaiting-review") {
        store.getState().approvePreview();
        await drain();
      } else if (status === "running") {
        await advance(POLL_INTERVAL_MS);
      } else {
        break;
      }
    }

    const run = store.getState().run;
    expect(run?.status).toBe("succeeded");
    expect(run?.creditsSpent).toBe(55);
    expect(store.getState().ticking).toBe(false);
    expect(scheduler.callback).toBeNull();
    expect(scheduler.cleared).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Preview gate
// ---------------------------------------------------------------------------

describe("preview gate", () => {
  /** Start a run and advance until the preview succeeds and the gate holds. */
  async function driveToGate(harness: ReturnType<typeof storeWith>): Promise<void> {
    harness.store.getState().setKey("msy_test_key");
    harness.store.getState().start("a basketball player");
    await drain();
    await harness.advance(POLL_INTERVAL_MS); // preview succeeds → gate
    if (harness.store.getState().run?.status !== "awaiting-review") {
      throw new Error("seed never reached the gate");
    }
  }

  it("stops the ticker at the gate — no polls while the visitor decides", async () => {
    const harness = storeWith(happyTable());
    await driveToGate(harness);

    expect(harness.store.getState().ticking).toBe(false);
    expect(harness.scheduler.callback).toBeNull();
    // Nothing beyond the preview create + poll ever left the store.
    expect(harness.calls).toHaveLength(2);
  });

  it("approvePreview resumes ticking and the run completes", async () => {
    const harness = storeWith(happyTable());
    await driveToGate(harness);

    harness.store.getState().approvePreview();
    await drain();

    expect(harness.store.getState().ticking).toBe(true);
    for (let i = 0; i < 12 && harness.store.getState().run?.status === "running"; i += 1) {
      await harness.advance(POLL_INTERVAL_MS);
    }
    expect(harness.store.getState().run?.status).toBe("succeeded");
    expect(harness.store.getState().run?.creditsSpent).toBe(55);
  });

  it("rerollPreview re-creates the preview and keeps the discarded spend counted", async () => {
    const harness = storeWith({
      ...happyTable(),
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { body: { result: "preview-0001" } },
        { body: { result: "preview-0002" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [
        { body: succeeded("preview-0001", 20) },
        { body: succeeded("preview-0002", 20) },
      ],
    });
    await driveToGate(harness);

    harness.store.getState().rerollPreview();
    await drain(); // immediate tick creates the second preview

    expect(harness.store.getState().run?.stages.preview.taskId).toBe("preview-0002");
    await harness.advance(POLL_INTERVAL_MS); // second preview succeeds → gate again

    const run = harness.store.getState().run;
    expect(run?.status).toBe("awaiting-review");
    expect(run?.creditsSpent).toBe(40); // both previews, honestly counted
    expect(loadRun(harness.runStorage)?.creditsSpent).toBe(40); // persisted too
  });

  it("hydrate restores an awaiting-review run without polling; approve resumes it", async () => {
    const seed = storeWith(happyTable());
    await driveToGate(seed);
    const stored = seed.store.getState().run!;

    const harness = storeWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [{ body: { result: "refine-0002" } }],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: succeeded("refine-0002", 10) }],
      [`POST ${REMESH_PATH}`]: [{ body: { result: "remesh-0003" } }],
    });
    saveRun(harness.runStorage, stored);
    harness.keyStorage.setItem(KEY_STORAGE_KEY, "msy_test_key");

    harness.store.getState().hydrate();
    await drain();

    expect(harness.store.getState().run?.status).toBe("awaiting-review");
    expect(harness.store.getState().ticking).toBe(false);
    expect(harness.calls).toHaveLength(0);

    harness.store.getState().approvePreview();
    await drain();
    expect(harness.store.getState().run?.stages.refine.taskId).toBe("refine-0002");
  });

  it("refuses to start a new run while one awaits review, and gate actions no-op keyless", async () => {
    const harness = storeWith(happyTable());
    await driveToGate(harness);
    const callCount = harness.calls.length;

    harness.store.getState().start("another character");
    expect(harness.calls).toHaveLength(callCount); // no new preview

    harness.store.getState().clearKey();
    harness.store.getState().approvePreview();
    harness.store.getState().rerollPreview();
    await drain();
    expect(harness.store.getState().run?.status).toBe("awaiting-review");
    expect(harness.calls).toHaveLength(callCount);
  });
});

// ---------------------------------------------------------------------------
// 401 → key rejected
// ---------------------------------------------------------------------------

describe("proxy 401", () => {
  it("stops the ticker and surfaces key-rejected copy; a new key resumes", async () => {
    const { store, scheduler, advance } = storeWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { error: new MeshyApiError(401, null, "invalid api key") },
        { body: { result: "preview-0001" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: task("preview-0001", "IN_PROGRESS", { progress: 10 }) }],
    });
    store.getState().setKey("msy_bad_key");

    store.getState().start("a bronze knight");
    await drain();

    expect(store.getState().keyError).toBe(KEY_REJECTED_COPY);
    expect(store.getState().ticking).toBe(false);
    expect(scheduler.callback).toBeNull();

    // Fixing the key clears the error and picks polling back up.
    store.getState().setKey("msy_good_key");
    await drain();
    expect(store.getState().keyError).toBeNull();
    expect(store.getState().ticking).toBe(true);
    expect(store.getState().run?.stages.preview.taskId).toBe("preview-0001");
    await advance(POLL_INTERVAL_MS);
    expect(store.getState().run?.stages.preview.progress).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

describe("resume from storage", () => {
  /** Drive a real machine to mid-refine, exactly as storage would hold it. */
  async function makeMidFlight(): Promise<PipelineRun> {
    const seed = storeWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { body: { result: "preview-0001" } },
        { body: { result: "refine-0002" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: succeeded("preview-0001", 20) }],
    });
    seed.store.getState().setKey("msy_test_key");
    seed.store.getState().start("a bronze knight");
    await drain();
    await seed.advance(POLL_INTERVAL_MS); // preview succeeds → gate
    seed.store.getState().approvePreview(); // wave it through
    await drain(); // immediate tick creates refine
    const run = seed.store.getState().run;
    if (run?.stages.refine.taskId !== "refine-0002") throw new Error("seed did not reach mid-refine");
    return run;
  }

  it("hydrate resumes a non-terminal run: task ids, timestamps, and polling continue", async () => {
    const stored = await makeMidFlight();

    const { store, runStorage, keyStorage, scheduler, calls, advance, setNow } = storeWith({
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: succeeded("refine-0002", 10) }],
      [`POST ${REMESH_PATH}`]: [{ body: { result: "remesh-0003" } }],
    });
    saveRun(runStorage, stored);
    keyStorage.setItem(KEY_STORAGE_KEY, "msy_test_key");
    setNow(10 * POLL_INTERVAL_MS); // "remount" long after the stored timestamps

    store.getState().hydrate();
    await drain();

    const run = store.getState().run;
    expect(run?.status).toBe("running");
    // Machine timestamps survive the remount — elapsed stays truthful.
    expect(run?.startedAt).toBe(stored.startedAt);
    expect(run?.stages.preview.taskId).toBe("preview-0001");
    expect(run?.stages.refine.taskId).toBe("refine-0002");
    expect(scheduler.intervalMs).toBe(POLL_INTERVAL_MS);

    // Polling continues against the stored refine task id — no re-create.
    await advance(POLL_INTERVAL_MS);
    expect(calls.some((c) => c.key === `GET ${TEXT_TO_3D_PATH}/:id`)).toBe(true);
    expect(calls.every((c) => c.key !== `POST ${TEXT_TO_3D_PATH}`)).toBe(true);
    expect(store.getState().run?.stages.refine.status).toBe("succeeded");
  });

  it("hydrate without a key never polls — a new tab must not manufacture 'Key rejected'", async () => {
    // Key lives in sessionStorage, the run in localStorage: closing the tab
    // mid-run and reopening lands exactly here.
    const stored = await makeMidFlight();

    const { store, runStorage, calls, advance } = storeWith({});
    saveRun(runStorage, stored);
    // keyStorage deliberately empty.

    store.getState().hydrate();
    await drain();

    expect(store.getState().run?.status).toBe("running"); // run restored, just paused
    expect(store.getState().ticking).toBe(false);
    expect(store.getState().keyError).toBeNull();
    await advance(POLL_INTERVAL_MS);
    expect(calls).toHaveLength(0); // no keyless poll ever leaves the store
  });

  it("pasting the key after a keyless hydrate resumes polling", async () => {
    const stored = await makeMidFlight();

    const { store, runStorage, scheduler, advance, calls, setNow } = storeWith({
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: succeeded("refine-0002", 10) }],
      [`POST ${REMESH_PATH}`]: [{ body: { result: "remesh-0003" } }],
    });
    saveRun(runStorage, stored);
    setNow(10 * POLL_INTERVAL_MS); // past the stored run's nextPollAt

    store.getState().hydrate();
    await drain();
    store.getState().setKey("msy_test_key");
    await drain();

    expect(store.getState().ticking).toBe(true);
    expect(scheduler.intervalMs).toBe(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(calls.some((c) => c.key === `GET ${TEXT_TO_3D_PATH}/:id`)).toBe(true);
    expect(store.getState().keyError).toBeNull();
  });

  it("hydrate shows a terminal run without starting a ticker", async () => {
    const stored = await makeMidFlight();
    stored.status = "failed";
    stored.completedAt = 3 * POLL_INTERVAL_MS;

    const { store, runStorage, scheduler } = storeWith({});
    saveRun(runStorage, stored);

    store.getState().hydrate();

    expect(store.getState().run?.status).toBe("failed");
    expect(store.getState().ticking).toBe(false);
    expect(scheduler.callback).toBeNull();
  });

  it("hydrate is idempotent across strict-mode remounts", async () => {
    const stored = await makeMidFlight();
    const { store, runStorage, keyStorage, scheduler } = storeWith({
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: task("refine-0002", "IN_PROGRESS", { progress: 55 }) }],
    });
    saveRun(runStorage, stored);
    keyStorage.setItem(KEY_STORAGE_KEY, "msy_test_key");

    store.getState().hydrate();
    await drain();
    store.getState().stopTicker(); // strict-mode cleanup
    expect(store.getState().ticking).toBe(false);

    store.getState().hydrate(); // second mount
    await drain();
    expect(store.getState().ticking).toBe(true);
    expect(scheduler.intervalMs).toBe(POLL_INTERVAL_MS);
  });
});

// ---------------------------------------------------------------------------
// Retry (US-06)
// ---------------------------------------------------------------------------

describe("retry", () => {
  /** Table that fails at rig; retry fixtures re-create rig and finish the run. */
  function rigFailsThenRecovers(): FixtureTable {
    return {
      ...happyTable(),
      [`POST ${RIGGING_PATH}`]: [
        { body: { result: "rigging-0003" } },
        { body: { result: "rigging-0004" } },
      ],
      [`GET ${RIGGING_PATH}/:id`]: [
        { body: task("rigging-0003", "FAILED", { consumed_credits: 0, task_error: { message: "422 Pose estimation failed" } }) },
        { body: rigSucceeded("rigging-0004", 5) },
      ],
    };
  }

  async function driveToFailedRig(harness: ReturnType<typeof storeWith>): Promise<void> {
    harness.store.getState().setKey("msy_test_key");
    harness.store.getState().start("an amorphous blob");
    await drain();
    for (let i = 0; i < 10; i += 1) {
      const status = harness.store.getState().run?.status;
      if (status === "awaiting-review") {
        harness.store.getState().approvePreview();
        await drain();
      } else if (status === "running") {
        await harness.advance(POLL_INTERVAL_MS);
      } else {
        break;
      }
    }
    if (harness.store.getState().run?.status !== "failed") throw new Error("seed did not fail at rig");
  }

  it("revives the failed run, re-creates only the failed stage, and finishes", async () => {
    const harness = storeWith(rigFailsThenRecovers());
    await driveToFailedRig(harness);
    const { store, calls, advance } = harness;
    expect(store.getState().ticking).toBe(false);
    const upstreamCreates = calls.filter(
      (c) => c.key === `POST ${TEXT_TO_3D_PATH}` || c.key === `POST ${REMESH_PATH}`,
    ).length;

    store.getState().retry();
    // The revived snapshot lands synchronously — the rail flips before any poll.
    expect(store.getState().run?.status).toBe("running");
    expect(store.getState().run?.stages.rig.status).toBe("pending");
    expect(store.getState().ticking).toBe(true);
    await drain(); // immediate first tick re-creates the rig task

    const rigCreates = calls.filter((c) => c.key === `POST ${RIGGING_PATH}`);
    expect(rigCreates).toHaveLength(2);
    expect(JSON.stringify(rigCreates[1]!.body)).toContain('"input_task_id":"remesh-0003"');
    // No upstream stage was re-created — retry re-spends only the rig.
    expect(
      calls.filter((c) => c.key === `POST ${TEXT_TO_3D_PATH}` || c.key === `POST ${REMESH_PATH}`),
    ).toHaveLength(upstreamCreates);

    for (let i = 0; i < 6 && store.getState().run?.status === "running"; i += 1) {
      await advance(POLL_INTERVAL_MS);
    }
    expect(store.getState().run?.status).toBe("succeeded");
    expect(store.getState().run?.creditsSpent).toBe(55);
  });

  it("persists the revived run so a refresh resumes the retry, not the failure", async () => {
    const harness = storeWith(rigFailsThenRecovers());
    await driveToFailedRig(harness);

    harness.store.getState().retry();
    await drain();

    expect(loadRun(harness.runStorage)?.status).toBe("running");
  });

  it("no-ops without a failed run or without a key", async () => {
    const noRun = storeWith({});
    noRun.store.getState().setKey("msy_test_key");
    noRun.store.getState().retry();
    expect(noRun.store.getState().run).toBeNull();
    expect(noRun.calls).toHaveLength(0);

    const keyless = storeWith(rigFailsThenRecovers());
    await driveToFailedRig(keyless);
    keyless.store.getState().clearKey();
    const callCount = keyless.calls.length;
    keyless.store.getState().retry();
    await drain();
    expect(keyless.store.getState().run?.status).toBe("failed");
    expect(keyless.calls).toHaveLength(callCount);
  });
});

// ---------------------------------------------------------------------------
// Terminal + start over + unmount
// ---------------------------------------------------------------------------

describe("start over and cleanup", () => {
  it("startOver clears storage and resets the run", async () => {
    const { store, runStorage, advance } = storeWith(happyTable());
    store.getState().setKey("msy_test_key");
    store.getState().start("a bronze knight");
    await drain();
    await advance(POLL_INTERVAL_MS);

    store.getState().startOver();

    expect(store.getState().run).toBeNull();
    expect(store.getState().ticking).toBe(false);
    expect(runStorage.getItem(STORAGE_KEY)).toBeNull();
    // The key survives start-over — it belongs to the session, not the run.
    expect(store.getState().apiKey).toBe("msy_test_key");
  });

  it("stopTicker (unmount) clears the interval without losing the run", async () => {
    const { store, scheduler } = storeWith(happyTable());
    store.getState().setKey("msy_test_key");
    store.getState().start("a bronze knight");
    await drain();

    store.getState().stopTicker();

    expect(scheduler.callback).toBeNull();
    expect(store.getState().ticking).toBe(false);
    expect(store.getState().run?.status).toBe("running");
  });
});
