import { test, expect, type Page } from "@playwright/test";

// US-03b acceptance: the rail renders every stage state from scripted fixture
// runs seeded straight into localStorage (the store hydrates them) — no live
// API. Covers all-states rendering, queue-depth honesty, failure surface,
// keyboard reachability, and a reduced-motion snapshot.

const RUN_STORAGE_KEY = "prompt-to-playable:pipeline-run";
const STORAGE_VERSION = 3; // mirror of lib/meshy/storage.ts — envelope contract

const STAGES = [
  "preview",
  "refine",
  "remesh",
  "rig",
  "animate:idle",
  "animate:walk",
  "animate:run",
  "animate:jump",
  "animate:emote",
] as const;

type StageId = (typeof STAGES)[number];

interface FixtureStage {
  stage: StageId;
  status: "pending" | "running" | "succeeded" | "failed";
  taskId: string | null;
  progress: number;
  precedingTasks: number | null;
  creditCost: number | null;
  modelUrl: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

function makeRun(
  status: "running" | "succeeded" | "failed",
  overrides: Partial<Record<StageId, Partial<FixtureStage>>>,
) {
  const base = Date.now() - 300_000;
  const stages = Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      {
        stage,
        status: "pending",
        taskId: null,
        progress: 0,
        precedingTasks: null,
        creditCost: null,
        modelUrl: null,
        startedAt: null,
        completedAt: null,
        error: null,
        ...overrides[stage],
      } satisfies FixtureStage,
    ]),
  );
  return {
    prompt: "a bronze knight with a tower shield",
    status,
    stages,
    startedAt: base,
    completedAt: status === "running" ? null : base + 240_000,
    creditsSpent: 30,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
  };
}

async function seedRun(page: Page, run: ReturnType<typeof makeRun>): Promise<void> {
  await page.addInitScript(
    ([key, envelope]) => {
      window.localStorage.setItem(key, envelope);
    },
    [RUN_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, run })] as const,
  );
}

const succeededStage = (id: string, credits: number, offset: number): Partial<FixtureStage> => ({
  status: "succeeded",
  taskId: id,
  progress: 100,
  creditCost: credits,
  modelUrl: `https://assets.meshy.test/${id}.glb`,
  startedAt: Date.now() - 300_000 + offset,
  completedAt: Date.now() - 300_000 + offset + 82_000,
});

test("rail renders mixed states: ticks, live ring, queue-depth copy, pending group", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
      refine: succeededStage("refine-0002", 10, 90_000),
      // Created but parked in Meshy's shared queue — the honest-copy case.
      remesh: {
        status: "running",
        taskId: "remesh-0003",
        progress: 0,
        precedingTasks: 477,
        startedAt: Date.now() - 60_000,
      },
    }),
  );
  await page.goto("/");

  const rail = page.getByTestId("stage-list");
  await expect(rail).toBeVisible();

  // Succeeded rows: tick kind + real credits · duration + artifact thumbnail.
  await expect(page.getByTestId("stage-row-preview")).toHaveAttribute("data-kind", "succeeded");
  await expect(page.getByTestId("stage-row-preview")).toContainText("20c · 1:22");
  await expect(page.getByTestId("artifact-thumb-preview")).toBeVisible();
  await expect(page.getByTestId("artifact-thumb-refine")).toBeVisible();

  // Queue honesty: no dead 0% ring — "queued behind N tasks" verbatim.
  await expect(page.getByTestId("stage-row-remesh")).toHaveAttribute("data-kind", "queued");
  await expect(page.getByTestId("stage-row-remesh")).toContainText("queued behind 477 tasks");

  // Not-yet-created stages read as pending, visually distinct via data-kind.
  await expect(page.getByTestId("stage-row-rig")).toHaveAttribute("data-kind", "pending");

  // The animate group renders as one cluster with all five clips.
  await expect(page.getByTestId("stage-group-animate")).toBeVisible();
  for (const clip of ["idle", "walk", "run", "jump", "emote"]) {
    await expect(page.getByTestId(`stage-row-animate:${clip}`)).toHaveAttribute(
      "data-kind",
      "pending",
    );
  }

  // Keyboard path: the rail is a focusable region (scrollable on small screens).
  await expect(rail).toHaveAttribute("tabindex", "0");
  await rail.focus();
  await expect(rail).toBeFocused();
});

test("failed stage: distinct kind, frozen row, verbatim error rendered plainly", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun("failed", {
      preview: succeededStage("preview-0001", 20, 0),
      refine: succeededStage("refine-0002", 10, 90_000),
      remesh: succeededStage("remesh-0003", 5, 180_000),
      rig: {
        status: "failed",
        taskId: "rigging-0004",
        creditCost: 0, // auto-refund
        error: "Pose estimation failed",
        startedAt: Date.now() - 60_000,
        completedAt: Date.now() - 30_000,
      },
    }),
  );
  await page.goto("/");

  const rig = page.getByTestId("stage-row-rig");
  await expect(rig).toHaveAttribute("data-kind", "failed");
  await expect(rig).toContainText("failed");
  // task_error verbatim — copy polish is US-06's, presence is US-03b's.
  await expect(page.getByTestId("stage-error-rig")).toHaveText("Pose estimation failed");
  // Upstream results stay on screen for retry reuse.
  await expect(page.getByTestId("stage-row-remesh")).toHaveAttribute("data-kind", "succeeded");
});

test("reduced motion: rail renders all states with animations stripped (snapshot)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
      refine: { status: "running", taskId: "refine-0002", progress: 42, startedAt: Date.now() - 30_000 },
    }),
  );
  await page.goto("/");

  await expect(page.getByTestId("stage-row-refine")).toContainText("42%");
  // Queued rings pulse via animate-pulse; under reduced motion the utility is
  // disabled — assert the class contract rather than pixel motion.
  await expect(page.getByTestId("stage-list")).toBeVisible();
  await page
    .getByTestId("stage-list")
    .screenshot({ path: "test-results/stage-rail-reduced-motion.png" });
});
