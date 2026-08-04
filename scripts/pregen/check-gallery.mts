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

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
}

if (failures > 0) {
  console.error(`\n${String(failures)} QA failure(s)`);
  process.exit(1);
}
console.log(`\nall ${String(manifest.length)} characters pass binding QA`);
