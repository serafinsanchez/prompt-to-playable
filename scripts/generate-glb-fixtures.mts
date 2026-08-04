/**
 * Write the tiny synthetic character GLBs Playwright serves in place of
 * live Meshy assets (tests/completion.spec.ts, US-10). Deterministic —
 * regenerate with: npx tsx scripts/generate-glb-fixtures.mts
 *
 * Never import `@gltf-transform/core` directly in this file: `writeFixtureGlb`/
 * `readFixtureGlb` in lib/glb/__tests__/fixtures.ts pin all I/O to the same
 * module instance the builders use. A second `import { NodeIO } from
 * "@gltf-transform/core"` here can resolve to a different instance under
 * `npx tsx`, and NodeIO's writer then silently drops every property that
 * isn't `instanceof` its own classes — no error, just a corrupt GLB with 0
 * accessors. (Caught in review: all five clip fixtures came out byte-identical.)
 * The self-check below exists to make that class of corruption impossible to
 * recommit silently.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANIMATION_CLIPS } from "../lib/meshy/types";
import {
  makeClipDoc,
  makeRigDoc,
  readFixtureGlb,
  writeFixtureGlb,
} from "../lib/glb/__tests__/fixtures";

const OUT_DIR = join(process.cwd(), "tests", "fixtures", "glb");
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(join(OUT_DIR, "rig.glb"), await writeFixtureGlb(makeRigDoc({ junkAnimation: true })));
for (const [index, clip] of ANIMATION_CLIPS.entries()) {
  writeFileSync(join(OUT_DIR, `${clip}.glb`), await writeFixtureGlb(makeClipDoc(index * 10)));
}
console.log(`wrote ${String(ANIMATION_CLIPS.length + 1)} fixtures to ${OUT_DIR}`);

// --- Self-check: read the COMMITTED bytes back off disk and verify they're
// not the silently-stripped shape the dual-module-instance bug produces. ---

function fail(message: string): never {
  console.error(`generate-glb-fixtures: FAILED self-check — ${message}`);
  process.exit(1);
}

async function checkFixture(filename: string): Promise<Uint8Array> {
  const bytes = readFileSync(join(OUT_DIR, filename));
  const document = await readFixtureGlb(new Uint8Array(bytes));
  const root = document.getRoot();

  if (root.listAccessors().length === 0) {
    fail(`${filename}: 0 accessors (write silently dropped them — check module instances)`);
  }

  const mesh = root.listMeshes()[0];
  const primitive = mesh?.listPrimitives()[0];
  if (!primitive?.getAttribute("POSITION")) {
    fail(`${filename}: mesh primitive has no POSITION attribute`);
  }

  const animations = root.listAnimations();
  if (animations.length === 0) fail(`${filename}: no animations`);
  for (const animation of animations) {
    for (const sampler of animation.listSamplers()) {
      if (!sampler.getInput() || !sampler.getOutput()) {
        fail(`${filename}: animation "${animation.getName()}" has a sampler missing input/output`);
      }
    }
  }

  return new Uint8Array(bytes);
}

await checkFixture("rig.glb");
const clipBytesByName = new Map<string, Uint8Array>();
for (const clip of ANIMATION_CLIPS) {
  clipBytesByName.set(clip, await checkFixture(`${clip}.glb`));
}

const clipHashes = new Set(
  [...clipBytesByName.values()].map((bytes) => Buffer.from(bytes).toString("base64")),
);
if (clipHashes.size !== ANIMATION_CLIPS.length) {
  fail(
    `clip fixtures are not distinct — ${String(ANIMATION_CLIPS.length - clipHashes.size)} pair(s) byte-identical (dual-module-instance write bug)`,
  );
}

console.log(
  `self-check passed: accessors present, POSITION present, samplers bound, ${String(clipHashes.size)} distinct clip files`,
);
