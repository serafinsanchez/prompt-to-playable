import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Document, NodeIO } from "@gltf-transform/core";

import { ANIMATION_CLIPS } from "../../../lib/meshy/types";
import {
  countTriangles,
  createGalleryIO,
  optimizeCharacter,
  optimizeClipGlb,
  optimizeRigGlb,
} from "../optimize";

/**
 * 4×4 noise PNG. Deliberately NOT a solid color: prune() correctly folds
 * single-color textures into material factors, and this test needs the
 * texture to survive optimization the way real Meshy textures do.
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAT0lEQVQImQFEALv/AAmwluQCvp7GajfHZCvhewgABkrQTFNGHciZ1ttMkwXFQwBn0h00wSvuJuzovDhKVbUkAAebUbh4m3XWBfGeXQ19Ntr+EB4xyGWl1gAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Synthetic stand-in for a Meshy character GLB: skinned-ish node tree, a
 * textured mesh with plenty of f32 geometry (so compression has something to
 * chew on), and one long animation — mirrors what rig/animate downloads
 * contain, at a fraction of the size.
 */
async function makeCharacterGlb(withAnimation: boolean): Promise<Uint8Array> {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene("Scene");

  const triangleCount = 512;
  const positions = new Float32Array(triangleCount * 3 * 3).map(() => Math.random());
  const position = document
    .createAccessor("POSITION")
    .setType("VEC3")
    .setArray(positions)
    .setBuffer(buffer);
  const texcoord = document
    .createAccessor("TEXCOORD_0")
    .setType("VEC2")
    .setArray(new Float32Array(triangleCount * 3 * 2).map(() => Math.random()))
    .setBuffer(buffer);

  const texture = document.createTexture("texture_0").setImage(TINY_PNG).setMimeType("image/png");
  const material = document.createMaterial("Material_1").setBaseColorTexture(texture);
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("TEXCOORD_0", texcoord)
    .setMaterial(material);
  const mesh = document.createMesh("char").addPrimitive(primitive);

  const hips = document.createNode("Hips");
  const spine = document.createNode("Spine");
  hips.addChild(spine);
  const body = document.createNode("char1").setMesh(mesh);
  scene.addChild(hips);
  scene.addChild(body);

  if (withAnimation) {
    const keyframes = 240;
    const input = document
      .createAccessor("times")
      .setType("SCALAR")
      .setArray(new Float32Array(keyframes).map((_, i) => i / 30))
      .setBuffer(buffer);
    const output = document
      .createAccessor("rotations")
      .setType("VEC4")
      .setArray(new Float32Array(keyframes * 4).map(() => Math.random()))
      .setBuffer(buffer);
    const sampler = document.createAnimationSampler().setInput(input).setOutput(output);
    const channel = document
      .createAnimationChannel()
      .setTargetNode(spine)
      .setTargetPath("rotation")
      .setSampler(sampler);
    document.createAnimation("Armature|Idle|baselayer").addSampler(sampler).addChannel(channel);
  }

  return new NodeIO().writeBinary(document);
}

describe("optimizeRigGlb", () => {
  it("emits a smaller GLB that re-parses with the same triangle count", async () => {
    const io = await createGalleryIO();
    const raw = await makeCharacterGlb(true);

    const { glb, polyCount } = await optimizeRigGlb(io, raw);
    expect(glb.byteLength).toBeLessThan(raw.byteLength);
    expect(polyCount).toBe(512);

    const reread = await io.readBinary(glb); // throws if the output is invalid glTF
    expect(countTriangles(reread)).toBe(512);
    // The rig's embedded rest animation is dropped — clips ship separately.
    expect(reread.getRoot().listAnimations()).toHaveLength(0);
    expect(reread.getRoot().listTextures().length).toBeGreaterThan(0);
  });
});

describe("optimizeClipGlb", () => {
  it("strips mesh, material, and texture but keeps the named animation targets", async () => {
    const io = await createGalleryIO();
    const raw = await makeCharacterGlb(true);

    const glb = await optimizeClipGlb(io, raw);
    expect(glb.byteLength).toBeLessThan(raw.byteLength);

    const reread = await io.readBinary(glb);
    const root = reread.getRoot();
    expect(root.listMeshes()).toHaveLength(0);
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listAnimations()).toHaveLength(1);
    expect(root.listAnimations()[0].getName()).toBe("Armature|Idle|baselayer");
    // three.js binds clip tracks onto the rig's scene graph by node NAME.
    expect(root.listNodes().map((node) => node.getName())).toContain("Spine");
  });

  it("refuses a GLB with no animation instead of emitting an empty file", async () => {
    const io = await createGalleryIO();
    const raw = await makeCharacterGlb(false);
    await expect(optimizeClipGlb(io, raw)).rejects.toThrow(/no animation/);
  });
});

// Full-size integration pass against the real spike downloads. spike-output/
// is gitignored (~54 MB), so this only runs where the TASK-05 artifacts exist.
const spikeDir = join(process.cwd(), "spike-output");
describe.skipIf(!existsSync(join(spikeDir, "rig.glb")))("spike GLBs (integration)", () => {
  it("optimizes the real knight far under the raw 8.5 MB budget", async () => {
    const io = await createGalleryIO();
    const raw = {
      rig: new Uint8Array(readFileSync(join(spikeDir, "rig.glb"))),
      clips: Object.fromEntries(
        ANIMATION_CLIPS.map((clip) => [
          clip,
          new Uint8Array(readFileSync(join(spikeDir, `animate-${clip}.glb`))),
        ]),
      ) as Record<(typeof ANIMATION_CLIPS)[number], Uint8Array>,
    };

    const optimized = await optimizeCharacter(io, raw);
    expect(optimized.polyCount).toBe(29_015); // spike README run 2
    expect(optimized.rig.byteLength).toBeLessThan(4 * 1024 * 1024);
    for (const clip of ANIMATION_CLIPS) {
      expect(optimized.clips[clip].byteLength).toBeLessThan(300 * 1024);
    }

    // The renderable rig keeps its skinning and its (downscaled) texture.
    const rig = await io.readBinary(optimized.rig);
    expect(countTriangles(rig)).toBe(29_015);
    expect(rig.getRoot().listSkins()).toHaveLength(1);
    const [texture] = rig.getRoot().listTextures();
    expect(texture.getSize()).toEqual([1024, 1024]);
  }, 60_000);
});
