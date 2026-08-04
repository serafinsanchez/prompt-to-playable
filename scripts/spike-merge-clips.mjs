/**
 * SPIKE: merge rig.glb + the five animate GLBs into one character.glb with
 * five named AnimationClips (idle/walk/run/jump/emote).
 *
 * Each Meshy animate GLB re-ships the full mesh + textures with one clip, so
 * shipping a character costs ~42 MB across six files. This script keeps one
 * copy of the mesh (from rig.glb), grafts every clip onto its skeleton by
 * bone name, and bakes the per-clip yaw correction (see
 * components/scene/clip-facing.ts) into the hips tracks so the output file
 * needs no runtime facing fixup in a consuming game.
 *
 * Usage: node scripts/spike-merge-clips.mjs [outFile]
 *   (run from the character-pipeline-demo directory)
 */
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { mergeDocuments, prune, unpartition } from "@gltf-transform/functions";
import { statSync } from "node:fs";
import * as THREE from "three";

const SPIKE_DIR = new URL("../spike-output/", import.meta.url).pathname;
const CLIP_NAMES = ["idle", "walk", "run", "jump", "emote"];
const OUT = process.argv[2] ?? `${SPIKE_DIR}character.glb`;

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

// ---------------------------------------------------------------------------
// 1. Base document: the rigged mesh, no clips.
// ---------------------------------------------------------------------------
const base = await io.read(`${SPIKE_DIR}rig.glb`);
// Meshy's rig task ships a rig-pose sanity clip — not a gameplay animation.
for (const anim of base.getRoot().listAnimations()) anim.dispose();
const baseNodesByName = new Map(
  base.getRoot().listNodes().map((node) => [node.getName(), node]),
);
console.log(
  `rig.glb: ${baseNodesByName.size} nodes, ` +
    `${base.getRoot().listAnimations().length} animations`,
);

// ---------------------------------------------------------------------------
// 2. Graft each clip onto the base skeleton, then drop the duplicate scene.
// ---------------------------------------------------------------------------
for (const name of CLIP_NAMES) {
  const src = await io.read(`${SPIKE_DIR}animate-${name}.glb`);
  const srcAnims = src.getRoot().listAnimations();
  if (srcAnims.length !== 1) {
    throw new Error(`animate-${name}.glb has ${srcAnims.length} animations, expected 1`);
  }
  srcAnims[0].setName(name);

  const map = mergeDocuments(base, src);
  const anim = map.get(srcAnims[0]);

  // Retarget every channel from the copied skeleton to the base skeleton.
  for (const channel of anim.listChannels()) {
    const copied = channel.getTargetNode();
    const target = baseNodesByName.get(copied.getName());
    if (!target) {
      throw new Error(`clip "${name}" targets bone "${copied.getName()}" missing from rig.glb`);
    }
    channel.setTargetNode(target);
  }

  // Everything else the merge brought in (scene, nodes, mesh, skin) is now
  // unreferenced by the animation — dispose it explicitly, prune() sweeps
  // the orphaned meshes/materials/textures/accessors afterwards.
  for (const [srcProp, dstProp] of map) {
    const type = srcProp.propertyType;
    if (type === "Scene" || type === "Node") dstProp.dispose();
  }
  console.log(`merged clip "${name}" (${anim.listChannels().length} channels)`);
}

await base.transform(prune(), unpartition());

// ---------------------------------------------------------------------------
// 3. Bake yaw normalization into the hips rotation tracks.
//    Port of components/scene/clip-facing.ts onto glTF-Transform accessors:
//    every clip's mean world yaw is rotated to match idle's.
// ---------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);

function nodeDepth(node) {
  let depth = 0;
  for (let p = node.getParentNode(); p; p = p.getParentNode()) depth++;
  return depth;
}

