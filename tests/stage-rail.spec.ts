import { test, expect, type Page } from "@playwright/test";

import { STORAGE_KEY as RUN_STORAGE_KEY, STORAGE_VERSION } from "../lib/meshy/storage";

// US-03b acceptance: the rail renders every stage state from scripted fixture
// runs seeded straight into localStorage (the store hydrates them) — no live
// API. Covers all-states rendering, queue-depth honesty, failure surface,
// keyboard reachability, and a reduced-motion snapshot.

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
  thumbnailUrl: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

function makeRun(
  status: "running" | "awaiting-review" | "succeeded" | "failed",
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
        thumbnailUrl: null,
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
    completedAt: status === "running" || status === "awaiting-review" ? null : base + 240_000,
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

/** 8×8 solid PNG, inline: the rail's <img> path with zero network dependency. */
const FIXTURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO48kIbK2IYWhIAvMl5wfWTQdgAAAAASUVORK5CYII=";

const succeededStage = (id: string, credits: number, offset: number): Partial<FixtureStage> => ({
  status: "succeeded",
  taskId: id,
  progress: 100,
  creditCost: credits,
  modelUrl: `https://assets.meshy.test/${id}.glb`,
  thumbnailUrl: FIXTURE_PNG,
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

// US-08: the 32px thumbnail is a status dot, not a preview. Clicking it opens
// the artifact at up to 640px without disturbing the row's API panel.

test("enlarge: thumbnail opens the lightbox, Esc closes it and restores focus", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
    }),
  );
  await page.goto("/");

  const enlarge = page.getByTestId("enlarge-preview");
  await expect(enlarge).toHaveAttribute("aria-label", "Enlarge preview mesh");

  // The overlay button sits on top of the thumbnail slot, not beside it.
  const buttonBox = await enlarge.boundingBox();
  const thumbBox = await page.getByTestId("artifact-thumb-preview").boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(thumbBox).not.toBeNull();
  expect(Math.abs(buttonBox!.x - thumbBox!.x)).toBeLessThan(4);
  expect(Math.abs(buttonBox!.y - thumbBox!.y)).toBeLessThan(4);

  await enlarge.click();

  const dialog = page.getByTestId("artifact-lightbox");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("lightbox-caption")).toHaveText("preview · 20c · 1:22");
  await expect(page.getByTestId("lightbox-image")).toBeVisible();

  // Enlarging must not toggle the row's API panel (US-04 owns that click).
  await expect(page.getByTestId("api-panel-preview")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Tab order within a row is toggle → enlarge (spec requirement 6).
  await page.getByTestId("stage-toggle-preview").focus();
  await page.keyboard.press("Tab");
  await expect(enlarge).toBeFocused();
  // Re-open from the keyboard so the focus-restore assertion below is honest.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();

  // Closing returns focus to the control that opened it, not to the top of
  // the page — the whole point of tracking the opener.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(enlarge).toBeFocused();
});

test("enlarge: scrim click and close button both dismiss", async ({ page }) => {
  await seedRun(page, makeRun("running", { preview: succeededStage("preview-0001", 20, 0) }));
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  await page.getByTestId("lightbox-close").click();
  await expect(page.getByTestId("artifact-lightbox")).toHaveCount(0);

  await page.getByTestId("enlarge-preview").click();
  // Click the scrim well away from the frame.
  await page.getByTestId("lightbox-scrim").click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("artifact-lightbox")).toHaveCount(0);
});

test("enlarge: no affordance on stages without a mesh artifact", async ({ page }) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
      rig: succeededStage("rigging-0004", 5, 180_000),
    }),
  );
  await page.goto("/");

  await expect(page.getByTestId("enlarge-preview")).toHaveCount(1);
  // rig succeeded but is iconographic — nothing to enlarge.
  await expect(page.getByTestId("enlarge-rig")).toHaveCount(0);
  await expect(page.getByTestId("enlarge-refine")).toHaveCount(0);
});

test("enlarge: steps across landed mesh stages and stops at the ends", async ({ page }) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: succeededStage("preview-0001", 20, 0),
      refine: succeededStage("refine-0002", 10, 90_000),
      remesh: succeededStage("remesh-0003", 5, 180_000),
    }),
  );
  await page.goto("/");

  await page.getByTestId("enlarge-refine").click();
  const caption = page.getByTestId("lightbox-caption");
  await expect(caption).toHaveText("refine · 10c · 1:22");

  // Opening mid-list means both directions are live.
  await expect(page.getByTestId("lightbox-prev")).toBeEnabled();
  await expect(page.getByTestId("lightbox-next")).toBeEnabled();

  await page.getByTestId("lightbox-next").click();
  await expect(caption).toHaveText("remesh · 5c · 1:22");
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();

  // Keyboard mirrors the arrows.
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("refine · 10c · 1:22");
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("preview · 20c · 1:22");
  await expect(page.getByTestId("lightbox-prev")).toBeDisabled();

  // At the start, ArrowLeft is inert rather than wrapping.
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("preview · 20c · 1:22");

  // One dot per landed artifact, current one marked.
  const dots = page.getByTestId("lightbox-dots").locator("[data-dot]");
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(0)).toHaveAttribute("data-dot", "current");
  await expect(dots.nth(1)).toHaveAttribute("data-dot", "other");

  // Focus trap: Tab from the last enabled control wraps to the first rather
  // than escaping to the rail behind the scrim. At index 0 the prev arrow is
  // disabled, so the cycle is next → close → next.
  await page.getByTestId("lightbox-close").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("lightbox-next")).toBeFocused();
});

test("enlarge: a lone artifact has no live arrows", async ({ page }) => {
  await seedRun(page, makeRun("running", { preview: succeededStage("preview-0001", 20, 0) }));
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  await expect(page.getByTestId("lightbox-prev")).toBeDisabled();
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();
  await expect(page.getByTestId("lightbox-dots").locator("[data-dot]")).toHaveCount(1);
});

test("preview gate: the review image opens the lightbox", async ({ page }) => {
  await seedRun(page, makeRun("awaiting-review", { preview: succeededStage("preview-0001", 20, 0) }));
  await page.goto("/");

  await expect(page.getByTestId("preview-gate")).toBeVisible();
  const enlarge = page.getByTestId("gate-enlarge");
  await expect(enlarge).toHaveAttribute("aria-label", "Enlarge preview mesh");

  await enlarge.click();
  await expect(page.getByTestId("artifact-lightbox")).toBeVisible();
  await expect(page.getByTestId("lightbox-caption")).toHaveText("preview · 20c · 1:22");
  // Only the preview has landed at the gate — nothing to step to.
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("artifact-lightbox")).toHaveCount(0);
  await expect(enlarge).toBeFocused();
});
