# US-10: Game-Ready GLB Download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every character (8 gallery + live-generated) gets a "game-ready .glb" download: one file, rigged mesh + five named clips (`idle/walk/run/jump/emote`), facing baked, loadable by stock three.js/Blender/engines with zero extra decoders.

**Architecture:** A shared isomorphic merge core in `lib/glb/` (gltf-transform documents in/out; three.js only for quaternion math). Two drivers: a pregen script derives gallery files offline from already-committed assets (no Meshy credits), and a lazy-loaded browser module merges a live run's six proxied GLBs on download click. Spec: `docs/specs/us-10-game-ready-glb.md`. Proven reference: `scripts/spike-merge-clips.mjs` + `scripts/spike-verify-facing.mjs` (offline spike, 2026-08-04).

**Tech Stack:** TypeScript, Next.js App Router, gltf-transform 4.x (`mergeDocuments`, `prune`, `unpartition`, `dequantize`, `textureCompress`), three (math only), sharp (pregen only), Vitest, Playwright.

## Global Constraints

- No new packages. Promoting `@gltf-transform/core|extensions|functions` from devDependencies to dependencies is authorized by the spec. `meshoptimizer` and `sharp` stay dev-only and must never enter a client chunk.
- gltf-transform reaches the browser ONLY via `await import("../../lib/glb/merge-browser")` on download click — never a static import from any component.
- Output file contract (machine-checkable "game-ready"): `extensionsRequired` empty; textures `image/png` or `image/jpeg` only; exactly five animations named `idle, walk, run, jump, emote`; one mesh; one skin; gallery file ≤ 8.5 MB (8,912,896 bytes).
- Do NOT touch the app's own load path: `components/scene/clip-binding.ts`, `components/scene/character.tsx`, runtime `components/scene/clip-facing.ts` stay as-is.
- No server changes: no new routes, no proxy changes, no zip.
- UI: semantic tokens only (no raw palette classes/hex); every interactive element defines hover/focus-visible/active/disabled states; errors inline in the row — no toasts; `prefers-reduced-motion` honored (existing row classes already carry `motion-reduce:`); pipeline/download copy is mono with numbers as copy (DESIGN.md).
- After UI tasks run the `design-reviewer` subagent; after the ARCHITECTURE/dependency change run `architecture-reviewer` (CLAUDE.md rules).
- Verification before any "done": `npm run typecheck && npm run lint && npm run test && bash scripts/check-tokens.sh` and, for UI tasks, the named Playwright specs.
- Commit after every task (small commits; `docs/` is currently in `.gitignore` line 26 despite being tracked — use `git add -f` for docs paths, or remove that line if the user has approved it by then).

---

### Task 1: Dependency promotion + `lib/glb/merge.ts` (merge core + material normalization)

**Files:**
- Modify: `package.json` (move `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` from `devDependencies` to `dependencies`; versions unchanged)
- Create: `lib/glb/__tests__/fixtures.ts`
- Create: `lib/glb/__tests__/merge.test.ts`
- Create: `lib/glb/merge.ts`

**Interfaces:**
- Consumes: `ANIMATION_CLIPS`, `AnimationClip` from `lib/meshy/types` (existing: `["idle","walk","run","jump","emote"]`).
- Produces (later tasks import these exactly):
  - `mergeCharacter(rig: Document, clips: Record<AnimationClip, Document>): Promise<Document>`
  - `normalizeMaterials(document: Document): void`
  - test helpers `makeRigDoc(options?: { junkAnimation?: boolean; emissiveHack?: boolean }): Document`, `makeClipDoc(yawDegrees: number, options?: { boneName?: string }): Document`, `addRotationClip(document: Document, name: string, yawDegrees: number, boneName?: string): void`

- [ ] **Step 1: Promote the gltf-transform packages**

In `package.json`, cut the three `@gltf-transform/*` lines from `devDependencies` and paste them into `dependencies` (keep alphabetical order, keep the exact semver strings currently there). `meshoptimizer` and `sharp` stay in `devDependencies`. Run `npm install` to refresh the lockfile.

- [ ] **Step 2: Record the bundle baseline**

Run: `npm run build`
Copy the route table (route → size / first-load JS) into a scratch note. Task 8 compares against it to prove the lazy chunk changed nothing on first load.

- [ ] **Step 3: Write the synthetic-GLB fixture helpers**

```ts
// lib/glb/__tests__/fixtures.ts
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

/** Rig document: skeleton + skinned triangle (+ optional Meshy-style hacks). */
export function makeRigDoc(
  options: { junkAnimation?: boolean; emissiveHack?: boolean } = {},
): Document {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene("Scene");

  const armature = document.createNode("Armature");
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

// (Small indirection only so the primitive line above stays readable.)
function mesh0<T>(primitive: T): T {
  return primitive;
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
```

Simplify `mesh0` away if it reads worse than inlining — it exists only to dodge a long line; `document.createMesh("Body").addPrimitive(primitive)` directly is equally fine.

- [ ] **Step 4: Write the failing merge tests**

```ts
// lib/glb/__tests__/merge.test.ts
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
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run lib/glb/__tests__/merge.test.ts`
Expected: FAIL — `Cannot find module '../merge'` (or equivalent). If failures are fixture bugs instead, fix fixtures first.

- [ ] **Step 6: Implement `lib/glb/merge.ts`**

