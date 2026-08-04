import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { RIGGING_PATH, TEXT_TO_3D_PATH } from "../lib/meshy/client";
import { STORAGE_KEY as RUN_STORAGE_KEY, STORAGE_VERSION } from "../lib/meshy/storage";
import { KEY_STORAGE_KEY } from "../components/pipeline/store";

// US-06 acceptance: every failure and wait state renders honest, in-rail copy
// from seeded run snapshots, and the retry click path re-creates ONLY the
// failed stage through the proxy (intercepted — no live API, no real spend).

const TEST_MODE_KEY = "msy_dummy_api_key_for_test_mode_12345678";

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

interface RunOverrides {
  waitingForQueue?: boolean;
  rateLimitBackoffMs?: number | null;
  nextPollAt?: number | null;
  creditsSpent?: number;
}

function makeRun(
  status: "running" | "succeeded" | "failed",
  overrides: Partial<Record<StageId, Partial<FixtureStage>>>,
  runOverrides: RunOverrides = {},
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
    creditsSpent: 35,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
    ...runOverrides,
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

async function seedKey(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.sessionStorage.setItem(key, value);
    },
    [KEY_STORAGE_KEY, TEST_MODE_KEY] as const,
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

function failedAtRig() {
  return makeRun("failed", {
    preview: succeededStage("preview-0001", 20, 0),
    refine: succeededStage("refine-0002", 10, 90_000),
    remesh: succeededStage("remesh-0003", 5, 180_000),
    rig: {
      status: "failed",
      taskId: "rigging-0004",
      creditCost: 0, // auto-refund
      error: "422 Pose estimation failed",
      startedAt: Date.now() - 60_000,
      completedAt: Date.now() - 30_000,
    },
  });
}

test("rig failure: verbatim error, auto-refund note, biped explainer, retry economics", async ({
  page,
}) => {
  await seedRun(page, failedAtRig());
  await seedKey(page);
  await page.goto("/");

  const panel = page.getByTestId("stage-failure-rig");
  await expect(panel).toBeVisible();
  // Meshy's task_error verbatim — never rewritten.
  await expect(page.getByTestId("stage-error-rig")).toHaveText("422 Pose estimation failed");
  // The DevEx teaching moment appears with every failure.
  await expect(panel).toContainText("Failed tasks auto-refund. This stage cost 0 credits.");
  // Rig failures are input-shaped, not bugs — plain words, points at the prompt.
  await expect(page.getByTestId("stage-explainer-rig")).toContainText(
    "standing, bipedal, humanoid",
  );
  // Retry economics, honestly: only the failed stage's credits, kept stages named.
  await expect(page.getByTestId("stage-retry-rig")).toHaveText("Retry rig — 5 credits.");
  await expect(page.getByTestId("stage-kept-rig")).toHaveText(
    "Preview, refine, remesh are kept.",
  );
});

test("preview failure points at the prompt; nothing upstream to keep", async ({ page }) => {
  await seedRun(
    page,
    makeRun(
      "failed",
      {
        preview: {
          status: "failed",
          taskId: "preview-0001",
          creditCost: 0,
          error: "prompt rejected by moderation",
          startedAt: Date.now() - 60_000,
          completedAt: Date.now() - 50_000,
        },
      },
      { creditsSpent: 0 },
    ),
  );
  await seedKey(page);
  await page.goto("/");

  await expect(page.getByTestId("stage-error-preview")).toHaveText(
    "prompt rejected by moderation",
  );
  await expect(page.getByTestId("stage-explainer-preview")).toContainText("prompt");
  await expect(page.getByTestId("stage-retry-preview")).toHaveText(
    "Retry preview — 20 credits.",
  );
  // First stage — no kept line to render.
  await expect(page.getByTestId("stage-kept-preview")).toHaveCount(0);
});

test("retry click re-creates only the failed stage, reusing upstream task ids", async ({
  page,
}) => {
  await seedRun(page, failedAtRig());
  await seedKey(page);

  const proxyCalls: string[] = [];
  await page.route("**/api/meshy/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/meshy", "");
    proxyCalls.push(`${request.method()} ${path}`);
    if (request.method() === "POST" && path === RIGGING_PATH) {
      await route.fulfill({ json: { result: "rigging-9999" } });
      return;
    }
    if (request.method() === "GET" && path.startsWith(`${RIGGING_PATH}/`)) {
      await route.fulfill({
        json: { id: "rigging-9999", status: "IN_PROGRESS", progress: 25 },
      });
      return;
    }
    await route.fulfill({ status: 500, json: { message: `unexpected call ${path}` } });
  });

  await page.goto("/");
  await expect(page.getByTestId("stage-row-rig")).toHaveAttribute("data-kind", "failed");

  await page.getByTestId("stage-retry-rig").click();

  // The rail flips out of "failed" on the click and the rig re-runs.
  await expect(page.getByTestId("stage-row-rig")).toHaveAttribute("data-kind", "running", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("stage-failure-rig")).toHaveCount(0);
  // Upstream stages stay succeeded on screen — their results are reused.
  for (const stage of ["preview", "refine", "remesh"] as const) {
    await expect(page.getByTestId(`stage-row-${stage}`)).toHaveAttribute(
      "data-kind",
      "succeeded",
    );
  }

  // The proxy saw the rig re-create and nothing upstream: no re-spend.
  expect(proxyCalls).toContain(`POST ${RIGGING_PATH}`);
  expect(proxyCalls.filter((call) => call.startsWith(`POST ${TEXT_TO_3D_PATH}`))).toHaveLength(0);
  const rigCreate = proxyCalls.filter((call) => call === `POST ${RIGGING_PATH}`);
  expect(rigCreate).toHaveLength(1);
});

