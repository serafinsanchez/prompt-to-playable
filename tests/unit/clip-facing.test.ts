import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  clipFacingAxis,
  clipMeanYaw,
  normalizeClipFacing,
} from "../../components/scene/clip-facing";
import type { ClipName } from "../../components/scene/clip-binding";

/**
 * Mimics a Meshy rig: armature carries a static −90° X rotation
 * (Z-up → Y-up), the animated hips joint hangs under it.
 */
function makeRig(): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = "Scene";
  const armature = new THREE.Object3D();
  armature.name = "Armature";
  armature.rotation.x = -Math.PI / 2;
  const hips = new THREE.Object3D();
  hips.name = "Hips";
  const spine = new THREE.Object3D();
  spine.name = "Spine";
  hips.add(spine);
  armature.add(hips);
  root.add(armature);
  root.updateMatrixWorld(true);
  return root;
}

/** A clip whose hips track holds a constant local rotation equal to `worldYaw` about world Y. */
function makeClip(rig: THREE.Object3D, name: string, worldYawDeg: number): THREE.AnimationClip {
  const armature = rig.getObjectByName("Armature")!;
  const parentQuat = new THREE.Quaternion();
  armature.getWorldQuaternion(parentQuat);
  const yawQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    (worldYawDeg * Math.PI) / 180,
  );
  const local = parentQuat.clone().invert().multiply(yawQuat).multiply(parentQuat);

  const times = [0, 0.5, 1];
  const values: number[] = [];
  for (let i = 0; i < times.length; i++) values.push(local.x, local.y, local.z, local.w);
  const hipsTrack = new THREE.QuaternionKeyframeTrack("Hips.quaternion", times, values);
  // A deeper joint track too — normalization must leave it untouched.
  const spineTrack = new THREE.QuaternionKeyframeTrack("Spine.quaternion", times, [
    ...values,
  ]);
  return new THREE.AnimationClip(name, 1, [hipsTrack, spineTrack]);
}

function makeClipSet(rig: THREE.Object3D, yaws: Record<ClipName, number>) {
  return {
    idle: makeClip(rig, "idle", yaws.idle),
    walk: makeClip(rig, "walk", yaws.walk),
    run: makeClip(rig, "run", yaws.run),
    jump: makeClip(rig, "jump", yaws.jump),
    emote: makeClip(rig, "emote", yaws.emote),
  };
}

describe("normalizeClipFacing", () => {
  it("rotates every clip's hips track to idle's mean facing", () => {
    const rig = makeRig();
    const clips = makeClipSet(rig, { idle: -43, walk: 0, run: 6, jump: -44, emote: -7 });
    normalizeClipFacing(rig, clips);

    const axis = clipFacingAxis(rig, clips.idle)!;
    const reference = clipMeanYaw(rig, clips.idle, axis)!;
    for (const name of ["walk", "run", "jump", "emote"] as const) {
      const yaw = clipMeanYaw(rig, clips[name], axis)!;
      // Circular distance to the idle reference collapses to ~0.
      const delta = Math.atan2(Math.sin(yaw - reference), Math.cos(yaw - reference));
      expect(Math.abs(delta)).toBeLessThan(0.02);
    }
  });

  it("leaves non-hips tracks alone", () => {
    const rig = makeRig();
    const clips = makeClipSet(rig, { idle: -40, walk: 20, run: 20, jump: 20, emote: 20 });
    const spineBefore = [...clips.walk.tracks[1].values];
    normalizeClipFacing(rig, clips);
    expect([...clips.walk.tracks[1].values]).toEqual(spineBefore);
  });

  it("is a no-op when clips already agree", () => {
    const rig = makeRig();
    const clips = makeClipSet(rig, { idle: 10, walk: 10, run: 10, jump: 10, emote: 10 });
    const walkBefore = [...clips.walk.tracks[0].values];
    normalizeClipFacing(rig, clips);
    for (let i = 0; i < walkBefore.length; i++) {
      expect(clips.walk.tracks[0].values[i]).toBeCloseTo(walkBefore[i], 5);
    }
  });

  it("tolerates missing clips", () => {
    const rig = makeRig();
    const clips = makeClipSet(rig, { idle: -40, walk: 30, run: 0, jump: 0, emote: 0 });
    expect(() =>
      normalizeClipFacing(rig, { ...clips, emote: null }),
    ).not.toThrow();
  });
});