```ts
// lib/glb/merge.ts
/**
 * Merge a rigged character with its five animation documents into one
 * game-ready document: five named clips on one mesh/skin/skeleton.
 *
 * Isomorphic — no Node-only imports; runs in the pregen script and in the
 * browser's lazy merge chunk. Proven offline in scripts/spike-merge-clips.mjs
 * (2026-08-04): Meshy bone names match across every output of one character,
 * so retargeting is a by-name channel re-point, never a skeleton map.
 */
import { PropertyType, type Animation, type Document } from "@gltf-transform/core";
import { mergeDocuments, prune, unpartition } from "@gltf-transform/functions";
import { ANIMATION_CLIPS, type AnimationClip } from "../meshy/types";

/**
 * Mutates and returns `rig`: strips its embedded rig-pose animation, grafts
 * each clip's single animation onto the rig skeleton, prunes the five
 * duplicate meshes the clip files carry, and folds everything into one
 * buffer (GLB requires it).
 */
export async function mergeCharacter(
  rig: Document,
  clips: Record<AnimationClip, Document>,
): Promise<Document> {
  // Meshy's rig task ships a rig-pose sanity clip — not a gameplay animation.
  for (const animation of rig.getRoot().listAnimations()) animation.dispose();

  const nodesByName = new Map(
    rig.getRoot().listNodes().map((node) => [node.getName(), node]),
  );

  for (const clip of ANIMATION_CLIPS) {
    const source = clips[clip];
    const animations = source.getRoot().listAnimations();
    if (animations.length !== 1) {
      throw new Error(
        `clip "${clip}": expected exactly 1 animation, got ${String(animations.length)}`,
      );
    }
    animations[0].setName(clip);

    const map = mergeDocuments(rig, source);
    const merged = map.get(animations[0]) as Animation;

    // Re-point every channel from the copied skeleton to the rig's own bones.
    for (const channel of merged.listChannels()) {
      const bone = channel.getTargetNode()?.getName() ?? "<unnamed>";
      const target = nodesByName.get(bone);
      if (!target) {
        throw new Error(`clip "${clip}" targets bone "${bone}" missing from the rig`);
      }
      channel.setTargetNode(target);
    }

    // The copied scene/node tree is now unreferenced by the animation;
    // dispose it so prune() can sweep the orphaned mesh/skin/material/texture.
    for (const [sourceProperty, copied] of map) {
      const type = sourceProperty.propertyType;
      if (type === PropertyType.SCENE || type === PropertyType.NODE) copied.dispose();
    }
  }

  await rig.transform(prune(), unpartition());
  return rig;
}

/**
 * Undo Meshy's rig-export viewer hacks so the file lights correctly in any
 * engine (runtime twin: components/scene/meshy-material.ts):
 * emissive = baseColor at factor [1,1,1] (self-glow) → cleared;
 * KHR_materials_specular specularColorFactor [2,2,2] → extension removed
 * (glTF defaults are the neutral values). Roughness is NOT touched — that
 * clamp is stage-lighting tuning, not asset repair.
 */
export function normalizeMaterials(document: Document): void {
  for (const material of document.getRoot().listMaterials()) {
    material.setEmissiveFactor([0, 0, 0]);
    material.setEmissiveTexture(null);
    material.setExtension("KHR_materials_specular", null);
  }
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === "KHR_materials_specular") extension.dispose();
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run lib/glb/__tests__/merge.test.ts`
Expected: PASS (all). If `map.get(...)` returns undefined, check gltf-transform's `mergeDocuments` return — it maps source properties to copies; the animation must be looked up by its source instance.

- [ ] **Step 8: Verify types/lint and commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.

```bash
git add package.json package-lock.json lib/glb/
git commit -m "feat(glb): isomorphic merge core — five clips onto one rig document"
```

---

### Task 2: `lib/glb/facing-bake.ts` (yaw normalization + measurement)

**Files:**
- Create: `lib/glb/__tests__/facing-bake.test.ts`
- Create: `lib/glb/facing-bake.ts`

**Interfaces:**
- Consumes: merged documents from `mergeCharacter` (Task 1); fixtures from Task 1.
- Produces:
  - `bakeClipFacing(document: Document, reference?: string): void` (default reference `"idle"`)
  - `clipYawSpreadDegrees(document: Document, reference?: string): number` — max |mean-yaw delta| of any clip vs the reference, in degrees. Task 5's gate and these tests share it.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/glb/__tests__/facing-bake.test.ts
import { describe, expect, it } from "vitest";
import { ANIMATION_CLIPS, type AnimationClip } from "../../meshy/types";
import type { Document } from "@gltf-transform/core";
import { bakeClipFacing, clipYawSpreadDegrees } from "../facing-bake";
import { mergeCharacter } from "../merge";
import { makeClipDoc, makeRigDoc } from "./fixtures";

/** Merged doc whose five clips face idle+0°, +38°, +42°, +2°, +39° (live-run shape). */
async function makeSkewedCharacter(): Promise<Document> {
  const yaw: Record<AnimationClip, number> = {
    idle: -43, walk: -5, run: -1, jump: -41, emote: -4,
  };
  const clips = Object.fromEntries(
    ANIMATION_CLIPS.map((clip) => [clip, makeClipDoc(yaw[clip])]),
  ) as Record<AnimationClip, Document>;
  return mergeCharacter(makeRigDoc(), clips);
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/glb/__tests__/facing-bake.test.ts`
Expected: FAIL — module `../facing-bake` not found.

- [ ] **Step 3: Implement `lib/glb/facing-bake.ts`**

Port of `components/scene/clip-facing.ts` onto gltf-transform accessors — same math, proven in `scripts/spike-merge-clips.mjs` (all five spike-knight clips measured an identical 50.25° after baking).

```ts
// lib/glb/facing-bake.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/glb/__tests__/facing-bake.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add lib/glb/facing-bake.ts lib/glb/__tests__/facing-bake.test.ts
git commit -m "feat(glb): bake per-clip yaw facing into merged documents"
```

---

### Task 3: `lib/glb/merge-browser.ts` + committed GLB test fixtures

**Files:**
- Create: `lib/glb/merge-browser.ts`
- Create: `lib/glb/__tests__/merge-browser.test.ts`
- Create: `scripts/generate-glb-fixtures.mts`
- Create (generated, committed): `tests/fixtures/glb/rig.glb`, `tests/fixtures/glb/idle.glb`, `tests/fixtures/glb/walk.glb`, `tests/fixtures/glb/run.glb`, `tests/fixtures/glb/jump.glb`, `tests/fixtures/glb/emote.glb`

**Interfaces:**
- Consumes: `mergeCharacter`, `normalizeMaterials` (Task 1); `bakeClipFacing` (Task 2); `ANIMATION_CLIPS`, `AnimationClip` from `lib/meshy/types`.
- Produces:
  - `interface CharacterUrls { rig: string; clips: Record<AnimationClip, string> }` (structurally identical to `CharacterSource` — defined here so `lib/` never imports from `components/`)
  - `mergeCharacterFromUrls(urls: CharacterUrls, fetchFn?: typeof fetch): Promise<Uint8Array>`
  - `saveGlb(bytes: Uint8Array, filename: string): void`
  - Committed tiny GLB fixtures under `tests/fixtures/glb/` (Task 7's Playwright test serves them).

- [ ] **Step 1: Write the failing driver tests**

```ts
// lib/glb/__tests__/merge-browser.test.ts
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { ANIMATION_CLIPS, type AnimationClip } from "../../meshy/types";
import { mergeCharacterFromUrls, type CharacterUrls } from "../merge-browser";
import { makeClipDoc, makeRigDoc } from "./fixtures";

const URLS: CharacterUrls = {
  rig: "/fake/rig.glb",
  clips: Object.fromEntries(
    ANIMATION_CLIPS.map((clip) => [clip, `/fake/${clip}.glb`]),
  ) as Record<AnimationClip, string>,
};

/** In-memory fetch: serves the synthetic docs as GLB bytes by URL. */
async function makeFetch(overrides: Partial<Record<string, number>> = {}) {
  const io = new NodeIO();
  const bodies = new Map<string, Uint8Array>([
    ["/fake/rig.glb", await io.writeBinary(makeRigDoc({ junkAnimation: true }))],
  ]);
  for (const [index, clip] of ANIMATION_CLIPS.entries()) {
    bodies.set(`/fake/${clip}.glb`, await io.writeBinary(makeClipDoc(index * 10)));
  }
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const status = overrides[url];
    if (status !== undefined) return new Response(null, { status });
    const body = bodies.get(url);
    if (!body) return new Response(null, { status: 404 });
    return new Response(body.slice().buffer as ArrayBuffer, { status: 200 });
  }) as typeof fetch;
  return fetchFn;
}

