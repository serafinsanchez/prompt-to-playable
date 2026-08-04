/**
 * US-04 descriptor map. Two contracts:
 *
 * 1. SYNC — the panel must show what the client actually sends. The test
 *    drives the real createMeshyClient through a capturing transport and
 *    compares every captured (path, body) against stageRequest() for the
 *    same run. If client.ts changes shape, this fails before the panel lies.
 * 2. REDACTION — no key value can reach panel output. stageRequest/stageCurl
 *    take only the run snapshot; this proves their output never carries a
 *    key even when one is in scope.
 */

import { describe, expect, it } from "vitest";

import { createMeshyClient, REMESH_PATH, RIGGING_PATH, ANIMATIONS_PATH, TEXT_TO_3D_PATH } from "../../lib/meshy/client";
import { makeFixtureTransport } from "../../lib/meshy/__tests__/fixtures";
import { createPipelineStore, KEY_STORAGE_KEY, type TickScheduler } from "../../components/pipeline/store";
import type { StorageAdapter } from "../../lib/meshy/storage";
import type { MeshyTransport } from "../../lib/meshy/transport";
import {
  ANIMATION_CLIPS,
  PIPELINE_STAGES,
  REMESH_TARGET_POLYCOUNT,
  STAGE_CREDITS,
  type PipelineRun,
  type StageId,
} from "../../lib/meshy/types";
import { createEmptyRun } from "../../lib/meshy/pipeline";
import {
  creditCopy,
  MASKED_KEY_HEADER,
  stageCurl,
  stageRequest,
} from "../../components/pipeline/api-descriptor";

function memoryStorage(): StorageAdapter & { getItem(key: string): string | null } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const inertScheduler: TickScheduler = {
  setInterval: () => null,
  clearInterval: () => undefined,
};

/** A run with every upstream task id populated, as after a full chain. */
function chainedRun(): PipelineRun {
  const run = createEmptyRun("a bronze knight with a tower shield");
  run.stages.preview.taskId = "preview-0001";
  run.stages.refine.taskId = "refine-0002";
  run.stages.remesh.taskId = "remesh-0003";
  run.stages.rig.taskId = "rigging-0004";
  return run;
}

describe("stageRequest ↔ client sync", () => {
  it("matches the exact path and body the real client sends, for all nine stages", async () => {
    const captured: Array<{ path: string; body: unknown }> = [];
    const transport: MeshyTransport = async (path, init) => {
      captured.push({ path, body: init?.body });
      return { result: "task-created" };
    };
    const client = createMeshyClient(transport);
    const run = chainedRun();

    await client.createPreviewTask(run.prompt);
    await client.createRefineTask("preview-0001");
    await client.createRemeshTask("refine-0002", REMESH_TARGET_POLYCOUNT);
    await client.createRigTask("remesh-0003");
    for (const clip of ANIMATION_CLIPS) await client.createAnimationTask("rigging-0004", clip);

    const stages: StageId[] = [...PIPELINE_STAGES];
    expect(captured).toHaveLength(stages.length);
    stages.forEach((stage, i) => {
      const descriptor = stageRequest(run, stage);
      expect(descriptor.method).toBe("POST");
      expect(descriptor.path).toBe(captured[i]!.path);
      expect(descriptor.body).toEqual(captured[i]!.body);
    });
  });

  it("marks the v2/v1 split off the real path constants", () => {
    const run = chainedRun();
    expect(stageRequest(run, "preview").version).toBe("v2");
    expect(stageRequest(run, "refine").version).toBe("v2");
    for (const stage of ["remesh", "rig", "animate:idle"] as StageId[]) {
      expect(stageRequest(run, stage).version).toBe("v1");
    }
    expect(TEXT_TO_3D_PATH).toContain("/v2/");
    for (const path of [REMESH_PATH, RIGGING_PATH, ANIMATIONS_PATH]) {
      expect(path).toContain("/v1/");
    }
  });

  it("uses honest placeholders while upstream ids are unknown", () => {
    const run = createEmptyRun("a knight");
    expect(stageRequest(run, "refine").body.preview_task_id).toBe("<preview-task-id>");
    expect(stageRequest(run, "rig").body.input_task_id).toBe("<remesh-task-id>");
    expect(stageRequest(run, "animate:walk").body.rig_task_id).toBe("<rig-task-id>");
  });
});

