/** SPIKE: report each clip's mean hips yaw in a merged GLB (should all match). */
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import * as THREE from "three";

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const doc = await io.read(process.argv[2] ?? new URL("../spike-output/character.glb", import.meta.url).pathname);

function nodeDepth(node) {
  let depth = 0;
  for (let p = node.getParentNode(); p; p = p.getParentNode()) depth++;
  return depth;
}
function parentWorldQuat(node) {
  const chain = [];
  for (let p = node.getParentNode(); p; p = p.getParentNode()) chain.unshift(p);
  const q = new THREE.Quaternion();
  for (const a of chain) q.multiply(new THREE.Quaternion().fromArray(a.getRotation()));
  return q;
}
function binding(anim) {
  let best = null;
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== "rotation") continue;
    const depth = nodeDepth(ch.getTargetNode());
    if (!best || depth < best.depth) best = { ch, depth };
  }
  const node = best.ch.getTargetNode();
  return {
    values: best.ch.getSampler().getOutput().getArray(),
    parentQuat: parentWorldQuat(node),
    boneName: node.getName(),
  };
}
function meanYaw(b, axis) {
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let s = 0, c = 0;
  for (let i = 0; i < b.values.length; i += 4) {
    q.fromArray(b.values, i).premultiply(b.parentQuat);
    v.copy(axis).applyQuaternion(q);
    if (Math.hypot(v.x, v.z) < 1e-4) continue;
    const yaw = Math.atan2(v.x, v.z);
    s += Math.sin(yaw);
    c += Math.cos(yaw);
  }
  return Math.atan2(s, c);
}

const anims = doc.getRoot().listAnimations();
const idle = anims.find((a) => a.getName() === "idle");
const idleB = binding(idle);
// Same facing-axis choice as the merge script: idle's most-horizontal basis axis.
const q0 = new THREE.Quaternion().fromArray(idleB.values, 0).premultiply(idleB.parentQuat);
let axis = null, bestPlanar = -1;
for (const a of [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)]) {
  const v = a.clone().applyQuaternion(q0);
  const planar = Math.hypot(v.x, v.z);
  if (planar > bestPlanar) { bestPlanar = planar; axis = a; }
}
console.log(`hips bone: ${idleB.boneName}, facing axis: (${axis.toArray().join(",")})`);
for (const anim of anims) {
  const yaw = meanYaw(binding(anim), axis);
  console.log(`${anim.getName().padEnd(6)} mean yaw ${((yaw * 180) / Math.PI).toFixed(2)}°`);
}