/** World rest rotation of the node's parent chain (rotation-only compose). */
function parentWorldQuat(node) {
  const chain = [];
  for (let p = node.getParentNode(); p; p = p.getParentNode()) chain.unshift(p);
  const q = new THREE.Quaternion();
  for (const ancestor of chain) {
    q.multiply(new THREE.Quaternion().fromArray(ancestor.getRotation()));
  }
  return q;
}

/** The clip's hips rotation binding: shallowest rotation-channel target. */
function findHipsBinding(anim) {
  let best = null;
  for (const channel of anim.listChannels()) {
    if (channel.getTargetPath() !== "rotation") continue;
    const node = channel.getTargetNode();
    if (!node) continue;
    const depth = nodeDepth(node);
    if (!best || depth < best.depth) best = { channel, depth };
  }
  if (!best) return null;
  const accessor = best.channel.getSampler().getOutput();
  if (accessor.getComponentType() !== 5126) {
    throw new Error(`rotation accessor for "${anim.getName()}" is not float32`);
  }
  return { values: accessor.getArray(), parentQuat: parentWorldQuat(best.channel.getTargetNode()) };
}

/** Local basis axis landing most horizontally in world space on key 0. */
function facingAxis(binding) {
  const q = new THREE.Quaternion().fromArray(binding.values, 0).premultiply(binding.parentQuat);
  let best = null;
  let bestPlanar = -1;
  for (const axis of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]) {
    const v = axis.clone().applyQuaternion(q);
    const planar = Math.hypot(v.x, v.z);
    if (planar > bestPlanar) {
      bestPlanar = planar;
      best = axis;
    }
  }
  return best;
}

/** Circular mean of the world yaw of `axis` across all keys. */
function meanYawOf(binding, axis) {
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let sinSum = 0;
  let cosSum = 0;
  for (let i = 0; i < binding.values.length; i += 4) {
    q.fromArray(binding.values, i).premultiply(binding.parentQuat);
    v.copy(axis).applyQuaternion(q);
    const planar = Math.hypot(v.x, v.z);
    if (planar < 1e-4) continue;
    sinSum += Math.sin(Math.atan2(v.x, v.z));
    cosSum += Math.cos(Math.atan2(v.x, v.z));
  }
  return Math.atan2(sinSum, cosSum);
}

const anims = new Map(base.getRoot().listAnimations().map((a) => [a.getName(), a]));
const idleBinding = findHipsBinding(anims.get("idle"));
if (!idleBinding) throw new Error("idle clip has no hips rotation track");
const axis = facingAxis(idleBinding);
const referenceYaw = meanYawOf(idleBinding, axis);

for (const name of CLIP_NAMES) {
  if (name === "idle") continue;
  const binding = findHipsBinding(anims.get(name));
  if (!binding) continue;
  const yaw = meanYawOf(binding, axis);
  const delta = Math.atan2(Math.sin(referenceYaw - yaw), Math.cos(referenceYaw - yaw));
  console.log(`clip "${name}": yaw off idle by ${((yaw - referenceYaw) * 180) / Math.PI}°`);
  if (Math.abs(delta) < 1e-3) continue;

  // q_local' = parent⁻¹ · yaw(delta) · parent · q_local  (see clip-facing.ts)
  const corr = binding.parentQuat
    .clone()
    .invert()
    .multiply(new THREE.Quaternion().setFromAxisAngle(UP, delta))
    .multiply(binding.parentQuat);
  const q = new THREE.Quaternion();
  for (let i = 0; i < binding.values.length; i += 4) {
    q.fromArray(binding.values, i).premultiply(corr);
    q.toArray(binding.values, i);
  }
}

// ---------------------------------------------------------------------------
// 4. Write + report.
// ---------------------------------------------------------------------------
await io.write(OUT, base);
const root = base.getRoot();
console.log(`\nwrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(
  `animations: [${root.listAnimations().map((a) => a.getName()).join(", ")}], ` +
    `meshes: ${root.listMeshes().length}, skins: ${root.listSkins().length}, ` +
    `textures: ${root.listTextures().length}, nodes: ${root.listNodes().length}`,
);
