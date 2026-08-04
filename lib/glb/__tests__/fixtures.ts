/**
 * Tiny synthetic character documents for lib/glb tests — a 3-bone skeleton
 * (Armature > Hips > Spine), a minimal skinned triangle, and rotation clips
 * with a known world yaw on Hips. Kilobytes, not the 8 MB real thing.
 */
import { Document } from "@gltf-transform/core";
import { KHRMaterialsSpecular } from "@gltf-transform/extensions";
import * as THREE from "three";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Add a 3-key rotation clip on `boneName` at a constant yaw about +Y. */
export function addRotationClip(
  document: Document,
  name: string,
  yawDegrees: number,
  boneName = "Hips",
): void {
  const buffer = document.getRoot().listBuffers()[0];
  const bone = document
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === boneName);
  if (!bone) throw new Error(`fixture: no bone "${boneName}"`);

  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(yawDegrees),
  );
  const key = [q.x, q.y, q.z, q.w];

  const input = document
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Float32Array([0, 0.5, 1]))
    .setBuffer(buffer);
  const output = document
    .createAccessor()
    .setType("VEC4")
    .setArray(new Float32Array([...key, ...key, ...key]))
    .setBuffer(buffer);
  const sampler = document.createAnimationSampler().setInput(input).setOutput(output);
  const channel = document
    .createAnimationChannel()
    .setTargetNode(bone)
    .setTargetPath("rotation")
    .setSampler(sampler);
  document.createAnimation(name).addSampler(sampler).addChannel(channel);
}

/**
 * Rig document: skeleton + skinned triangle (+ optional Meshy-style hacks).
 *
 * `armatureRotationDeg`: rest rotation (degrees, about +X) given to the
 * Armature node — Hips's only ancestor, so this is facing-bake's
 * `parentQuat`. Real rigs are rarely axis-aligned; tests that only ever use
 * the default identity rotation can't distinguish a correct parent-space
 * correction (`parent⁻¹ · yaw · parent`) from a broken one (wrong
 * multiplication order, or a dropped `.invert()`) — with identity parentQuat
 * both collapse to the same result.
 */
export function makeRigDoc(
  options: { junkAnimation?: boolean; emissiveHack?: boolean; armatureRotationDeg?: number } = {},
): Document {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene("Scene");

  const armature = document.createNode("Armature");
  if (options.armatureRotationDeg) {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      THREE.MathUtils.degToRad(options.armatureRotationDeg),
    );
    armature.setRotation([q.x, q.y, q.z, q.w]);
  }
  const hips = document.createNode("Hips");
  const spine = document.createNode("Spine");
  armature.addChild(hips);
  hips.addChild(spine);
  scene.addChild(armature);

  const position = document
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const material = document.createMaterial("Paint").setBaseColorFactor([1, 1, 1, 1]);
  if (options.emissiveHack) {
    material.setEmissiveFactor([1, 1, 1]);
    const specularExtension = document.createExtension(KHRMaterialsSpecular);
    material.setExtension(
      "KHR_materials_specular",
      specularExtension.createSpecular().setSpecularColorFactor([2, 2, 2]),
    );
  }
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setMaterial(material);
  const mesh = document.createMesh("Body").addPrimitive(primitive);
  const inverseBindMatrices = document
    .createAccessor()
    .setType("MAT4")
    .setArray(new Float32Array([...IDENTITY, ...IDENTITY]))
    .setBuffer(buffer);
  const skin = document
    .createSkin()
    .addJoint(hips)
    .addJoint(spine)
    .setInverseBindMatrices(inverseBindMatrices);
  const bodyNode = document.createNode("BodyNode").setMesh(mesh).setSkin(skin);
  scene.addChild(bodyNode);

  if (options.junkAnimation) {
    addRotationClip(document, "Armature|clip0|baselayer", 0);
  }
  return document;
}

/** Clip document: same skeleton + mesh, exactly one animation at `yawDegrees`. */
export function makeClipDoc(
  yawDegrees: number,
  options: { boneName?: string } = {},
): Document {
  const document = makeRigDoc();
  if (options.boneName && options.boneName !== "Hips") {
    // Simulate a mismatched skeleton by renaming the animated bone.
    const hips = document
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === "Hips");
    hips?.setName(options.boneName);
  }
  addRotationClip(document, "take001", yawDegrees, options.boneName ?? "Hips");
  return document;
}
