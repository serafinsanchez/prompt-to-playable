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
