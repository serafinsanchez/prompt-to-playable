import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bindCharacterClips,
  CLIP_NAMES,
  type ClipName,
} from "../../components/scene/clip-binding";

function makeClip(name: string): THREE.AnimationClip {
  const track = new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 0, 1, 0]);
  return new THREE.AnimationClip(name, 1, [track]);
}

function makeClipSet(): Record<ClipName, THREE.AnimationClip> {
  return Object.fromEntries(
    CLIP_NAMES.map((name) => [name, makeClip(`Armature|${name}`)]),
  ) as Record<ClipName, THREE.AnimationClip>;
}

describe("bindCharacterClips", () => {
  it("binds all five named actions through a single mixer rooted at the rig scene", () => {
    const rigScene = new THREE.Group();
    const { mixer, actions } = bindCharacterClips(rigScene, makeClipSet());

    expect(mixer.getRoot()).toBe(rigScene);
    for (const name of CLIP_NAMES) {
      const action = actions[name];
      expect(action).toBeDefined();
      expect(action.getMixer()).toBe(mixer);
    }
  });

  it("maps each named action to the clip it was given", () => {
    const rigScene = new THREE.Group();
    const clips = makeClipSet();
    const { actions } = bindCharacterClips(rigScene, clips);

    for (const name of CLIP_NAMES) {
      expect(actions[name].getClip()).toBe(clips[name]);
    }
  });

  it("throws naming the missing clip when a GLB had no animation", () => {
    const rigScene = new THREE.Group();
    const clips: Record<ClipName, THREE.AnimationClip | null> = {
      ...makeClipSet(),
      run: null,
    };

    expect(() => bindCharacterClips(rigScene, clips)).toThrowError(/run/);
  });
});
