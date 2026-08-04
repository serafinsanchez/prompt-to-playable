import { describe, expect, it } from "vitest";

import {
  ANIMATIONS_PATH,
  createMeshyClient,
  REMESH_PATH,
  RIGGING_PATH,
  TEXT_TO_3D_PATH,
} from "../../../lib/meshy/client";
import { createEmptyRun } from "../../../lib/meshy/pipeline";
import {
  animationSucceeded,
  failed,
  makeFixtureTransport,
  rigSucceeded,
  succeeded,
  task,
  type FixtureTable,
} from "../../../lib/meshy/__tests__/fixtures";
import { ANIMATION_CLIPS, type PipelineRun } from "../../../lib/meshy/types";
import { generateCharacter, type RunnerDeps } from "../runner";

const SPEC = { slug: "knight", prompt: "a brave knight" };

const ANIMATION_IDS = ["animate-0004", "animate-0005", "animate-0006", "animate-0007", "animate-0008"];

/** Fixture table for the whole six-stage graph succeeding first-poll. */
function happyTable(): FixtureTable {
  return {
    [`POST ${TEXT_TO_3D_PATH}`]: [
      { body: { result: "preview-0001" } },
      { body: { result: "refine-0002" } },
    ],
    [`GET ${TEXT_TO_3D_PATH}/:id`]: [
      { body: task("preview-0001", "IN_PROGRESS", { progress: 40 }) },
      { body: succeeded("preview-0001", 20) },
      { body: succeeded("refine-0002", 10) },
    ],
    [`POST ${REMESH_PATH}`]: [{ body: { result: "remesh-0003" } }],
    [`GET ${REMESH_PATH}/:id`]: [{ body: succeeded("remesh-0003", 5) }],
    [`POST ${RIGGING_PATH}`]: [{ body: { result: "rigging-0009" } }],
    [`GET ${RIGGING_PATH}/:id`]: [{ body: rigSucceeded("rigging-0009", 5) }],
    [`POST ${ANIMATIONS_PATH}`]: ANIMATION_IDS.map((id) => ({ body: { result: id } })),
    [`GET ${ANIMATIONS_PATH}/:id`]: ANIMATION_IDS.map((id) => ({ body: animationSucceeded(id, 3) })),
  };
}

/** Deps wired to the fixture transport: fake clock, fake downloads, in-memory state. */
function testDeps(table: FixtureTable, stored: PipelineRun | null = null) {
  const { transport, calls } = makeFixtureTransport(table);
  let t = 0;
  const saved: PipelineRun[] = [];
  const fetched: string[] = [];
  const deps: RunnerDeps = {
    client: createMeshyClient(transport),
    clock: { now: () => t },
    sleep: (ms) => {
      t += ms;
      return Promise.resolve();
    },
    fetchGlb: (url) => {
      fetched.push(url);
      return Promise.resolve(new TextEncoder().encode(url));
    },
    loadRun: () => stored,
    saveRun: (_slug, run) => {
      saved.push(run);
    },
    log: () => undefined,
  };
  return { deps, calls, saved, fetched };
}

describe("generateCharacter happy path", () => {
  it("drives the state machine to success and downloads rig + 5 clips immediately", async () => {
    const { deps, saved, fetched } = testDeps(happyTable());

    const result = await generateCharacter(SPEC, deps);

    expect(result.run.status).toBe("succeeded");
    expect(result.run.creditsSpent).toBe(55);
    // Rig + every clip downloaded exactly once, from the task URLs.
    expect(fetched).toHaveLength(6);
    expect(new Set(fetched).size).toBe(6);
    expect(new TextDecoder().decode(result.rig)).toContain("rigging-0009");
    for (const clip of ANIMATION_CLIPS) {
      expect(result.clips[clip].byteLength).toBeGreaterThan(0);
    }
    // Resumability: the snapshot was persisted after every tick, ending terminal.
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[saved.length - 1].status).toBe("succeeded");
    expect(saved[saved.length - 1].stages.preview.taskId).toBe("preview-0001");
  });
});