test("RateLimitExceeded: the active row backs off with visible mono seconds", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun(
      "running",
      {
        preview: succeededStage("preview-0001", 20, 0),
        refine: {
          status: "running",
          taskId: "refine-0002",
          progress: 30,
          startedAt: Date.now() - 60_000,
        },
      },
      // Backoff window still open — ticks no-op, no network in this test.
      { rateLimitBackoffMs: 16_000, nextPollAt: Date.now() + 600_000 },
    ),
  );
  await seedKey(page);
  await page.goto("/");

  const refine = page.getByTestId("stage-row-refine");
  await expect(refine).toHaveAttribute("data-kind", "backoff");
  await expect(refine).toContainText("backing off · 16s");
  // Only the active row carries the overlay.
  await expect(page.getByTestId("stage-row-preview")).toHaveAttribute("data-kind", "succeeded");
});

test("NoMoreConcurrentTasks: queue-full on the blocked row, distinct from queued-behind", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun(
      "running",
      {
        preview: succeededStage("preview-0001", 20, 0),
        refine: succeededStage("refine-0002", 10, 90_000),
        remesh: succeededStage("remesh-0003", 5, 180_000),
        // rig create bounced off the account concurrency cap — no task yet.
      },
      { waitingForQueue: true, nextPollAt: Date.now() + 600_000 },
    ),
  );
  await seedKey(page);
  await page.goto("/");

  const rig = page.getByTestId("stage-row-rig");
  await expect(rig).toHaveAttribute("data-kind", "queue-full");
  await expect(rig).toContainText("queue full — waiting");
  // Distinct state from US-03b's per-task queue depth ("queued") by contract:
  // different data-kind, different glyph, different copy.
  await expect(rig).not.toContainText("queued behind");
});

test("failure panel is axe-clean (WCAG 2.1 AA)", async ({ page }) => {
  // Reduced motion strips the entrance transitions so axe never samples a
  // row mid-fade (semi-transparent text blends toward the backdrop and
  // false-fails contrast). Colors are identical in both motion modes.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedRun(page, failedAtRig());
  await seedKey(page);
  await page.goto("/");
  await expect(page.getByTestId("stage-failure-rig")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include('[data-testid="live-pipeline"]')
    .analyze();

  expect(results.violations).toEqual([]);
});
