import { describe, expect, it } from "vitest";
import { ANIMATION_CLIPS, type AnimationClip } from "../../meshy/types";
import type { Document } from "@gltf-transform/core";
import { bakeClipFacing, clipYawSpreadDegrees } from "../facing-bake";
import { mergeCharacter } from "../merge";
import { makeClipDoc, makeRigDoc } from "./fixtures";

/** Merged doc whose five clips face idle+0°, +38°, +42°, +2°, +39° (live-run shape). */
async function makeSkewedCharacter(
  rigOptions: { armatureRotationDeg?: number } = {},
): Promise<Document> {
  const yaw: Record<AnimationClip, number> = {
    idle: -43, walk: -5, run: -1, jump: -41, emote: -4,
  };
  const clips = Object.fromEntries(
    ANIMATION_CLIPS.map((clip) => [clip, makeClipDoc(yaw[clip])]),
  ) as Record<AnimationClip, Document>;
  return mergeCharacter(makeRigDoc(rigOptions), clips);
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

  // With an identity-rotation Armature (every other test here), the
  // parent-space correction `parent⁻¹ · yaw · parent` collapses to plain
  // `yaw` regardless of multiplication order or a dropped `.invert()` — a
  // swapped-order or missing-invert bug would still pass. A non-identity
  // rest rotation on Hips's parent is required to exercise that math for
  // real; see fixtures.ts's `armatureRotationDeg` docstring.
  it("still converges when the hips' parent has an off-axis rest rotation", async () => {
    const character = await makeSkewedCharacter({ armatureRotationDeg: 45 });
    bakeClipFacing(character);
    expect(clipYawSpreadDegrees(character)).toBeLessThan(0.1);
  });
});

describe("facing-bake componentType guard", () => {
  it("throws when a clip's rotation output accessor is not float32", async () => {
    const clips = Object.fromEntries(
      ANIMATION_CLIPS.map((clip) => [clip, makeClipDoc(0)]),
    ) as Record<AnimationClip, Document>;

    // Swap walk's hips rotation output for a quantized (normalized Int16)
    // accessor — a real quantization mesh optimizers apply, and not one
    // facing-bake can safely reinterpret as float yaw data.
    const walkDoc = clips.walk;
    const walkAnimation = walkDoc.getRoot().listAnimations()[0];
    const channel = walkAnimation.listChannels().find((c) => c.getTargetPath() === "rotation");
    const sampler = channel?.getSampler();
    if (!sampler) throw new Error("fixture: walk clip has no rotation sampler");
    const quantized = walkDoc
      .createAccessor()
      .setType("VEC4")
      .setArray(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0, 0, 0, 32767]))
      .setNormalized(true)
      .setBuffer(walkDoc.getRoot().listBuffers()[0]);
    sampler.setOutput(quantized);

    const character = await mergeCharacter(makeRigDoc(), clips);
    expect(() => clipYawSpreadDegrees(character)).toThrow(
      /clip "walk".*not float32/,
    );
  });
});