describe("generateCharacter resume", () => {
  it("resumes a stored run without re-creating paid tasks", async () => {
    // Stored state: linear head already succeeded (paid for), animates pending.
    const stored = createEmptyRun(SPEC.prompt);
    stored.status = "running";
    stored.startedAt = 0;
    const paid = [
      ["preview", "preview-0001", 20],
      ["refine", "refine-0002", 10],
      ["remesh", "remesh-0003", 5],
      ["rig", "rigging-0009", 5],
    ] as const;
    for (const [stage, taskId, credits] of paid) {
      Object.assign(stored.stages[stage], {
        status: "succeeded",
        taskId,
        progress: 100,
        creditCost: credits,
        modelUrl: `https://assets.meshy.test/${taskId}.glb`,
        startedAt: 0,
        completedAt: 1,
      });
    }

    // Only animation fixtures exist — any create/poll of earlier stages
    // would throw "no fixture" and fail the test.
    const { deps, calls, fetched } = testDeps(
      {
        [`POST ${ANIMATIONS_PATH}`]: ANIMATION_IDS.map((id) => ({ body: { result: id } })),
        [`GET ${ANIMATIONS_PATH}/:id`]: ANIMATION_IDS.map((id) => ({
          body: animationSucceeded(id, 3),
        })),
      },
      stored,
    );

    const result = await generateCharacter(SPEC, deps);

    expect(result.run.status).toBe("succeeded");
    expect(calls.every((call) => call.key.includes(ANIMATIONS_PATH))).toBe(true);
    // The rig GLB is re-fetched from the stored URL (still within its 3 days).
    expect(fetched).toContain("https://assets.meshy.test/rigging-0009.glb");
  });

  it("ignores a stored run whose prompt no longer matches the curated list", async () => {
    const stored = createEmptyRun("an older prompt");
    stored.status = "running";

    const { deps, calls } = testDeps(happyTable(), stored);
    const result = await generateCharacter(SPEC, deps);

    expect(result.run.prompt).toBe(SPEC.prompt);
    expect(result.run.status).toBe("succeeded");
    expect(calls[0].key).toBe(`POST ${TEXT_TO_3D_PATH}`); // started fresh
  });
});

describe("generateCharacter failure", () => {
  it("halts on a FAILED stage, surfaces task_error verbatim, and persists state for retry", async () => {
    const table = happyTable();
    table[`GET ${RIGGING_PATH}/:id`] = [{ body: failed("rigging-0009", "Pose estimation failed") }];

    const { deps, saved } = testDeps(table);

    await expect(generateCharacter(SPEC, deps)).rejects.toThrow(/Pose estimation failed/);

    const last = saved[saved.length - 1];
    expect(last.status).toBe("failed");
    expect(last.stages.rig.status).toBe("failed");
    expect(last.stages.rig.creditCost).toBe(0); // failed tasks auto-refund
    expect(last.stages.remesh.taskId).toBe("remesh-0003"); // upstream kept for resume
  });

  it("retries only the failed stage when resuming a failed run", async () => {
    // First attempt: rig fails.
    const failingTable = happyTable();
    failingTable[`GET ${RIGGING_PATH}/:id`] = [
      { body: failed("rigging-0009", "Pose estimation failed") },
    ];
    const first = testDeps(failingTable);
    await expect(generateCharacter(SPEC, first.deps)).rejects.toThrow();
    const failedRun = first.saved[first.saved.length - 1];

    // Second attempt resumes: only rig + animates should touch the network.
    const retry = testDeps(
      {
        [`POST ${RIGGING_PATH}`]: [{ body: { result: "rigging-0010" } }],
        [`GET ${RIGGING_PATH}/:id`]: [{ body: rigSucceeded("rigging-0010", 5) }],
        [`POST ${ANIMATIONS_PATH}`]: ANIMATION_IDS.map((id) => ({ body: { result: id } })),
        [`GET ${ANIMATIONS_PATH}/:id`]: ANIMATION_IDS.map((id) => ({
          body: animationSucceeded(id, 3),
        })),
      },
      failedRun,
    );

    const result = await generateCharacter(SPEC, retry.deps);
    expect(result.run.status).toBe("succeeded");
    expect(result.run.stages.rig.taskId).toBe("rigging-0010");
    expect(result.run.stages.preview.taskId).toBe("preview-0001"); // untouched
    expect(
      retry.calls.every(
        (call) => call.key.includes(RIGGING_PATH) || call.key.includes(ANIMATIONS_PATH),
      ),
    ).toBe(true);
  });
});
