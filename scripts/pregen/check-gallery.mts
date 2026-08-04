/**
 * Gallery binding QA (TASK-06b) — the `scripts/spike/check-binding.mts`
 * pattern pointed at the committed gallery instead of spike-output/.
 *
 * For every manifest entry it verifies, offline and for free:
 *
 * - the rig GLB decodes (meshopt) and still carries its textures;
 * - each of the five clip GLBs holds exactly one animation whose channel
 *   target nodes ALL exist in the rig skeleton (zero missing = clips bind);
 * - clip durations, flagging the short run loop (~0.77s — strobe QA note).
 *
 * Run: npx tsx scripts/pregen/check-gallery.mts
 * Exits non-zero if any clip fails to bind or any file fails to decode.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { clipYawSpreadDegrees } from "../../lib/glb/facing-bake";
import { ANIMATION_CLIPS } from "../../lib/meshy/types";
import { assertValidManifest } from "./manifest";
import { createGalleryIO } from "./optimize";

const GALLERY_DIR = join(process.cwd(), "public", "gallery");

/** Manifest paths are URL paths (/gallery/...); map them onto public/. */
function diskPath(urlPath: string): string {
  return join(process.cwd(), "public", ...urlPath.split("/").filter(Boolean));
}

const manifest: unknown = JSON.parse(readFileSync(join(GALLERY_DIR, "manifest.json"), "utf8"));
assertValidManifest(manifest);

const io = await createGalleryIO();
let failures = 0;

for (const entry of manifest) {
  const rig = await io.read(diskPath(entry.glbPath));
  const rigNodes = new Set(rig.getRoot().listNodes().map((node) => node.getName()));
  const textures = rig.getRoot().listTextures();
  const triangles = rig
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? 0) / 3, 0);

  const clipReports: string[] = [];
  for (const clip of ANIMATION_CLIPS) {
    const doc = await io.read(diskPath(entry.clipPaths[clip]));
    const animations = doc.getRoot().listAnimations();
    if (animations.length !== 1) {
      clipReports.push(`${clip}: EXPECTED 1 ANIMATION, GOT ${String(animations.length)}`);
      failures += 1;
      continue;
    }
    const anim = animations[0];
    const targets = new Set(
      anim.listChannels().map((channel) => channel.getTargetNode()?.getName() ?? "?"),
    );
    const missing = [...targets].filter((target) => !rigNodes.has(target));
    let duration = 0;
    for (const sampler of anim.listSamplers()) {
      const input = sampler.getInput();
      if (input) duration = Math.max(duration, input.getMax([0])[0] ?? 0);
    }
    if (missing.length > 0) failures += 1;
    clipReports.push(
      `${clip} ${duration.toFixed(2)}s targets=${String(targets.size)}` +
        (missing.length > 0 ? ` MISSING=${missing.slice(0, 5).join(",")}` : ""),
    );
  }

  console.log(
    `${entry.slug}: rig nodes=${String(rigNodes.size)} tris=${String(Math.round(triangles))} ` +
      `textures=${String(textures.length)} | ${clipReports.join(" | ")}`,
  );
  if (textures.length === 0) {
    console.log(`${entry.slug}: WARNING — rig has no textures (optimization stripped them?)`);
    failures += 1;
  }

  // US-10: the game-ready single-file GLB, gated on the spec's contract.
  if (!entry.gameReadyPath || entry.gameReadySizeBytes === undefined) {
    console.log(`${entry.slug}: game-ready MISSING — run npm run pregen:gameready`);
    failures += 1;
  } else {
    const gameReadyProblems: string[] = [];
    let merged;
    try {
      merged = await io.read(diskPath(entry.gameReadyPath));
    } catch (err) {
      console.log(`${entry.slug}: game-ready FAIL — failed to decode: ${String(err)}`);
      failures += 1;
      continue;
    }
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

    let spread = 0;
    try {
      spread = clipYawSpreadDegrees(merged);
      if (spread > 0.5) gameReadyProblems.push(`yaw spread ${spread.toFixed(2)}°`);
    } catch (err) {
      gameReadyProblems.push(`yaw spread check threw: ${String(err)}`);
    }

    const actualBytes = statSync(diskPath(entry.gameReadyPath)).size;
    if (actualBytes > 8.5 * 1024 * 1024) gameReadyProblems.push(`${String(actualBytes)} bytes > 8.5 MB`);
    if (actualBytes !== entry.gameReadySizeBytes) {
      gameReadyProblems.push(`manifest says ${String(entry.gameReadySizeBytes)} bytes, file is ${String(actualBytes)}`);
    }

    if (gameReadyProblems.length > 0) {
      console.log(`${entry.slug}: game-ready FAIL — ${gameReadyProblems.join("; ")}`);
      failures += gameReadyProblems.length;
    } else {
      console.log(`${entry.slug}: game-ready ok (${names.length} clips, yaw spread ${spread.toFixed(2)}°)`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${String(failures)} QA failure(s)`);
  process.exit(1);
}
console.log(`\nall ${String(manifest.length)} characters pass binding QA`);
