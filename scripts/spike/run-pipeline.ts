/**
 * TASK-05 day-0 spike runner: one biped character through the real pipeline
 * (preview → refine+PBR → rig → animate ×5), driven by the same
 * lib/meshy state machine the product will use.
 *
 * Usage:
 *   MESHY_API_KEY=msy_... npx tsx scripts/spike/run-pipeline.ts [--prompt "..."]
 *   npx tsx scripts/spike/run-pipeline.ts --test        # test-mode key, 0 credits
 *   ... run-pipeline.ts --from-refine <task_id>   # resume: remesh → rig → animate
 *
 * --from-refine exists because live refine outputs exceed rigging's 300k-face
 * limit — the resume lane inserts a remesh without re-spending preview/refine
 * credits. It drives the client directly (the state machine gets its remesh
 * stage in a P1 spec once this spike's evidence is logged).
 *
 * Every GLB is downloaded into spike-output/ the moment its stage hits
 * SUCCEEDED (signed URLs die after 3 days — never trust them later).
 * Prints per-stage credits, timings, poly counts, and balance before/after.
 */

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NodeIO } from "@gltf-transform/core";

import { createMeshyClient, taskGlbUrl, type MeshyClient } from "../../lib/meshy/client";
import { createPipeline, POLL_INTERVAL_MS } from "../../lib/meshy/pipeline";
import { createDirectTransport } from "../../lib/meshy/transport";
import {
  ANIMATION_CLIPS,
  NoMoreConcurrentTasksError,
  PIPELINE_STAGES,
  RateLimitExceededError,
  type MeshyTask,
  type PipelineRun,
  type StageId,
} from "../../lib/meshy/types";

const TEST_MODE_KEY = "msy_dummy_api_key_for_test_mode_12345678";
const DEFAULT_PROMPT =
  "low-poly knight in full plate armor, standing upright, arms at sides, facing forward";
const OUTPUT_DIR = join(process.cwd(), "spike-output");
/** The /spike harness fetches rig + clip GLBs from here (gitignored). */
const HARNESS_DIR = join(process.cwd(), "public", "spike");
/** Rigging rejects inputs over 300k faces; remesh to game-ready density. */
const REMESH_TARGET_POLYCOUNT = 30_000;

function parseArgs(argv: string[]): {
  prompt: string;
  testMode: boolean;
  fromRefine: string | null;
} {
  const testMode = argv.includes("--test");
  const promptIndex = argv.indexOf("--prompt");
  const prompt = promptIndex !== -1 ? argv[promptIndex + 1] : undefined;
  if (promptIndex !== -1 && !prompt) throw new Error("--prompt needs a value");
  const fromIndex = argv.indexOf("--from-refine");
  const fromRefine = fromIndex !== -1 ? argv[fromIndex + 1] : null;
  if (fromIndex !== -1 && !fromRefine) throw new Error("--from-refine needs a task id");
  return { prompt: prompt ?? DEFAULT_PROMPT, testMode, fromRefine };
}

function resolveKey(testMode: boolean): string {
  if (testMode) return TEST_MODE_KEY;
  const key = process.env.MESHY_API_KEY;
  if (!key) {
    console.error(
      "MESHY_API_KEY is not set. Export it, or pass --test for the zero-credit test-mode key.",
    );
    process.exit(1);
  }
  return key;
}

function stageFileName(stage: string): string {
  return `${stage.replace(":", "-")}.glb`;
}

async function download(url: string, stage: string): Promise<{ bytes: number; file: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed for ${stage}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const file = join(OUTPUT_DIR, stageFileName(stage));
  writeFileSync(file, buffer);
  return { bytes: buffer.byteLength, file };
}

/** Sum triangle counts across every mesh primitive in a GLB. */
async function countTriangles(file: string): Promise<number> {
  const io = new NodeIO();
  const document = await io.read(file);
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const vertexCount = indices?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
      triangles += Math.floor(vertexCount / 3);
    }
  }
  return triangles;
}

