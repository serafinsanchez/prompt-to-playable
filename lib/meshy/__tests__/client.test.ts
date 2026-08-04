import { describe, expect, it } from "vitest";

import {
  ANIMATION_CLIP_ACTIONS,
  ANIMATIONS_PATH,
  BALANCE_PATH,
  createMeshyClient,
  PREVIEW_POSE_MODE,
  PREVIEW_SHOULD_REMESH,
  PREVIEW_TARGET_POLYCOUNT,
  PREVIEW_TOPOLOGY,
  REFINE_TEXTURE_PROMPT,
  REMESH_PATH,
  RIGGING_PATH,
  taskGlbUrl,
  TEXT_TO_3D_AI_MODEL,
  TEXT_TO_3D_PATH,
} from "../client";
import { MeshyApiError } from "../types";
import {
  animationSucceeded,
  makeFixtureTransport,
  rigSucceeded,
  succeeded,
  task,
} from "./fixtures";

describe("createMeshyClient", () => {
  it("createPreviewTask POSTs a v2 preview request with rig-friendly pose and topology", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`POST ${TEXT_TO_3D_PATH}`]: [{ body: { result: "preview-0001" } }],
    });
    const client = createMeshyClient(transport);

    const taskId = await client.createPreviewTask("a brave knight");

    expect(taskId).toBe("preview-0001");
    expect(calls[0]!.body).toEqual({
      mode: "preview",
      prompt: "a brave knight",
      pose_mode: PREVIEW_POSE_MODE,
      topology: PREVIEW_TOPOLOGY,
      ai_model: TEXT_TO_3D_AI_MODEL,
      should_remesh: PREVIEW_SHOULD_REMESH,
      target_polycount: PREVIEW_TARGET_POLYCOUNT,
    });
    expect(PREVIEW_POSE_MODE).toBe("a-pose");
    expect(PREVIEW_TOPOLOGY).toBe("quad");
    expect(TEXT_TO_3D_AI_MODEL).toBe("meshy-6");
    expect(PREVIEW_SHOULD_REMESH).toBe(true);
    expect(PREVIEW_TARGET_POLYCOUNT).toBe(30_000);
  });

  it("createRefineTask chains by preview_task_id with PBR and anti-lettering texture steer", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`POST ${TEXT_TO_3D_PATH}`]: [{ body: { result: "refine-0002" } }],
    });
    const client = createMeshyClient(transport);

    const taskId = await client.createRefineTask("preview-0001");

    expect(taskId).toBe("refine-0002");
    expect(calls[0]!.body).toEqual({
      mode: "refine",
      preview_task_id: "preview-0001",
      enable_pbr: true,
      texture_prompt: REFINE_TEXTURE_PROMPT,
    });
    // Generative texturing can't spell — steer it away from lettering.
    expect(REFINE_TEXTURE_PROMPT).toMatch(/no text/);
  });

  it("getTextTo3DTask GETs the v2 task by id", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`GET ${TEXT_TO_3D_PATH}/:id`]: [{ body: succeeded("preview-0001", 20) }],
    });
    const client = createMeshyClient(transport);

    const task = await client.getTextTo3DTask("preview-0001");

    expect(task.status).toBe("SUCCEEDED");
    expect(task.consumed_credits).toBe(20);
    expect(calls[0]!.key).toBe(`GET ${TEXT_TO_3D_PATH}/:id`);
  });

  it("createRigTask chains by input_task_id on v1", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`POST ${RIGGING_PATH}`]: [{ body: { result: "rigging-0003" } }],
    });
    const client = createMeshyClient(transport);

    const taskId = await client.createRigTask("refine-0002");

    expect(taskId).toBe("rigging-0003");
    expect(calls[0]!.body).toEqual({ input_task_id: "refine-0002" });
  });

  it("createAnimationTask sends rig_task_id + integer action_id (live v1/animations shape)", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`POST ${ANIMATIONS_PATH}`]: [{ body: { result: "animate-0004" } }],
    });
    const client = createMeshyClient(transport);

    const taskId = await client.createAnimationTask("rigging-0003", "emote");

    expect(taskId).toBe("animate-0004");
    expect(typeof ANIMATION_CLIP_ACTIONS.emote).toBe("number");
    expect(calls[0]!.body).toEqual({
      rig_task_id: "rigging-0003",
      action_id: ANIMATION_CLIP_ACTIONS.emote,
    });
  });

  it("createRemeshTask passes target_polycount when given", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`POST ${REMESH_PATH}`]: [{ body: { result: "remesh-0005" } }],
    });
    const client = createMeshyClient(transport);

    const taskId = await client.createRemeshTask("refine-0002", 30_000);

    expect(taskId).toBe("remesh-0005");
    expect(calls[0]!.body).toEqual({ input_task_id: "refine-0002", target_polycount: 30_000 });
  });

  it("taskGlbUrl reads model_urls.glb for text-to-3d tasks", () => {
    expect(taskGlbUrl(succeeded("refine-0002", 10))).toBe(
      "https://assets.meshy.test/refine-0002.glb",
    );
  });

  it("taskGlbUrl reads result.rigged_character_glb_url for rigging tasks", () => {
    expect(taskGlbUrl(rigSucceeded("rigging-0003", 5))).toBe(
      "https://assets.meshy.test/rigging-0003.glb",
    );
  });

  it("taskGlbUrl reads result.animation_glb_url for animation tasks", () => {
    expect(taskGlbUrl(animationSucceeded("animate-0004", 3))).toBe(
      "https://assets.meshy.test/animate-0004.glb",
    );
  });

  it("taskGlbUrl is null when a task carries no GLB", () => {
    expect(taskGlbUrl(task("preview-0001", "IN_PROGRESS"))).toBeNull();
  });

  it("getBalance reads the free balance endpoint", async () => {
    const { transport, calls } = makeFixtureTransport({
      [`GET ${BALANCE_PATH}`]: [{ body: { balance: 240 } }],
    });
    const client = createMeshyClient(transport);

    expect(await client.getBalance()).toBe(240);
    expect(calls[0]!.key).toBe(`GET ${BALANCE_PATH}`);
  });

  it("throws when a create response carries no task id", async () => {
    const { transport } = makeFixtureTransport({
      [`POST ${TEXT_TO_3D_PATH}`]: [{ body: { nope: true } }],
    });
    const client = createMeshyClient(transport);

    await expect(client.createPreviewTask("a fox")).rejects.toThrow(/task id/);
  });

  it("lets transport errors propagate untouched", async () => {
    const boom = new MeshyApiError(402, "InsufficientCredits", "no credits");
    const { transport } = makeFixtureTransport({
      [`POST ${RIGGING_PATH}`]: [{ error: boom }],
    });
    const client = createMeshyClient(transport);

    await expect(client.createRigTask("refine-0002")).rejects.toBe(boom);
  });
});
