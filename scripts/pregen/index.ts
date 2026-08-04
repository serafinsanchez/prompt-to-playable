/**
 * Gallery pregen CLI — `npm run pregen`.
 *
 * Modes:
 *
 *   npm run pregen -- --offline   Rebuild the gallery from spike-output/
 *                                 (no network, no credits). Seeds the knight.
 *   npm run pregen                LIVE generation of every prompt not already
 *                                 in the manifest. Needs MESHY_API_KEY in the
 *                                 environment (local only — never deployed,
 *                                 docs/ARCHITECTURE.md §4 Secrets). ~55
 *                                 credits per character. TASK-06b owns this.
 *   npm run pregen -- --test      Zero-credit smoke against Meshy test mode.
 *                                 Note: the test-mode dummy mesh fails rig
 *                                 pose estimation, so this exercises
 *                                 preview → refine → remesh only.
 *
 * Crashed live runs resume for free: every pipeline snapshot is persisted to
 * .pregen/runs/<slug>.json (versioned via lib/meshy/storage), so a restart
 * keeps polling the same paid task ids instead of re-creating them.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createMeshyClient } from "../../lib/meshy/client";
import { loadRun, saveRun, type StorageAdapter } from "../../lib/meshy/storage";
import { createDirectTransport } from "../../lib/meshy/transport";
import type { PipelineRun } from "../../lib/meshy/types";
import {
  readManifest,
  receiptsFromRun,
  upsertEntry,
  writeCharacterFiles,
  writeManifest,
  type GalleryEntry,
} from "./manifest";
import { seedKnightFromSpike } from "./offline";
import { createGalleryIO, formatBytes, optimizeCharacter } from "./optimize";
import { GALLERY_PROMPTS, type GalleryPrompt } from "./prompts";
import { generateCharacter, type RunnerDeps } from "./runner";

const TEST_MODE_KEY = "msy_dummy_api_key_for_test_mode_12345678";
const SPIKE_DIR = join(process.cwd(), "spike-output");
const GALLERY_DIR = join(process.cwd(), "public", "gallery");
/** Local scratch — gitignored. Task ids live here between crashed runs. */
const STATE_DIR = join(process.cwd(), ".pregen", "runs");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const testMode = args.includes("--test");

  if (offline) {
    console.log("offline mode: rebuilding gallery from spike-output/ (no network, no credits)");
    const entry = await seedKnightFromSpike({
      spikeDir: SPIKE_DIR,
      galleryDir: GALLERY_DIR,
      log: (line) => { console.log(line); },
    });
    console.log(`done — ${entry.glbPath} + 5 clips + manifest.json`);
    return;
  }

  const apiKey = testMode ? TEST_MODE_KEY : (process.env.MESHY_API_KEY ?? "");
  if (apiKey === "") {
    console.error(
      "MESHY_API_KEY is not set. Export it for a live run (~55 credits/character),\n" +
        "or use `npm run pregen -- --offline` / `--test` for the zero-credit paths.",
    );
    process.exitCode = 1;
    return;
  }
  if (testMode) {
    console.log("test mode: zero credits; expect the pipeline to stop at rig (dummy mesh fails pose estimation)");
  }

  const client = createMeshyClient(createDirectTransport({ apiKey }));
  const io = await createGalleryIO();
  const deps: RunnerDeps = {
    client,
    clock: { now: () => Date.now() },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    fetchGlb: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`GLB download failed: HTTP ${String(response.status)}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    loadRun: (slug) => loadRun(fileStorage(slug)),
    saveRun: (slug, run: PipelineRun) => { saveRun(fileStorage(slug), run); },
    log: (line) => { console.log(`[${new Date().toISOString()}] ${line}`); },
  };

  const balance = await client.getBalance().catch(() => null);
  console.log(`balance before: ${balance ?? "unknown"}`);

  let manifest = readManifest(GALLERY_DIR);
  const done = new Set(manifest.map((entry) => entry.slug));
  const queue = GALLERY_PROMPTS.filter((prompt) => !done.has(prompt.slug));
  console.log(`${String(queue.length)} of ${String(GALLERY_PROMPTS.length)} prompts to generate (${String(done.size)} already in manifest)`);

  const dropped: string[] = [];
  for (const spec of queue) {
    console.log(`\n=== ${spec.slug}: "${spec.prompt}"`);
    // Spike failure pattern (TASK-06b req 4): failed tasks auto-refund and the
    // snapshot keeps paid task ids, so attempt 2 resumes instead of re-spending.
    // After 2 failed attempts the character is dropped and logged, not fought —
    // and the rest of the queue still runs.
    const raw = await attemptCharacter(spec, deps);
    if (raw === null) {
      dropped.push(spec.slug);
      continue;
    }

    const optimized = await optimizeCharacter(io, raw);
    for (const [name, { bytesIn, bytesOut }] of Object.entries(optimized.stats)) {
      console.log(`  ${name.padEnd(6)} ${formatBytes(bytesIn).padStart(9)} → ${formatBytes(bytesOut)}`);
    }

    const paths = writeCharacterFiles(GALLERY_DIR, spec.slug, optimized);
    const entry: GalleryEntry = {
      slug: spec.slug,
      prompt: spec.prompt,
      glbPath: paths.glbPath,
      clipPaths: paths.clipPaths,
      ...receiptsFromRun(raw.run),
      polyCount: optimized.polyCount,
    };
    manifest = upsertEntry(manifest, entry);
    writeManifest(GALLERY_DIR, manifest);
    console.log(`  manifest: upserted "${spec.slug}" (${String(entry.creditTotal)} credits, ${String(entry.generationSeconds)}s active)`);

    // The entry is safely in the gallery — drop the scratch state so a future
    // run doesn't resume a finished pipeline.
    rmSync(stateFile(spec.slug), { force: true });
  }

  const balanceAfter = await client.getBalance().catch(() => null);
  console.log(`\nbalance after: ${balanceAfter ?? "unknown"}`);
  console.log(`gallery: ${String(manifest.length)} entries in ${GALLERY_DIR}`);
  if (dropped.length > 0) {
    console.log(`dropped after 2 failed attempts: ${dropped.join(", ")}`);
    process.exitCode = 1;
  }
}

/** Run one character with a single resume-retry; null = dropped after 2 failed attempts. */
async function attemptCharacter(
  spec: GalleryPrompt,
  deps: RunnerDeps,
): Promise<Awaited<ReturnType<typeof generateCharacter>> | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await generateCharacter(spec, deps);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${spec.slug}] attempt ${String(attempt)}/2 failed: ${message}`);
      if (attempt === 2) console.error(`[${spec.slug}] dropped (failed tasks auto-refund)`);
    }
  }
  return null;
}

function stateFile(slug: string): string {
  return join(STATE_DIR, `${slug}.json`);
}

/**
 * lib/meshy/storage is written against Web Storage; a five-line file adapter
 * makes its versioned envelope work for Node scratch files too.
 */
function fileStorage(slug: string): StorageAdapter {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = stateFile(slug);
  return {
    getItem: () => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    setItem: (_key, value) => { writeFileSync(path, value); },
    removeItem: () => { rmSync(path, { force: true }); },
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
