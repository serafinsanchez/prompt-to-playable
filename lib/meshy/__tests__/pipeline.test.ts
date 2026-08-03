import { describe, expect, it } from "vitest";

import { ANIMATIONS_PATH, createMeshyClient, RIGGING_PATH, TEXT_TO_3D_PATH } from "../client";
import {
  createEmptyRun,
  createPipeline,
  POLL_INTERVAL_MS,
  RATE_LIMIT_BASE_BACKOFF_MS,
} from "../pipeline";
import { loadRun, saveRun } from "../storage";
import type { StorageAdapter } from "../storage";
import {
  NoMoreConcurrentTasksError,
  RateLimitExceededError,
  type PipelineRun,
} from "../types";
import {
  animationSucceeded,
  failed,
  makeFixtureTransport,
  rigSucceeded,
  succeeded,
  task,
  type FixtureTable,
} from "./fixtures";

function testClock(): { clock: { now(): number }; set(t: number): void } {
  let t = 0;
  return { clock: { now: () => t }, set: (next) => (t = next) };
}

function pipelineWith(table: FixtureTable) {
  const { transport, calls } = makeFixtureTransport(table);
  const client = createMeshyClient(transport);
  const { clock, set } = testClock();
  const pipeline = createPipeline({ client, clock });
  return { pipeline, calls, set, client, clock };
}

function memoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const ANIMATION_IDS = [
  "animate-0004",
  "animate-0005",
  "animate-0006",
  "animate-0007",
  "animate-0008",
];

/** POST/GET fixture entries for the five animate stages, in clip order. */
const ANIMATION_FIXTURES: FixtureTable = {
  [`POST ${ANIMATIONS_PATH}`]: ANIMATION_IDS.map((id) => ({ body: { result: id } })),
  [`GET ${ANIMATIONS_PATH}/:id`]: ANIMATION_IDS.map((id) => ({ body: animationSucceeded(id, 3) })),
};

describe("createEmptyRun", () => {
  it("starts idle with all eight stages pending and nothing spent", () => {
    const run = createEmptyRun("a brave knight");

    expect(run.prompt).toBe("a brave knight");
    expect(run.status).toBe("idle");
    expect(Object.keys(run.stages)).toHaveLength(8);
    expect(Object.values(run.stages).every((s) => s.status === "pending")).toBe(true);
    expect(run.creditsSpent).toBe(0);
  });
});