describe("mergeCharacterFromUrls", () => {
  it("returns one GLB with the five clips on one mesh", async () => {
    const bytes = await mergeCharacterFromUrls(URLS, await makeFetch());
    const merged = await new NodeIO().readBinary(bytes);
    expect(merged.getRoot().listAnimations().map((a) => a.getName()).sort()).toEqual(
      [...ANIMATION_CLIPS].sort(),
    );
    expect(merged.getRoot().listMeshes()).toHaveLength(1);
  });

  it("throws with the failing file's name on a bad fetch", async () => {
    const fetchFn = await makeFetch({ "/fake/walk.glb": 403 });
    await expect(mergeCharacterFromUrls(URLS, fetchFn)).rejects.toThrow(/walk.*403/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/glb/__tests__/merge-browser.test.ts`
Expected: FAIL — module `../merge-browser` not found.

- [ ] **Step 3: Implement `lib/glb/merge-browser.ts`**

```ts
// lib/glb/merge-browser.ts
/**
 * Browser driver for the game-ready download (US-10). Loaded ONLY via
 * `await import(...)` on download click — this module (and gltf-transform
 * with it) must never enter the initial bundle (ARCHITECTURE §5 revision).
 *
 * Reads the run's six GLBs through the same-origin asset proxy URLs the
 * caller passes in, merges + bakes in memory, returns GLB bytes. Textures
 * ship as Meshy made them — no recompression in the browser (sharp is
 * Node-only and stays out of client chunks by constraint).
 */
import { WebIO, type Document } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { ANIMATION_CLIPS, type AnimationClip } from "../meshy/types";
import { bakeClipFacing } from "./facing-bake";
import { mergeCharacter, normalizeMaterials } from "./merge";

/** Same shape as components/scene CharacterSource; redeclared so lib/ stays below components/. */
export interface CharacterUrls {
  rig: string;
  clips: Record<AnimationClip, string>;
}

export async function mergeCharacterFromUrls(
  urls: CharacterUrls,
  fetchFn: typeof fetch = fetch,
): Promise<Uint8Array> {
  const io = new WebIO().registerExtensions(KHRONOS_EXTENSIONS);

  const fetchGlb = async (label: string, url: string): Promise<Document> => {
    const response = await fetchFn(url);
    if (!response.ok) {
      throw new Error(`${label} download failed (${String(response.status)})`);
    }
    return io.readBinary(new Uint8Array(await response.arrayBuffer()));
  };

  const [rig, ...clipDocuments] = await Promise.all([
    fetchGlb("rig", urls.rig),
    ...ANIMATION_CLIPS.map((clip) => fetchGlb(clip, urls.clips[clip])),
  ]);
  const clips = Object.fromEntries(
    ANIMATION_CLIPS.map((clip, index) => [clip, clipDocuments[index]]),
  ) as Record<AnimationClip, Document>;

  const merged = await mergeCharacter(rig, clips);
  normalizeMaterials(merged);
  bakeClipFacing(merged);
  return io.writeBinary(merged);
}

/** Blob-anchor save; same-origin blob URLs always honor `download`. */
export function saveGlb(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: "model/gltf-binary",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/glb/__tests__/merge-browser.test.ts`
Expected: PASS. (`WebIO.readBinary/writeBinary` are environment-agnostic; Node 22 provides `Response`.)

- [ ] **Step 5: Generate and commit the Playwright GLB fixtures**

```ts
// scripts/generate-glb-fixtures.mts
/**
 * Write the tiny synthetic character GLBs Playwright serves in place of
 * live Meshy assets (tests/completion.spec.ts, US-10). Deterministic —
 * regenerate with: npx tsx scripts/generate-glb-fixtures.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ANIMATION_CLIPS } from "../lib/meshy/types";
import { makeClipDoc, makeRigDoc } from "../lib/glb/__tests__/fixtures";

const OUT_DIR = join(process.cwd(), "tests", "fixtures", "glb");
mkdirSync(OUT_DIR, { recursive: true });
const io = new NodeIO();

writeFileSync(join(OUT_DIR, "rig.glb"), await io.writeBinary(makeRigDoc({ junkAnimation: true })));
for (const [index, clip] of ANIMATION_CLIPS.entries()) {
  writeFileSync(join(OUT_DIR, `${clip}.glb`), await io.writeBinary(makeClipDoc(index * 10)));
}
console.log(`wrote ${String(ANIMATION_CLIPS.length + 1)} fixtures to ${OUT_DIR}`);
```

Run: `npx tsx scripts/generate-glb-fixtures.mts`
Expected: six files under `tests/fixtures/glb/`, each well under 10 KB (`ls -la tests/fixtures/glb/`).

- [ ] **Step 6: Full check + commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add lib/glb/merge-browser.ts lib/glb/__tests__/merge-browser.test.ts scripts/generate-glb-fixtures.mts tests/fixtures/glb/
git commit -m "feat(glb): browser merge driver + committed GLB test fixtures"
```

---

### Task 4: Manifest fields + `scripts/pregen/gameready.ts` + regenerate the gallery

**Files:**
- Modify: `scripts/pregen/manifest.ts` (interface + validator)
- Modify: `components/gallery/manifest.ts` (client parser, optional-field validation only — the download row is Task 6)
- Create: `scripts/pregen/__tests__/manifest-gameready.test.ts`
- Create: `scripts/pregen/gameready.ts`
- Modify: `package.json` (add script `"pregen:gameready": "tsx scripts/pregen/gameready.ts"`)
- Modify (generated): `public/gallery/manifest.json` + `public/gallery/<slug>/character.<hash>.glb` × 8

**Interfaces:**
- Consumes: `mergeCharacter`, `normalizeMaterials`, `bakeClipFacing` (Tasks 1–2); existing `readManifest`, `writeManifest`, `hashedGlbName`, `GALLERY_URL_PREFIX` from `scripts/pregen/manifest`; `createGalleryIO`, `formatBytes` from `scripts/pregen/optimize`.
- Produces:
  - `GalleryEntry` gains OPTIONAL `gameReadyPath?: string` and `gameReadySizeBytes?: number`. Optional is load-bearing: the committed manifest predates the fields, and `readManifest` validates before `gameready.ts` can add them. Task 5's gallery gate — not the shape validator — enforces presence on every entry.
  - `public/gallery/<slug>/character.<hash>.glb` for all 8 characters; manifest updated.
  - `npm run pregen:gameready` — rerun after any future gallery regeneration (full `npm run pregen` does NOT call it; the Task 5 gate catches forgetting).

- [ ] **Step 1: Write the failing validator tests**

```ts
// scripts/pregen/__tests__/manifest-gameready.test.ts
import { describe, expect, it } from "vitest";
import { galleryEntryErrors, type GalleryEntry } from "../manifest";

const BASE: GalleryEntry = {
  slug: "knight",
  prompt: "a knight",
  glbPath: "/gallery/knight/rig.abc12345.glb",
  clipPaths: {
    idle: "/gallery/knight/idle.a.glb",
    walk: "/gallery/knight/walk.a.glb",
    run: "/gallery/knight/run.a.glb",
    jump: "/gallery/knight/jump.a.glb",
    emote: "/gallery/knight/emote.a.glb",
  },
  creditTotal: 55,
  generationSeconds: 431,
  stageCredits: {
    preview: 20, refine: 10, remesh: 5, rig: 5,
    "animate:idle": 3, "animate:walk": 3, "animate:run": 3,
    "animate:jump": 3, "animate:emote": 3,
  },
  polyCount: 29015,
};

describe("galleryEntryErrors — game-ready fields", () => {
  it("accepts an entry without the optional fields (pre-derivation manifest)", () => {
    expect(galleryEntryErrors(BASE)).toEqual([]);
  });

  it("accepts an entry with both fields valid", () => {
    expect(
      galleryEntryErrors({
        ...BASE,
        gameReadyPath: "/gallery/knight/character.ab12cd34.glb",
        gameReadySizeBytes: 4_200_000,
      }),
    ).toEqual([]);
  });

  it("rejects a present-but-invalid gameReadyPath", () => {
    expect(galleryEntryErrors({ ...BASE, gameReadyPath: "" })).toContainEqual(
      expect.stringContaining("gameReadyPath"),
    );
  });

  it("rejects a present-but-invalid gameReadySizeBytes", () => {
    expect(galleryEntryErrors({ ...BASE, gameReadySizeBytes: -1 })).toContainEqual(
      expect.stringContaining("gameReadySizeBytes"),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/pregen/__tests__/manifest-gameready.test.ts`
Expected: the two rejection tests FAIL (unknown fields are currently silently accepted at the top level; the validator has no rules for them yet). The two acceptance tests may already pass — that's fine.

- [ ] **Step 3: Extend the pregen manifest shape + validator**

In `scripts/pregen/manifest.ts`, add to `GalleryEntry` (after `polyCount`):

```ts
  /** URL path of the merged single-file game-ready GLB (US-10). Absent until `npm run pregen:gameready` runs. */
  gameReadyPath?: string;
  /** Byte size of the game-ready GLB, for honest size copy in the UI. */
  gameReadySizeBytes?: number;
```

In `galleryEntryErrors`, after the existing number-field loop:

```ts
  if (entry.gameReadyPath !== undefined && !isNonEmptyString(entry.gameReadyPath)) {
    errors.push("gameReadyPath must be a non-empty string when present");
  }
  if (entry.gameReadySizeBytes !== undefined && !isNonNegativeNumber(entry.gameReadySizeBytes)) {
    errors.push("gameReadySizeBytes must be a non-negative number when present");
  }
```

In `components/gallery/manifest.ts` `parseGalleryManifest`, after the `stageCredits` check, mirror the same two present-but-invalid checks with `throw new Error(\`Gallery manifest ${label}: invalid gameReadyPath.\`)` / `...invalid gameReadySizeBytes.\`)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/pregen/__tests__/manifest-gameready.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Write the derivation script**

```ts
// scripts/pregen/gameready.ts
/**
 * Derive one game-ready GLB per gallery character (US-10) from the assets
 * ALREADY in public/gallery/ — zero Meshy credits:
 *
 *   optimized rig  → meshopt decodes on read; dequantize() drops
 *                    KHR_mesh_quantization; WebP re-encodes to PNG/JPEG
 *   stripped clips → still carry their full animations; merge core grafts
 *                    them onto the rig skeleton by bone name
 *
 * Output contract (enforced by check-gallery.mts): extensionsRequired
 * empty, PNG/JPEG textures only, five named clips, ≤ 8.5 MB.
 *
 * Run: npm run pregen:gameready   (rerun after any gallery regeneration)
 */
import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Document } from "@gltf-transform/core";
import { dequantize, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

import { bakeClipFacing, clipYawSpreadDegrees } from "../../lib/glb/facing-bake";
import { mergeCharacter, normalizeMaterials } from "../../lib/glb/merge";
import { ANIMATION_CLIPS, type AnimationClip } from "../../lib/meshy/types";
import { GALLERY_URL_PREFIX, hashedGlbName, readManifest, writeManifest } from "./manifest";
import { createGalleryIO, formatBytes } from "./optimize";

const GALLERY_DIR = join(process.cwd(), "public", "gallery");
export const GAME_READY_MAX_BYTES = 8.5 * 1024 * 1024;

function diskPath(urlPath: string): string {
  return join(process.cwd(), "public", ...urlPath.split("/").filter(Boolean));
}

const io = await createGalleryIO();
const manifest = readManifest(GALLERY_DIR);
if (manifest.length === 0) {
  throw new Error("empty gallery manifest — run npm run pregen first");
}

for (const entry of manifest) {
  const rig = await io.read(diskPath(entry.glbPath));
  // meshopt decoded on read; quantization is stored data — undo it or the
  // output requires KHR_mesh_quantization and stock loaders reject it.
  await rig.transform(dequantize());

  const clips = {} as Record<AnimationClip, Document>;
  for (const clip of ANIMATION_CLIPS) {
    clips[clip] = await io.read(diskPath(entry.clipPaths[clip]));
  }

  const merged = await mergeCharacter(rig, clips);
  normalizeMaterials(merged);
  bakeClipFacing(merged);

  // Core-glTF textures only. baseColor goes JPEG when every material is
  // opaque (spec size finding: PNG-2048 alone ran ~8 MB); anything else PNG.
  const opaque = merged
    .getRoot()
    .listMaterials()
    .every((material) => material.getAlphaMode() === "OPAQUE");
  await merged.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: opaque ? "jpeg" : "png",
      quality: 90,
      slots: /baseColor/,
    }),
    textureCompress({ encoder: sharp, targetFormat: "png", slots: /^(?!baseColor)/ }),
  );

  // Codec extensions are gone from the data; drop any lingering declarations.
  for (const extension of merged.getRoot().listExtensionsUsed()) {
    if (
      ["EXT_meshopt_compression", "KHR_mesh_quantization", "EXT_texture_webp"].includes(
        extension.extensionName,
      )
    ) {
      extension.dispose();
    }
  }

  const bytes = await io.writeBinary(merged);
  if (bytes.byteLength > GAME_READY_MAX_BYTES) {
    throw new Error(
      `${entry.slug}: game-ready GLB is ${formatBytes(bytes.byteLength)} — over the 8.5 MB gate`,
    );
  }
  const spread = clipYawSpreadDegrees(merged);
  if (spread > 0.5) {
    throw new Error(`${entry.slug}: clip yaw spread ${spread.toFixed(2)}° after bake`);
  }

  const characterDir = join(GALLERY_DIR, entry.slug);
  for (const stale of readdirSync(characterDir).filter((name) => name.startsWith("character."))) {
    unlinkSync(join(characterDir, stale));
  }
  const filename = hashedGlbName("character", bytes);
  writeFileSync(join(characterDir, filename), bytes);
  entry.gameReadyPath = `${GALLERY_URL_PREFIX}/${entry.slug}/${filename}`;
  entry.gameReadySizeBytes = bytes.byteLength;
  console.log(`${entry.slug}: ${formatBytes(bytes.byteLength)} → ${filename}`);
}

writeManifest(GALLERY_DIR, manifest);
console.log(`manifest updated — ${String(manifest.length)} game-ready GLBs`);
```

Add to `package.json` scripts (after `"pregen"`): `"pregen:gameready": "tsx scripts/pregen/gameready.ts",`

- [ ] **Step 6: Run the derivation over all 8 characters**

Run: `npm run pregen:gameready`
Expected: eight `slug: X MB → character.<hash>.glb` lines, all ≤ 8.5 MB, then the manifest-updated line. If a size gate trips, drop JPEG `quality` to 85 before any other change and rerun. If `textureCompress` rejects the `quality` option in the installed gltf-transform version, remove it (sharp's default JPEG quality is 80) and rerun.

- [ ] **Step 7: Spot-check one output by hand**

Run: `npx tsx -e "import { NodeIO } from '@gltf-transform/core'; import { readManifest } from './scripts/pregen/manifest'; const m = readManifest('public/gallery'); const io = new NodeIO(); const d = await io.read('public/' + m[0].gameReadyPath); console.log('required:', d.getRoot().listExtensionsRequired().map(e => e.extensionName)); console.log('anims:', d.getRoot().listAnimations().map(a => a.getName())); console.log('textures:', d.getRoot().listTextures().map(t => t.getMimeType()));"`
Expected: `required: []` (bare `NodeIO` with no extensions even *reading* it is itself the proof), five clip names, only `image/png` / `image/jpeg`.

- [ ] **Step 8: Full check + commit (manifest + 8 GLBs + code together — the client parser and committed manifest must move atomically)**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add scripts/pregen/manifest.ts scripts/pregen/gameready.ts scripts/pregen/__tests__/manifest-gameready.test.ts components/gallery/manifest.ts package.json public/gallery/
git commit -m "feat(pregen): derive game-ready character.glb per gallery character (no credits)"
```

---

### Task 5: `check-gallery.mts` game-ready gates

**Files:**
- Modify: `scripts/pregen/check-gallery.mts`

**Interfaces:**
- Consumes: `clipYawSpreadDegrees` (Task 2); `gameReadyPath`/`gameReadySizeBytes` (Task 4); existing `diskPath`, `io`, `failures` accumulator in the script.

- [ ] **Step 1: Add the gates**

In `scripts/pregen/check-gallery.mts`, add imports:

```ts
import { statSync } from "node:fs";
import { clipYawSpreadDegrees } from "../../lib/glb/facing-bake";
```

Inside the per-entry loop (after the existing clip checks), add:

```ts
  // US-10: the game-ready single-file GLB, gated on the spec's contract.
  if (!entry.gameReadyPath || entry.gameReadySizeBytes === undefined) {
    console.log(`  game-ready: MISSING — run npm run pregen:gameready`);
    failures += 1;
  } else {
    const gameReadyProblems: string[] = [];
    const merged = await io.read(diskPath(entry.gameReadyPath));
    const root = merged.getRoot();

    const required = root.listExtensionsRequired().map((e) => e.extensionName);
    if (required.length > 0) gameReadyProblems.push(`requires extensions: ${required.join(", ")}`);

    const names = root.listAnimations().map((a) => a.getName()).sort();
    const expected = [...ANIMATION_CLIPS].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      gameReadyProblems.push(`clips [${names.join(", ")}] != [${expected.join(", ")}]`);
    }
    if (root.listMeshes().length !== 1) gameReadyProblems.push(`${String(root.listMeshes().length)} meshes`);
    if (root.listSkins().length !== 1) gameReadyProblems.push(`${String(root.listSkins().length)} skins`);

    const badMime = root
      .listTextures()
      .map((t) => t.getMimeType())
      .filter((mime) => mime !== "image/png" && mime !== "image/jpeg");
    if (badMime.length > 0) gameReadyProblems.push(`non-core texture: ${badMime.join(", ")}`);

    const spread = clipYawSpreadDegrees(merged);
    if (spread > 0.5) gameReadyProblems.push(`yaw spread ${spread.toFixed(2)}°`);

    const actualBytes = statSync(diskPath(entry.gameReadyPath)).size;
    if (actualBytes > 8.5 * 1024 * 1024) gameReadyProblems.push(`${String(actualBytes)} bytes > 8.5 MB`);
    if (actualBytes !== entry.gameReadySizeBytes) {
      gameReadyProblems.push(`manifest says ${String(entry.gameReadySizeBytes)} bytes, file is ${String(actualBytes)}`);
    }

    if (gameReadyProblems.length > 0) {
      console.log(`  game-ready: FAIL — ${gameReadyProblems.join("; ")}`);
      failures += gameReadyProblems.length;
    } else {
      console.log(`  game-ready: ok (${names.length} clips, yaw spread ${spread.toFixed(2)}°)`);
    }
  }
```

Match the script's existing logging style when integrating (it prints per-entry sections; keep the same indentation and failure accumulation it already uses).

- [ ] **Step 2: Run the gate — it must pass against Task 4's output**

Run: `npx tsx scripts/pregen/check-gallery.mts`
Expected: exit 0, a `game-ready: ok` line for all 8 entries.

- [ ] **Step 3: Prove the gate bites**

Temporarily rename one `character.<hash>.glb` (e.g. `mv public/gallery/knight/character.*.glb /tmp/`), rerun, expect non-zero exit and a FAIL/MISSING line — a broken path must not pass silently. Restore the file, rerun, expect exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/pregen/check-gallery.mts
git commit -m "test(pregen): gate the game-ready GLBs in check-gallery"
```

---

### Task 6: Gallery download row

**Files:**
- Modify: `components/gallery/manifest.ts` (`galleryDownloadPlan`)
- Modify: `components/gallery/gallery-strip.tsx` (only if the row needs anything beyond the plan array — the existing `GalleryDownloads` maps `plan` generically, so likely no change)
- Create: `tests/unit/gameready-plan.test.ts`
- Modify: `tests/gallery.spec.ts` (download test)

**Interfaces:**
- Consumes: `gameReadyPath`/`gameReadySizeBytes` on `GalleryEntry` (Task 4); existing `DownloadEntry` shape `{ label, shortName, filename, url }`.
- Produces: `galleryDownloadPlan(entry)` returns the game-ready row FIRST when the fields are present: `{ label: "game-ready · X.X MB", shortName: "character.glb", filename: "<slug>.glb", url: entry.gameReadyPath }`, then the existing rig + five clip rows unchanged.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/gameready-plan.test.ts
import { describe, expect, it } from "vitest";
import { galleryDownloadPlan } from "../../components/gallery/manifest";
import type { GalleryEntry } from "../../scripts/pregen/manifest";

const ENTRY: GalleryEntry = {
  slug: "knight",
  prompt: "a knight",
  glbPath: "/gallery/knight/rig.abc12345.glb",
  clipPaths: {
    idle: "/gallery/knight/idle.a.glb",
    walk: "/gallery/knight/walk.a.glb",
    run: "/gallery/knight/run.a.glb",
    jump: "/gallery/knight/jump.a.glb",
    emote: "/gallery/knight/emote.a.glb",
  },
  creditTotal: 55,
  generationSeconds: 431,
  stageCredits: {
    preview: 20, refine: 10, remesh: 5, rig: 5,
    "animate:idle": 3, "animate:walk": 3, "animate:run": 3,
    "animate:jump": 3, "animate:emote": 3,
  },
  polyCount: 29015,
};

describe("galleryDownloadPlan — game-ready row", () => {
  it("leads with character.glb when the manifest has it", () => {
    const plan = galleryDownloadPlan({
      ...ENTRY,
      gameReadyPath: "/gallery/knight/character.ab12cd34.glb",
      gameReadySizeBytes: 4_404_019,
    });
    expect(plan[0]).toEqual({
      label: "game-ready · 4.2 MB",
      shortName: "character.glb",
      filename: "knight.glb",
      url: "/gallery/knight/character.ab12cd34.glb",
    });
    expect(plan).toHaveLength(7); // game-ready + rig + 5 clips
  });

  it("omits the row for a pre-derivation entry", () => {
    const plan = galleryDownloadPlan(ENTRY);
    expect(plan).toHaveLength(6);
    expect(plan[0].shortName).toBe("rig.glb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/gameready-plan.test.ts`
Expected: FAIL — plan has 6 rows, no game-ready entry.

- [ ] **Step 3: Implement the row**

In `components/gallery/manifest.ts`, extend `galleryDownloadPlan`:

```ts
export function galleryDownloadPlan(entry: GalleryEntry): DownloadEntry[] {
  const plan: DownloadEntry[] = [];
  if (entry.gameReadyPath !== undefined && entry.gameReadySizeBytes !== undefined) {
    plan.push({
      label: `game-ready · ${(entry.gameReadySizeBytes / 1024 / 1024).toFixed(1)} MB`,
      shortName: "character.glb",
      filename: `${entry.slug}.glb`,
      url: entry.gameReadyPath,
    });
  }
  plan.push(
    {
      label: "the character",
      shortName: "rig.glb",
      filename: `${entry.slug}-rig.glb`,
      url: entry.glbPath,
    },
    ...CLIP_NAMES.map((clip) => ({
      label: `${clip} clip`,
      shortName: `${clip}.glb`,
      filename: `${entry.slug}-${clip}.glb`,
      url: entry.clipPaths[clip],
    })),
  );
  return plan;
}
```

`GalleryDownloads` in `gallery-strip.tsx` renders whatever the plan returns — verify no change is needed there (the row is an anchor like the others; same states already styled).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/gameready-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Playwright download test**

In `tests/gallery.spec.ts`, following the file's existing patterns (it already opens the download disclosure via `gallery-download-toggle-<slug>`):

```ts
test("game-ready character.glb downloads as one real file", async ({ page }) => {
  await page.goto("/");
  // First gallery entry's card on stage → its download disclosure (desktop-only UI).
  await page.getByTestId("gallery-download-toggle-knight").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("gallery-download-knight.glb").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("knight.glb");
  const path = await download.path();
  const { statSync } = await import("node:fs");
  expect(statSync(path).size).toBeGreaterThan(1024 * 1024); // a real merged file, not a stub
});
```

Adjust the toggle/row test ids and any stage-selection setup to match how the existing gallery download tests in that file reach the disclosure — the `data-testid` for rows is `gallery-download-<filename>` (existing pattern: `gallery-download-${item.filename}`), so the new row is `gallery-download-knight.glb`.

- [ ] **Step 6: Run the Playwright test + axe**

Run: `npx playwright test tests/gallery.spec.ts`
Expected: PASS including the new test.
Run: `npm run test:a11y`
Expected: PASS (the disclosure list gained a row of an existing, already-audited shape; if `a11y.spec.ts` snapshots the open disclosure, update per its pattern).

- [ ] **Step 7: Visual verification + design-reviewer**

Run the dev server, screenshot the open gallery download disclosure at 1280 and 375 widths (375: the disclosure is desktop-only — confirm it still doesn't render). Then invoke the `design-reviewer` subagent on the change per CLAUDE.md. Address 🔴 findings before continuing.

- [ ] **Step 8: Full check + commit**

Run: `npm run typecheck && npm run lint && npm run test && bash scripts/check-tokens.sh`

```bash
git add components/gallery/manifest.ts components/gallery/gallery-strip.tsx tests/unit/gameready-plan.test.ts tests/gallery.spec.ts
git commit -m "feat(gallery): game-ready character.glb download row"
```

---

### Task 7: Live-run download row (merge on click)

**Files:**
- Modify: `components/pipeline/completion.ts` (`gameReadyFilename`)
- Modify: `components/pipeline/completion-actions.tsx` (button row + merge states)
- Modify: `tests/unit/` — extend wherever `downloadPlan`/`promptSlug` are unit-tested today; if nowhere, add cases to `tests/unit/gameready-plan.test.ts`
- Modify: `tests/completion.spec.ts` (Playwright)

**Interfaces:**
- Consumes: `mergeCharacterFromUrls`, `saveGlb`, `CharacterUrls` (Task 3 — via dynamic import ONLY); existing `generatedCharacterSource(run)` (returns proxied rig+clip URLs or null), `promptSlug`, `runAssetsExpired`; fixtures `tests/fixtures/glb/*.glb` (Task 3).
- Produces: `gameReadyFilename(run: PipelineRun): string` → `"<prompt-slug>.glb"`; a `download-gameready` test-id button as the first item in the `download-list` disclosure.

- [ ] **Step 1: Write the failing unit test**

Add to `tests/unit/gameready-plan.test.ts`:

```ts
import { gameReadyFilename } from "../../components/pipeline/completion";
// makeSucceededRun-style fixture: reuse the run fixture helper the existing
// completion unit tests use; if none exists in tests/unit, build the minimal
// PipelineRun literal with prompt "A Sky Knight!" and any stage contents —
// gameReadyFilename reads only run.prompt.

describe("gameReadyFilename", () => {
  it("derives the filename from the prompt slug", () => {
    expect(gameReadyFilename({ prompt: "A Sky Knight!" } as never)).toBe("a-sky-knight.glb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/gameready-plan.test.ts`
Expected: FAIL — `gameReadyFilename` not exported.

- [ ] **Step 3: Implement `gameReadyFilename`**

In `components/pipeline/completion.ts`, after `downloadPlan`:

```ts
/** Filename for the merged single-file download (US-10): "a-sky-knight.glb". */
export function gameReadyFilename(run: PipelineRun): string {
  return `${promptSlug(run.prompt)}.glb`;
}
```

Run: `npx vitest run tests/unit/gameready-plan.test.ts` — expect PASS.

- [ ] **Step 4: Add the button row to `completion-actions.tsx`**

State + handler (inside `CompletionActions`, next to the existing `copied` state):

```tsx
const [mergeState, setMergeState] = useState<"idle" | "merging" | "error">("idle");

const handleGameReady = () => {
  const source = generatedCharacterSource(run);
  if (source === null || mergeState === "merging") return;
  setMergeState("merging");
  void (async () => {
    try {
      // Lazy: gltf-transform enters the page ONLY on this click (ARCHITECTURE §5).
      const { mergeCharacterFromUrls, saveGlb } = await import("../../lib/glb/merge-browser");
      saveGlb(await mergeCharacterFromUrls(source), gameReadyFilename(run));
      setMergeState("idle");
    } catch {
      setMergeState("error");
    }
  })();
};
```

Add `gameReadyFilename` and `generatedCharacterSource` to the existing `./completion` import. In the `downloadsOpen` list, insert as the FIRST `<li>` (before `plan.map`), rendered only when `generatedCharacterSource(run) !== null` (reuse the `playable` variable — it is exactly that check plus `!expired`, and the list only renders when not expired):

```tsx
{playable && (
  <li key="game-ready">
    <button
      type="button"
      data-testid="download-gameready"
      onClick={handleGameReady}
      disabled={mergeState === "merging"}
      className="group flex w-full items-baseline justify-between gap-3 rounded-sm px-1 py-1 text-left font-mono text-xs text-muted transition-colors duration-(--duration-fast) ease-(--ease-stage) hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:opacity-80 disabled:cursor-progress disabled:opacity-60 motion-reduce:transition-none"
    >
      <span className="shrink-0 text-foreground group-hover:text-accent">character.glb</span>
      <span className="truncate" data-testid="download-gameready-status">
        {mergeState === "merging"
          ? "Merging 6 files…"
          : mergeState === "error"
            ? "Merge failed. Click to retry."
            : "game-ready · all 5 clips"}
      </span>
    </button>
  </li>
)}
```

Copy stays mono and stateful per DESIGN.md; the row mirrors the anchor rows' layout classes so the list reads as one system. Error is inline in the row; clicking again retries.

- [ ] **Step 5: Add the Playwright test**

In `tests/completion.spec.ts`, using the file's existing `makeSucceededRun` + `seedRun` helpers and route interception. The seeded run's stage `modelUrl`s point at `https://assets.meshy.ai/...` forms (check the existing fixture — `generatedCharacterSource` proxies them to `/api/meshy-asset?url=...`); serve the Task 3 fixtures:

```ts
test("game-ready download merges six files into one", async ({ page }) => {
  await seedRun(page, makeSucceededRun(60_000));
  await page.route("**/api/meshy-asset*", async (route) => {
    const url = new URL(route.request().url());
    const target = url.searchParams.get("url") ?? "";
    // Fixture URLs carry the stage name; map rig → rig.glb, animate:<clip> → <clip>.glb.
    const { readFileSync } = await import("node:fs");
    const name = ["idle", "walk", "run", "jump", "emote"].find((clip) => target.includes(clip)) ?? "rig";
    await route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      body: readFileSync(`tests/fixtures/glb/${name}.glb`),
    });
  });
  await page.goto("/");
  await page.getByTestId("download-toggle").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-gameready").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.glb$/);
});
```

Check `makeSucceededRun`'s actual `modelUrl` values first: if the rig URL happens to contain a clip substring (e.g. "rig-idle"), key the mapping on the stage marker in the URL instead — the intent is: the five animate URLs serve their clip fixture, the rig URL serves `rig.glb`. If the fixture URLs aren't `assets.meshy.ai` forms (so no proxying happens), route-match the raw URLs instead of `/api/meshy-asset*` — assert against what `generatedCharacterSource` actually produces for the fixture rather than assuming.

Also add the failure path:

```ts
test("game-ready merge failure shows inline retry, no navigation", async ({ page }) => {
  await seedRun(page, makeSucceededRun(60_000));
  await page.route("**/api/meshy-asset*", (route) => route.fulfill({ status: 403 }));
  await page.goto("/");
  await page.getByTestId("download-toggle").click();
  await page.getByTestId("download-gameready").click();
  await expect(page.getByTestId("download-gameready-status")).toHaveText(
    "Merge failed. Click to retry.",
  );
});
```

- [ ] **Step 6: Run the Playwright tests + axe**

Run: `npx playwright test tests/completion.spec.ts`
Expected: PASS including both new tests (existing ones untouched).
Run: `npm run test:a11y`
Expected: PASS.

- [ ] **Step 7: Visual verification + design-reviewer**

Screenshot the open download disclosure with the new row in its three states (idle / merging / error — force merging by throttling, or temporarily assert via the error-route test's screenshot) at 1280 and 375. Invoke the `design-reviewer` subagent. Address 🔴 findings.

- [ ] **Step 8: Full check + commit**

Run: `npm run typecheck && npm run lint && npm run test && bash scripts/check-tokens.sh`

```bash
git add components/pipeline/completion.ts components/pipeline/completion-actions.tsx tests/unit/gameready-plan.test.ts tests/completion.spec.ts
git commit -m "feat(completion): merge-on-click game-ready download for live runs"
```

---

### Task 8: ARCHITECTURE revision, docs, reviews, final verification

**Files:**
- Modify: `docs/ARCHITECTURE.md` (§5 + trade-off log)
- Modify: `scripts/pregen/README.md`
- Modify: `docs/backlog/phase-2-ship.md` (mark P2 #8 done — LAST step)

**Interfaces:** none new — this task closes the loop.

- [ ] **Step 1: Revise ARCHITECTURE §5 + trade-off log**

Read `docs/ARCHITECTURE.md` §5 and locate the "no client-side transform pass" wording (also quoted in `docs/specs/us-05-play-and-download.md` CONTEXT). Replace the blanket statement with the narrowed rule, and append a trade-off log entry (match the log's existing entry format/date style):

Narrowed rule for §5: "Client-side GLB transforms are allowed only behind an explicit download click, loaded via dynamic import so gltf-transform never enters the initial bundle or the critical path. Pipeline and play flows still never transform client-side."

Trade-off log entry content: US-10 (2026-08-04) supersedes the US-05-era blanket ban. Rationale: the ban's intent was protecting first-frame time and bundle size; a click-triggered lazy chunk threatens neither, and the alternative (server-side merge) violates the dumb-proxy/no-server-orchestration decisions. Consequences: `@gltf-transform/*` promoted to `dependencies` (still absent from the initial bundle); `sharp`/`meshoptimizer` remain dev-only.

- [ ] **Step 2: Document the pregen step**

In `scripts/pregen/README.md`, add a short section: `npm run pregen:gameready` derives `character.<hash>.glb` per character from committed gallery assets (zero credits), must be rerun after any gallery regeneration, and `check-gallery.mts` fails if it's stale or missing.

- [ ] **Step 3: Bundle-impact proof**

Run: `npm run build`
Compare the route table against the Task 1 Step 2 baseline: first-load JS for `/` must be unchanged (±1 kB). The merge code must appear only as its own lazy chunk. If first-load grew, find the static import that leaked `lib/glb/merge-browser` (only the `await import` in `completion-actions.tsx` may reference it) and fix before proceeding.

- [ ] **Step 4: architecture-reviewer**

Invoke the `architecture-reviewer` subagent (per CLAUDE.md) on: dependency promotion, §5 revision, the new `lib/glb/` layer, and the pregen derivation step. Address 🔴 findings before continuing.

- [ ] **Step 5: Full verification suite**

Run, in order, all of:

```bash
npm run typecheck
npm run lint
npm run test
npx playwright test
bash scripts/check-tokens.sh
npx tsx scripts/pregen/check-gallery.mts
```

Expected: all green. Fix anything red before Step 6 — do not mark done over a failure (CLAUDE.md verification rule).

- [ ] **Step 6: Manual stock-loader check (spec acceptance)**

Serve the repo root's parent (`python3 -m http.server 8123` from `meshyai/`) and open `http://localhost:8123/glb-merge-test/` — point its loader path at one downloaded gallery `character.glb` (edit the fixture URL in the HTML or copy the file over `spike-output/character.glb`). The viewer uses stock `GLTFLoader` with no decoders: five clips must play with consistent facing. Repeat once with a live-run merged file if a real run is available; otherwise note that half as pending a live run.

- [ ] **Step 7: Mark done + commit**

Mark P2 #8 `[x]` in `docs/backlog/phase-2-ship.md`.

```bash
git add -f docs/ARCHITECTURE.md docs/backlog/phase-2-ship.md
git add scripts/pregen/README.md
git commit -m "docs: US-10 done — ARCHITECTURE §5 revision + pregen README + backlog"
```

---

## Self-Review Notes (already applied)

- Spec req 1–8 → Tasks 1, 2, 4, 5, 6, 7, 8 respectively (req 8's test matrix is spread across every task's test steps; the seeded-envelope Playwright test is Task 7 Step 5).
- `gameReadyPath` optionality (plan) vs "manifest entries gain fields" (spec): optional-with-QA-gate is the only order-safe reading — `readManifest` validates the committed manifest before the derivation script can run. The Task 5 gate enforces the spec's real intent: every entry has a valid file.
- Type consistency: `CharacterUrls` (lib) is structurally identical to `CharacterSource` (components) by design; `generatedCharacterSource`'s return feeds `mergeCharacterFromUrls` without a cast because both are `{ rig: string; clips: Record<AnimationClip, string> }` with `AnimationClip === ClipName`.
- Playwright steps that depend on unseen fixture internals (`makeSucceededRun` URL shapes, a11y snapshot patterns) say what to verify and what the intent is rather than asserting blind — the executor must read those files first.
