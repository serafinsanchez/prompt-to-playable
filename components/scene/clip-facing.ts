import * as THREE from "three";
import { CLIP_NAMES, type ClipName } from "./clip-binding";

/**
 * Meshy's five animate GLBs don't share a root orientation — the hips
 * rotation track of each clip faces its own way (live finding: idle/jump
 * ≈ −43°, walk/run/emote ≈ 0°), so the knight snapped sideways whenever
 * the dominant clip changed. This module bakes a per-clip yaw correction
 * into the hips track at load time so every clip shares idle's facing.
 */

const UP = new THREE.Vector3(0, 1, 0);

interface HipsBinding {
  track: THREE.QuaternionKeyframeTrack;
  parentQuat: THREE.Quaternion;
}

/** Depth of the named node under the rig root, or Infinity if absent. */
function nodeDepth(rigScene: THREE.Object3D, nodeName: string): number {
  const node = rigScene.getObjectByName(nodeName);
  if (!node) return Infinity;
  let depth = 0;
  for (let p = node.parent; p && p !== rigScene; p = p.parent) depth++;
  return depth;
}

/** The clip's hips rotation track: the shallowest animated joint's .quaternion track. */
function findHipsBinding(
  rigScene: THREE.Object3D,
  clip: THREE.AnimationClip,
): HipsBinding | null {
  let best: { track: THREE.QuaternionKeyframeTrack; depth: number; nodeName: string } | null =
    null;
  for (const track of clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
    if (!nodeName) continue;
    const depth = nodeDepth(rigScene, nodeName);
    if (depth === Infinity) continue;
    if (!best || depth < best.depth) best = { track, depth, nodeName };
  }
  if (!best) return null;

  const node = rigScene.getObjectByName(best.nodeName)!;
  const parentQuat = new THREE.Quaternion();
  (node.parent ?? rigScene).getWorldQuaternion(parentQuat);
  return { track: best.track, parentQuat };
}

/**
 * The horizontal axis we measure facing with: whichever local basis axis
 * lands most horizontally in world space on the clip's first key. The
 * same axis must be used for every clip so deltas are comparable.
 */
function facingAxis(binding: HipsBinding): THREE.Vector3 {
  const q = new THREE.Quaternion().fromArray(binding.track.values, 0).premultiply(
    binding.parentQuat,
  );
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
  return best!;
}

/** Circular mean of the world yaw of `axis` across all keys of the hips track. */
function meanYawOf(binding: HipsBinding, axis: THREE.Vector3): number {
  const { track, parentQuat } = binding;
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let sinSum = 0;
  let cosSum = 0;
  for (let i = 0; i < track.values.length; i += 4) {
    q.fromArray(track.values, i).premultiply(parentQuat);
    v.copy(axis).applyQuaternion(q);
    const planar = Math.hypot(v.x, v.z);
    if (planar < 1e-4) continue;
    const yaw = Math.atan2(v.x, v.z);
    sinSum += Math.sin(yaw);
    cosSum += Math.cos(yaw);
  }
  return Math.atan2(sinSum, cosSum);
}

/**
 * Mean world yaw of a clip's hips track — exposed for tests. Pass the
 * same `axis` for every clip you compare; without one, the clip's own
 * best-horizontal axis is used and yaws are not cross-clip comparable.
 */
export function clipMeanYaw(
  rigScene: THREE.Object3D,
  clip: THREE.AnimationClip,
  axis?: THREE.Vector3,
): number | null {
  const binding = findHipsBinding(rigScene, clip);
  if (!binding) return null;
  return meanYawOf(binding, axis ?? facingAxis(binding));
}

/** The facing axis a clip would measure with — pair with `clipMeanYaw`'s `axis` param. */
export function clipFacingAxis(
  rigScene: THREE.Object3D,
  clip: THREE.AnimationClip,
): THREE.Vector3 | null {
  const binding = findHipsBinding(rigScene, clip);
  if (!binding) return null;
  return facingAxis(binding);
}

/**
 * Mutates every clip's hips rotation track so its mean world yaw matches
 * idle's. Idle is the reference because US-01a tuned the stage around it.
 */
export function normalizeClipFacing(
  rigScene: THREE.Object3D,
  clips: Record<ClipName, THREE.AnimationClip | null | undefined>,
): void {
  const idle = clips.idle;
  if (!idle) return;
  const idleBinding = findHipsBinding(rigScene, idle);
  if (!idleBinding) return;

  const axis = facingAxis(idleBinding);
  const referenceYaw = meanYawOf(idleBinding, axis);

  for (const name of CLIP_NAMES) {
    if (name === "idle") continue;
    const clip = clips[name];
    if (!clip) continue;
    const binding = findHipsBinding(rigScene, clip);
    if (!binding) continue;

    const yaw = meanYawOf(binding, axis);
    const delta = Math.atan2(Math.sin(referenceYaw - yaw), Math.cos(referenceYaw - yaw));
    if (Math.abs(delta) < 1e-3) continue;

    // World-yaw correction expressed in the hips' parent space:
    // q_local' = parent⁻¹ · yaw · parent · q_local
    const corr = binding.parentQuat
      .clone()
      .invert()
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, delta))
      .multiply(binding.parentQuat);

    const q = new THREE.Quaternion();
    for (let i = 0; i < binding.track.values.length; i += 4) {
      q.fromArray(binding.track.values, i).premultiply(corr);
      q.toArray(binding.track.values, i);
    }
  }
}