describe("pipeline happy path", () => {
  it("runs preview → refine → rig → animate ×5 to success with credits and timings", async () => {
    const { pipeline, calls, set } = pipelineWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { body: { result: "preview-0001" } },
        { body: { result: "refine-0002" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [
        { body: task("preview-0001", "IN_PROGRESS", { progress: 40 }) },
        { body: succeeded("preview-0001", 20) },
        { body: succeeded("refine-0002", 10) },
      ],
      [`POST ${RIGGING_PATH}`]: [{ body: { result: "rigging-0003" } }],
      [`GET ${RIGGING_PATH}/:id`]: [{ body: rigSucceeded("rigging-0003", 5) }],
      ...ANIMATION_FIXTURES,
    });

    const snapshots: PipelineRun[] = [];
    pipeline.subscribe((run) => snapshots.push(run));

    pipeline.start("a brave knight");

    // First tick creates the preview task.
    await pipeline.tick();
    let run = pipeline.getRun();
    expect(run.stages.preview.status).toBe("running");
    expect(run.stages.preview.taskId).toBe("preview-0001");
    expect(JSON.parse(JSON.stringify(calls[0]!.body))).toEqual({
      mode: "preview",
      prompt: "a brave knight",
    });

    // A tick before nextPollAt is a no-op — no extra network calls.
    const callCount = calls.length;
    await pipeline.tick();
    expect(calls.length).toBe(callCount);

    // Poll: still in progress, progress mirrored.
    set(POLL_INTERVAL_MS);
    await pipeline.tick();
    expect(pipeline.getRun().stages.preview.progress).toBe(40);

    // Preview succeeds → refine created the same tick, chained by preview_task_id.
    set(2 * POLL_INTERVAL_MS);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.stages.preview.status).toBe("succeeded");
    expect(run.stages.refine.taskId).toBe("refine-0002");
    expect(
      calls.some((c) => JSON.stringify(c.body ?? null).includes('"preview_task_id":"preview-0001"')),
    ).toBe(true);

    // Refine succeeds → rig created, chained by input_task_id.
    set(3 * POLL_INTERVAL_MS);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.stages.refine.status).toBe("succeeded");
    expect(run.stages.rig.taskId).toBe("rigging-0003");

    // Rig succeeds → all five animation tasks created, chained to the rig task.
    set(4 * POLL_INTERVAL_MS);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.stages.rig.status).toBe("succeeded");
    for (const [index, id] of ANIMATION_IDS.entries()) {
      const stage = Object.values(run.stages).filter((s) => s.stage.startsWith("animate:"))[index]!;
      expect(stage.taskId).toBe(id);
      expect(stage.status).toBe("running");
    }
    const animationCreates = calls.filter((c) => c.key === `POST ${ANIMATIONS_PATH}`);
    expect(animationCreates).toHaveLength(5);
    for (const create of animationCreates) {
      expect(JSON.stringify(create.body)).toContain('"rig_task_id":"rigging-0003"');
    }

    // All five clips succeed → run complete, 50 credits total.
    set(5 * POLL_INTERVAL_MS);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.status).toBe("succeeded");
    expect(run.creditsSpent).toBe(50);
    expect(run.completedAt).toBe(5 * POLL_INTERVAL_MS);
    for (const stage of Object.values(run.stages)) {
      expect(stage.status).toBe("succeeded");
      expect(stage.modelUrl).toMatch(/^https:\/\/assets\.meshy\.test\//);
      expect(stage.creditCost).not.toBeNull();
      expect(stage.startedAt).not.toBeNull();
      expect(stage.completedAt).not.toBeNull();
    }
    expect(run.stages.preview.creditCost).toBe(20);
    expect(run.stages.refine.creditCost).toBe(10);
    expect(run.stages.rig.creditCost).toBe(5);

    // Snapshots were emitted and are copies, not live references.
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[snapshots.length - 1]!.status).toBe("succeeded");
    snapshots[snapshots.length - 1]!.status = "failed";
    expect(pipeline.getRun().status).toBe("succeeded");
  });
});

describe("stage failure", () => {
  it("halts the run, surfaces task_error verbatim, and preserves upstream results", async () => {
    const { pipeline, calls, set } = pipelineWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { body: { result: "preview-0001" } },
        { body: { result: "refine-0002" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [
        { body: succeeded("preview-0001", 20) },
        { body: failed("refine-0002", "texture generation failed") },
      ],
    });

    pipeline.start("a brave knight");
    await pipeline.tick(); // create preview
    set(POLL_INTERVAL_MS);
    await pipeline.tick(); // preview succeeds, refine created
    set(2 * POLL_INTERVAL_MS);
    await pipeline.tick(); // refine fails

    const run = pipeline.getRun();
    expect(run.status).toBe("failed");
    expect(run.stages.refine.status).toBe("failed");
    expect(run.stages.refine.error).toBe("texture generation failed");
    // Auto-refund: the failed stage cost nothing; only preview's credits count.
    expect(run.stages.refine.creditCost).toBe(0);
    expect(run.creditsSpent).toBe(20);
    // Upstream results stay reusable for a retry.
    expect(run.stages.preview.status).toBe("succeeded");
    expect(run.stages.preview.taskId).toBe("preview-0001");
    expect(run.stages.preview.modelUrl).not.toBeNull();
    // Downstream never started.
    expect(run.stages.rig.status).toBe("pending");

    // A halted run makes no further network calls.
    const callCount = calls.length;
    set(3 * POLL_INTERVAL_MS);
    await pipeline.tick();
    expect(calls.length).toBe(callCount);
  });
});

