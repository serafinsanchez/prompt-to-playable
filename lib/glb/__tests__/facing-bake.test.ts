import { describe, expect, it } from "vitest";
import { ANIMATION_CLIPS, type AnimationClip } from "../../meshy/types";
import type { Document } from "@gltf-transform/core";
import { bakeClipFacing, clipYawSpreadDegrees } from "../facing-bake";
import { mergeCharacter } from "../merge";
import { makeClipDoc, makeRigDoc } from "./fixtures";

/** Merged doc whose five clips face idle+0°, +38°, +42°, +2°, +39° (live-run shape). */
async function makeSkewedCharacter(): Promise<Document> {
  const yaw: Record<AnimationClip, number> = {
    idle: -43, walk: -5, run: -1, jump: -41, emote: -4,
  };
  const clips = Object.fromEntries(
    ANIMATION_CLIPS.map((clip) => [clip, makeClipDoc(yaw[clip])]),
  ) as Record<AnimationClip, Document>;
  return mergeCharacter(makeRigDoc(), clips);
}

describe("clipYawSpreadDegrees", () => {
  it("reports the pre-bake skew", async () => {
    const spread = clipYawSpreadDegrees(await makeSkewedCharacter());
    expect(spread).toBeGreaterThan(30);
  });
});

describe("bakeClipFacing", () => {
  it("brings every clip's mean yaw to idle's (spread ≈ 0)", async () => {
    const character = await makeSkewedCharacter();
    bakeClipFacing(character);
    expect(clipYawSpreadDegrees(character)).toBeLessThan(0.1);
  });

  it("leaves an already-uniform character untouched", async () => {
    const clips = Object.fromEntries(
      ANIMATION_CLIPS.map((clip) => [clip, makeClipDoc(15)]),
    ) as Record<AnimationClip, Document>;
    const character = await mergeCharacter(makeRigDoc(), clips);
    const before = clipYawSpreadDegrees(character);
    bakeClipFacing(character);
    expect(before).toBeLessThan(0.1);
    expect(clipYawSpreadDegrees(character)).toBeLessThan(0.1);
  });
});