function formatMs(ms: number): string {
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(0)}s`;
}

/** Poll one task to a terminal status, honoring both 429 flavors. */
async function pollUntilTerminal(
  get: () => Promise<MeshyTask>,
  label: string,
): Promise<MeshyTask> {
  let lastLine = "";
  for (;;) {
    try {
      const task = await get();
      const line = `${task.status} ${task.progress}%`;
      if (line !== lastLine) {
        lastLine = line;
        console.log(`[${new Date().toISOString()}] ${label}: ${line}`);
      }
      if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELED") {
        return task;
      }
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        console.log(`  (${label}: rate-limited — backing off 8s)`);
        await new Promise((resolve) => setTimeout(resolve, 8000));
      } else if (error instanceof NoMoreConcurrentTasksError) {
        console.log(`  (${label}: Meshy queue full — waiting)`);
      } else {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

interface ResumeStageReport {
  stage: string;
  taskId: string;
  credits: number | null;
  ms: number;
  bytes: number | null;
  triangles: number | null;
  error: string | null;
}

/**
 * Resume lane: remesh → rig → animate ×5 chained from an already-paid refine
 * task. Direct client orchestration — the state machine grows its remesh
 * stage in a P1 spec informed by this evidence.
 */
async function resumeFromRefine(client: MeshyClient, refineTaskId: string): Promise<void> {
  const reports: ResumeStageReport[] = [];
  const taskIds: Record<string, string> = { refine: refineTaskId };

  const runStage = async (
    stage: string,
    create: () => Promise<string>,
    get: (taskId: string) => Promise<MeshyTask>,
    copyToHarness: boolean,
  ): Promise<{ taskId: string; task: MeshyTask }> => {
    const startedAt = Date.now();
    const taskId = await create();
    taskIds[stage] = taskId;
    console.log(`[${new Date().toISOString()}] ${stage}: created ${taskId}`);
    writeFileSync(join(OUTPUT_DIR, "run.json"), JSON.stringify(taskIds, null, 2));

    const task = await pollUntilTerminal(() => get(taskId), stage);
    const report: ResumeStageReport = {
      stage,
      taskId,
      credits: task.consumed_credits ?? null,
      ms: Date.now() - startedAt,
      bytes: null,
      triangles: null,
      error: task.task_error?.message ?? (task.status === "SUCCEEDED" ? null : task.status),
    };
    reports.push(report);
    if (task.status !== "SUCCEEDED") {
      throw new Error(`${stage} ${task.status}: ${report.error ?? "no task_error"}`);
    }

    const url = taskGlbUrl(task);
    if (url) {
      const { bytes, file } = await download(url, stage);
      report.bytes = bytes;
      report.triangles = await countTriangles(file);
      if (copyToHarness) copyFileSync(file, join(HARNESS_DIR, stageFileName(stage)));
      console.log(
        `  ↳ saved ${stageFileName(stage)} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${report.triangles.toLocaleString()} tris)`,
      );
    }
    return { taskId, task };
  };

  const balanceBefore = await client.getBalance().catch(() => null);
  console.log(`mode: LIVE (resume from refine ${refineTaskId})`);
  console.log(`balance before: ${balanceBefore ?? "unknown"}`);

  try {
    const remesh = await runStage(
      "remesh",
      () => client.createRemeshTask(refineTaskId, REMESH_TARGET_POLYCOUNT),
      (id) => client.getRemeshTask(id),
      false,
    );
    const rig = await runStage(
      "rig",
      () => client.createRigTask(remesh.taskId),
      (id) => client.getRigTask(id),
      true,
    );
    for (const clip of ANIMATION_CLIPS) {
      await runStage(
        `animate:${clip}`,
        () => client.createAnimationTask(rig.taskId, clip),
        (id) => client.getAnimationTask(id),
        true,
      );
    }
  } finally {
    const balanceAfter = await client.getBalance().catch(() => null);
    console.log("\n=== resume summary ===");
    for (const r of reports) {
      console.log(
        [
          r.stage.padEnd(14),
          r.error ? "failed".padEnd(10) : "succeeded ",
          `credits=${r.credits ?? "—"}`,
          `time=${formatMs(r.ms)}`,
          r.bytes !== null
            ? `size=${(r.bytes / 1024 / 1024).toFixed(2)}MB tris=${r.triangles?.toLocaleString() ?? "—"}`
            : "",
          r.error ? `error=${r.error}` : "",
        ]
          .filter(Boolean)
          .join("  "),
      );
    }
    console.log(`task ids: ${JSON.stringify(taskIds)}`);
    console.log(`balance before: ${balanceBefore ?? "unknown"}  after: ${balanceAfter ?? "unknown"}`);
    if (balanceBefore !== null && balanceAfter !== null) {
      console.log(`balance delta: ${balanceBefore - balanceAfter}`);
    }
  }

  console.log(`\nresume succeeded — GLBs in ${OUTPUT_DIR}, harness copies in ${HARNESS_DIR}`);
}

async function main(): Promise<void> {
  const { prompt, testMode, fromRefine } = parseArgs(process.argv.slice(2));
  const apiKey = resolveKey(testMode);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(HARNESS_DIR, { recursive: true });

  const transport = createDirectTransport({ apiKey });
  const client = createMeshyClient(transport);
  const clock = { now: () => Date.now() };

  if (fromRefine !== null) {
    await resumeFromRefine(client, fromRefine);
    return;
  }

  const pipeline = createPipeline({ client, clock });

  const balanceBefore = await client.getBalance().catch((error: unknown) => {
    console.warn(`balance check failed (${String(error)}) — continuing`);
    return null;
  });
  console.log(`mode: ${testMode ? "TEST (0 credits)" : "LIVE"}`);
  console.log(`prompt: ${prompt}`);
  console.log(`balance before: ${balanceBefore ?? "unknown"}`);

  const downloaded = new Set<StageId>();
  const downloads: Partial<Record<StageId, { bytes: number; file: string; triangles: number }>> = {};
  const reported = new Map<StageId, string>();
  let fatal: unknown = null;

  /** Log stage transitions and pull down every fresh GLB (URLs die in 3 days). */
  const harvest = async (run: PipelineRun): Promise<void> => {
    for (const stage of PIPELINE_STAGES) {
      const state = run.stages[stage];
      const line = `${state.status}${state.progress ? ` ${state.progress}%` : ""}`;
      if (reported.get(stage) !== line && state.status !== "pending") {
        reported.set(stage, line);
        console.log(`[${new Date().toISOString()}] ${stage}: ${line}`);
      }
      if (state.status === "succeeded" && state.modelUrl && !downloaded.has(stage)) {
        downloaded.add(stage); // mark first — never retry a paid download loop
        const { bytes, file } = await download(state.modelUrl, stage);
        const triangles = await countTriangles(file);
        downloads[stage] = { bytes, file, triangles };
        if (stage === "rig" || stage.startsWith("animate:")) {
          copyFileSync(file, join(HARNESS_DIR, stageFileName(stage)));
        }
        console.log(
          `  ↳ saved ${stageFileName(stage)} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${triangles.toLocaleString()} tris)`,
        );
      }
    }
    // Task ids are the resume currency — persist them on every change.
    writeFileSync(join(OUTPUT_DIR, "run.json"), JSON.stringify(run, null, 2));
  };

  pipeline.start(prompt);

  let run: PipelineRun = pipeline.getRun();
  while (run.status === "running" && fatal === null) {
    try {
      run = await pipeline.tick();
    } catch (error) {
      // Non-429 API error (e.g. 422 pose estimation on rig). The machine
      // preserves upstream results — harvest them, then report and stop.
      fatal = error;
      run = pipeline.getRun();
    }

    await harvest(run);
    if (run.waitingForQueue) console.log("  (Meshy queue full — waiting)");
    if (run.rateLimitBackoffMs) console.log(`  (rate-limited — backing off ${run.rateLimitBackoffMs}ms)`);

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS / 4));
  }

  const balanceAfter = await client.getBalance().catch(() => null);

  console.log("\n=== per-stage summary ===");
  for (const stage of PIPELINE_STAGES) {
    const state = run.stages[stage];
    const duration =
      state.startedAt !== null && state.completedAt !== null
        ? formatMs(state.completedAt - state.startedAt)
        : "—";
    const output = downloads[stage];
    console.log(
      [
        stage.padEnd(14),
        state.status.padEnd(10),
        `credits=${state.creditCost ?? "—"}`,
        `time=${duration}`,
        output ? `size=${(output.bytes / 1024 / 1024).toFixed(2)}MB tris=${output.triangles.toLocaleString()}` : "",
        state.error ? `error=${state.error}` : "",
      ]
        .filter(Boolean)
        .join("  "),
    );
  }
  console.log(`\ncredits spent (task-reported): ${run.creditsSpent}`);
  console.log(`balance before: ${balanceBefore ?? "unknown"}  after: ${balanceAfter ?? "unknown"}`);
  if (balanceBefore !== null && balanceAfter !== null) {
    console.log(`balance delta: ${balanceBefore - balanceAfter}`);
  }

  if (fatal !== null) {
    console.error(`\nrun aborted: ${String(fatal)}`);
    process.exit(1);
  }
  if (run.status !== "succeeded") {
    console.error(`\nrun ${run.status} — see stage errors above`);
    process.exit(1);
  }
  console.log(`\nrun succeeded — GLBs in ${OUTPUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