describe("RateLimitExceeded", () => {
  it("backs off exponentially and recovers when the API stops throttling", async () => {
    const { pipeline, calls, set } = pipelineWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { body: { result: "preview-0001" } },
        { body: { result: "refine-0002" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [
        { error: new RateLimitExceededError("slow down") },
        { error: new RateLimitExceededError("slow down") },
        { body: succeeded("preview-0001", 20) },
      ],
    });

    pipeline.start("a brave knight");
    await pipeline.tick(); // create preview

    // First throttled poll → base back-off.
    set(POLL_INTERVAL_MS);
    await pipeline.tick();
    let run = pipeline.getRun();
    expect(run.status).toBe("running");
    expect(run.rateLimitBackoffMs).toBe(RATE_LIMIT_BASE_BACKOFF_MS);
    expect(run.nextPollAt).toBe(POLL_INTERVAL_MS + RATE_LIMIT_BASE_BACKOFF_MS);

    // A tick inside the back-off window stays quiet.
    const callCount = calls.length;
    set(POLL_INTERVAL_MS + RATE_LIMIT_BASE_BACKOFF_MS - 1);
    await pipeline.tick();
    expect(calls.length).toBe(callCount);

    // Second throttle → back-off doubles.
    set(POLL_INTERVAL_MS + RATE_LIMIT_BASE_BACKOFF_MS);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.rateLimitBackoffMs).toBe(2 * RATE_LIMIT_BASE_BACKOFF_MS);

    // API recovers → poll succeeds, back-off resets, pipeline advances.
    set(run.nextPollAt!);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.stages.preview.status).toBe("succeeded");
    expect(run.rateLimitBackoffMs).toBeNull();
  });
});

describe("NoMoreConcurrentTasks", () => {
  it("keeps polling at normal cadence with waitingForQueue set until a slot frees", async () => {
    const { pipeline, set } = pipelineWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { error: new NoMoreConcurrentTasksError("queue full") },
        { body: { result: "preview-0001" } },
      ],
    });

    pipeline.start("a brave knight");

    // Queue is full: no task created, but the run keeps waiting — not failed.
    await pipeline.tick();
    let run = pipeline.getRun();
    expect(run.status).toBe("running");
    expect(run.waitingForQueue).toBe(true);
    expect(run.stages.preview.taskId).toBeNull();
    // Normal cadence, not back-off: this is a different 429 flavor.
    expect(run.nextPollAt).toBe(POLL_INTERVAL_MS);
    expect(run.rateLimitBackoffMs).toBeNull();

    // A slot frees → create succeeds, flag clears.
    set(POLL_INTERVAL_MS);
    await pipeline.tick();
    run = pipeline.getRun();
    expect(run.waitingForQueue).toBe(false);
    expect(run.stages.preview.taskId).toBe("preview-0001");
    expect(run.stages.preview.status).toBe("running");
  });
});

describe("resume from storage", () => {
  it("restores a mid-pipeline run and completes it without re-running earlier stages", async () => {
    const storage = memoryStorage();

    // Session 1: run up to the rig task being created, then persist.
    const first = pipelineWith({
      [`POST ${TEXT_TO_3D_PATH}`]: [
        { body: { result: "preview-0001" } },
        { body: { result: "refine-0002" } },
      ],
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [
        { body: succeeded("preview-0001", 20) },
        { body: succeeded("refine-0002", 10) },
      ],
      [`POST ${RIGGING_PATH}`]: [{ body: { result: "rigging-0003" } }],
    });
    first.pipeline.start("a brave knight");
    await first.pipeline.tick(); // create preview
    first.set(POLL_INTERVAL_MS);
    await first.pipeline.tick(); // preview succeeds, refine created
    first.set(2 * POLL_INTERVAL_MS);
    await first.pipeline.tick(); // refine succeeds, rig created
    saveRun(storage, first.pipeline.getRun());

    // Session 2 (fresh transport — the fixture table has NO text-to-3d entries,
    // so any attempt to re-run earlier stages would throw "no fixture").
    const restored = loadRun(storage);
    expect(restored).not.toBeNull();
    expect(restored!.stages.rig.status).toBe("running");

    const { transport } = makeFixtureTransport({
      [`GET ${RIGGING_PATH}/:id`]: [{ body: rigSucceeded("rigging-0003", 5) }],
      ...ANIMATION_FIXTURES,
    });
    let t = 3 * POLL_INTERVAL_MS;
    const pipeline = createPipeline({
      client: createMeshyClient(transport),
      clock: { now: () => t },
      run: restored!,
    });

    await pipeline.tick(); // rig succeeds, animations created
    t = 4 * POLL_INTERVAL_MS;
    await pipeline.tick(); // all clips succeed

    const run = pipeline.getRun();
    expect(run.status).toBe("succeeded");
    expect(run.creditsSpent).toBe(50);
    expect(run.stages.preview.taskId).toBe("preview-0001");
    expect(run.prompt).toBe("a brave knight");
  });
});
