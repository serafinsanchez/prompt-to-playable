import { describe, expect, it } from "vitest";
import { ANIMATION_CLIPS, type AnimationClip } from "../../meshy/types";
import type { Document } from "@gltf-transform/core";
import { mergeCharacter, normalizeMaterials } from "../merge";
import { addRotationClip, makeClipDoc, makeRigDoc } from "./fixtures";

function makeClips(): Record<AnimationClip, Document> {
  return Object.fromEntries(
    ANIMATION_CLIPS.map((clip, index) => [clip, makeClipDoc(index * 10)]),
  ) as Record<AnimationClip, Document>;
}

describe("mergeCharacter", () => {
  it("produces exactly the five named clips, one mesh, one skin", async () => {
    const merged = await mergeCharacter(makeRigDoc({ junkAnimation: true }), makeClips());
    const root = merged.getRoot();
    expect(root.listAnimations().map((a) => a.getName()).sort()).toEqual(
      [...ANIMATION_CLIPS].sort(),
    );
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listSkins()).toHaveLength(1);
  });

  it("strips the rig's junk rig-pose animation", async () => {
    const merged = await mergeCharacter(makeRigDoc({ junkAnimation: true }), makeClips());
    const names = merged.getRoot().listAnimations().map((a) => a.getName());
    expect(names).not.toContain("Armature|clip0|baselayer");
  });

  it("retargets every channel onto the rig's own nodes", async () => {
    const merged = await mergeCharacter(makeRigDoc(), makeClips());
    const rigNodes = new Set(merged.getRoot().listNodes());
    for (const animation of merged.getRoot().listAnimations()) {
      for (const channel of animation.listChannels()) {
        expect(rigNodes.has(channel.getTargetNode()!)).toBe(true);
      }
    }
  });

  it("throws a clear error on a bone the rig doesn't have", async () => {
    const clips = makeClips();
    clips.walk = makeClipDoc(0, { boneName: "Pelvis" });
    await expect(mergeCharacter(makeRigDoc(), clips)).rejects.toThrow(
      /clip "walk".*"Pelvis".*missing/,
    );
  });

  it("throws when a clip document has more than one animation", async () => {
    const clips = makeClips();
    const walk = makeClipDoc(0);
    addRotationClip(walk, "second", 5); // a second animation in one clip file
    clips.walk = walk;
    await expect(mergeCharacter(makeRigDoc(), clips)).rejects.toThrow(/expected exactly 1/);
  });
});

describe("normalizeMaterials", () => {
  it("clears the emissive viewer hack and drops KHR_materials_specular", () => {
    const rig = makeRigDoc({ emissiveHack: true });
    normalizeMaterials(rig);
    const material = rig.getRoot().listMaterials()[0];
    expect(material.getEmissiveFactor()).toEqual([0, 0, 0]);
    expect(material.getEmissiveTexture()).toBeNull();
    expect(material.getExtension("KHR_materials_specular")).toBeNull();
    const used = rig.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    expect(used).not.toContain("KHR_materials_specular");
  });
});