describe("stageCurl", () => {
  it("produces a runnable curl against the real Meshy host with an env-var key", () => {
    const curl = stageCurl(stageRequest(chainedRun(), "refine"));
    expect(curl).toContain("curl -X POST https://api.meshy.ai/openapi/v2/text-to-3d");
    expect(curl).toContain('-H "Authorization: Bearer $MESHY_API_KEY"');
    expect(curl).toContain('"preview_task_id": "preview-0001"');
  });

  it("each animate stage carries its own integer action_id", () => {
    const run = chainedRun();
    const seen = new Set<unknown>();
    for (const clip of ANIMATION_CLIPS) {
      const body = stageRequest(run, `animate:${clip}`).body;
      expect(typeof body.action_id).toBe("number");
      seen.add(body.action_id);
    }
    expect(seen.size).toBe(ANIMATION_CLIPS.length);
  });
});

describe("key redaction", () => {
  it("a key living in the store and sessionStorage never reaches any panel string", async () => {
    // The real threat model: the key exists in store state + key storage while
    // the panel derives its strings. Run a live store carrying the key, then
    // derive every panel string from its run snapshot. A future refactor that
    // threads store state into the descriptors fails here.
    const secret = "msy_TEST_SECRET_value_1234567890";
    const { transport } = makeFixtureTransport({
      [`POST ${TEXT_TO_3D_PATH}`]: [{ body: { result: "preview-0001" } }],
    });
    const keyStorage = memoryStorage();
    const store = createPipelineStore({
      client: createMeshyClient(transport),
      clock: { now: () => 0 },
      runStorage: memoryStorage(),
      keyStorage,
      scheduler: inertScheduler,
    });
    store.getState().setKey(secret);
    store.getState().start("a bronze knight with a tower shield");

    expect(keyStorage.getItem(KEY_STORAGE_KEY)).toBe(secret); // key IS in scope
    const run = store.getState().run;
    expect(run).not.toBeNull();

    for (const stage of PIPELINE_STAGES) {
      const request = stageRequest(run!, stage);
      const rendered = [
        request.path,
        JSON.stringify(request.body),
        stageCurl(request),
        creditCopy(run!.stages[stage], stage),
        MASKED_KEY_HEADER,
      ].join("\n");
      expect(rendered).not.toContain(secret);
    }
    expect(MASKED_KEY_HEADER).toBe("x-meshy-key: •••");
  });
});

describe("curl shell safety", () => {
  it("a prompt with apostrophes still produces a runnable single-quoted curl", () => {
    const run = createEmptyRun("a knight's sword and the jester's cap");
    const curl = stageCurl(stageRequest(run, "preview"));
    // Every single quote in the payload is closed-escaped-reopened ('\'').
    expect(curl).toContain(String.raw`knight'\''s sword`);
    // The -d payload remains wrapped in single quotes.
    expect(curl).toMatch(/-d '\{[\s\S]*\}'$/);
  });
});

describe("creditCopy", () => {
  it("pending stages quote the published price; terminal stages show real consumption", () => {
    const run = chainedRun();
    expect(creditCopy(run.stages.preview, "preview")).toBe(
      `${String(STAGE_CREDITS.preview)} credits`,
    );

    run.stages.preview.status = "succeeded";
    run.stages.preview.creditCost = 20;
    expect(creditCopy(run.stages.preview, "preview")).toBe("20 credits consumed");

    run.stages.rig.status = "failed";
    run.stages.rig.creditCost = 0;
    expect(creditCopy(run.stages.rig, "rig")).toBe("0 credits — failed tasks auto-refund");
  });
});
