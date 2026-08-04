/**
 * Meshy animate clips don't share a root orientation (live finding US-01b:
 * idle/jump ≈ −43°, walk/run/emote ≈ 0°). The app fixes this at load
 * (components/scene/clip-facing.ts); a downloaded file must instead carry
 * the fix in its data. Same math, applied to the hips rotation accessors:
 * rotate every clip's mean world yaw to the reference clip's.
 */
import { type Animation, type Document, type Node } from "@gltf-transform/core";
import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const FLOAT = 5126; // Accessor componentType for float32

interface HipsBinding {
  values: Float32Array;
  parentQuat: THREE.Quaternion;
}

function nodeDepth(node: Node): number {
  let depth = 0;
  for (let parent = node.getParentNode(); parent; parent = parent.getParentNode()) depth++;
  return depth;
}

/** World rest rotation of the node's ancestor chain (rotation-only compose). */
function parentWorldQuat(node: Node): THREE.Quaternion {
  const chain: Node[] = [];
  for (let parent = node.getParentNode(); parent; parent = parent.getParentNode()) {
    chain.unshift(parent);
  }
  const q = new THREE.Quaternion();
  for (const ancestor of chain) {
    q.multiply(new THREE.Quaternion().fromArray(ancestor.getRotation()));
  }
  return q;
}

/** The clip's hips rotation track: the shallowest rotation-channel target. */
function findHipsBinding(animation: Animation): HipsBinding | null {
  let best: { channel: ReturnType<Animation["listChannels"]>[number]; depth: number } | null =
    null;
  for (const channel of animation.listChannels()) {
    if (channel.getTargetPath() !== "rotation") continue;
    const node = channel.getTargetNode();
    if (!node) continue;
    const depth = nodeDepth(node);
    if (!best || depth < best.depth) best = { channel, depth };
  }
  if (!best) return null;

  const output = best.channel.getSampler()?.getOutput();
  const node = best.channel.getTargetNode();
  if (!output || !node) return null;
  if (output.getComponentType() !== FLOAT) {
    throw new Error(
      `clip "${animation.getName()}": rotation accessor is not float32 — cannot bake facing`,
    );
  }
  return { values: output.getArray() as Float32Array, parentQuat: parentWorldQuat(node) };
}

/** Local basis axis that lands most horizontally in world space on key 0. */
function facingAxis(binding: HipsBinding): THREE.Vector3 {
  const q = new THREE.Quaternion().fromArray(binding.values, 0).premultiply(binding.parentQuat);
  let best: THREE.Vector3 | null = null;
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
  return best as THREE.Vector3;
}

/** Circular mean of the world yaw of `axis` across all keys. */
function meanYawOf(binding: HipsBinding, axis: THREE.Vector3): number {
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let sinSum = 0;
  let cosSum = 0;
  for (let i = 0; i < binding.values.length; i += 4) {
    q.fromArray(binding.values, i).premultiply(binding.parentQuat);
    v.copy(axis).applyQuaternion(q);
    if (Math.hypot(v.x, v.z) < 1e-4) continue;
    const yaw = Math.atan2(v.x, v.z);
    sinSum += Math.sin(yaw);
    cosSum += Math.cos(yaw);
  }
  return Math.atan2(sinSum, cosSum);
}

function bindings(
  document: Document,
  reference: string,
): { referenceBinding: HipsBinding; axis: THREE.Vector3; others: Map<string, HipsBinding> } | null {
  const animations = document.getRoot().listAnimations();
  const referenceAnimation = animations.find((a) => a.getName() === reference);
  if (!referenceAnimation) return null;
  const referenceBinding = findHipsBinding(referenceAnimation);
  if (!referenceBinding) return null;
  const axis = facingAxis(referenceBinding);

  const others = new Map<string, HipsBinding>();
  for (const animation of animations) {
    if (animation.getName() === reference) continue;
    const binding = findHipsBinding(animation);
    if (binding) others.set(animation.getName(), binding);
  }
  return { referenceBinding, axis, others };
}

/** Max |mean-yaw delta| of any clip vs `reference`, in degrees. 0 = uniform. */
export function clipYawSpreadDegrees(document: Document, reference = "idle"): number {
  const resolved = bindings(document, reference);
  if (!resolved) return 0;
  const referenceYaw = meanYawOf(resolved.referenceBinding, resolved.axis);
  let spread = 0;
  for (const binding of resolved.others.values()) {
    const yaw = meanYawOf(binding, resolved.axis);
    const delta = Math.atan2(Math.sin(yaw - referenceYaw), Math.cos(yaw - referenceYaw));
    spread = Math.max(spread, Math.abs(delta));
  }
  return (spread * 180) / Math.PI;
}

/** Rotate every clip's hips track so its mean world yaw matches `reference`'s. */
export function bakeClipFacing(document: Document, reference = "idle"): void {
  const resolved = bindings(document, reference);
  if (!resolved) return;
  const referenceYaw = meanYawOf(resolved.referenceBinding, resolved.axis);

  for (const binding of resolved.others.values()) {
    const yaw = meanYawOf(binding, resolved.axis);
    const delta = Math.atan2(Math.sin(referenceYaw - yaw), Math.cos(referenceYaw - yaw));
    if (Math.abs(delta) < 1e-3) continue;

    // World-yaw correction in the hips' parent space:
    // q_local' = parent⁻¹ · yaw(delta) · parent · q_local
    const correction = binding.parentQuat
      .clone()
      .invert()
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, delta))
      .multiply(binding.parentQuat);
    const q = new THREE.Quaternion();
    for (let i = 0; i < binding.values.length; i += 4) {
      q.fromArray(binding.values, i).premultiply(correction);
      q.toArray(binding.values, i);
    }
  }
}
