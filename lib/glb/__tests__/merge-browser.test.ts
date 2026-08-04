import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { ANIMATION_CLIPS, type AnimationClip } from "../../meshy/types";
import { mergeCharacterFromUrls, type CharacterUrls } from "../merge-browser";
import { makeClipDoc, makeRigDoc } from "./fixtures";

const URLS: CharacterUrls = {
  rig: "/fake/rig.glb",
  clips: Object.fromEntries(
    ANIMATION_CLIPS.map((clip) => [clip, `/fake/${clip}.glb`]),
  ) as Record<AnimationClip, string>,
};

/** In-memory fetch: serves the synthetic docs as GLB bytes by URL. */
async function makeFetch(overrides: Partial<Record<string, number>> = {}) {
  const io = new NodeIO();
  const bodies = new Map<string, Uint8Array>([
    ["/fake/rig.glb", await io.writeBinary(makeRigDoc({ junkAnimation: true }))],
  ]);
  for (const [index, clip] of ANIMATION_CLIPS.entries()) {
    bodies.set(`/fake/${clip}.glb`, await io.writeBinary(makeClipDoc(index * 10)));
  }
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const status = overrides[url];
    if (status !== undefined) return new Response(null, { status });
    const body = bodies.get(url);
    if (!body) return new Response(null, { status: 404 });
    return new Response(body.slice().buffer as ArrayBuffer, { status: 200 });
  }) as typeof fetch;
  return fetchFn;
}

describe("mergeCharacterFromUrls", () => {
  it("returns one GLB with the five clips on one mesh", async () => {
    const bytes = await mergeCharacterFromUrls(URLS, await makeFetch());
    const merged = await new NodeIO().readBinary(bytes);
    expect(merged.getRoot().listAnimations().map((a) => a.getName()).sort()).toEqual(
      [...ANIMATION_CLIPS].sort(),
    );
    expect(merged.getRoot().listMeshes()).toHaveLength(1);
  });

  it("throws with the failing file's name on a bad fetch", async () => {
    const fetchFn = await makeFetch({ "/fake/walk.glb": 403 });
    await expect(mergeCharacterFromUrls(URLS, fetchFn)).rejects.toThrow(/walk.*403/);
  });
});
