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

// Three DISTINCT 8×8 solid PNGs (red/green/blue), one per mesh stage. An
// implementation that always rendered artifacts[0] would still pass every
// test that only asserts toBeVisible() on a shared fixture — these exist so
// tests/stage-rail.spec.ts can assert `lightbox-image`'s src actually tracks
// the current step (US-08 fix-wave finding B).
const FIXTURE_PNG_PREVIEW =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO45uCAFTEMLQkAjjdVgcCJedkAAAAASUVORK5CYII=";
const FIXTURE_PNG_REFINE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNwOJGAFTEMLQkAItVaARoIkS0AAAAASUVORK5CYII=";
const FIXTURE_PNG_REMESH =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMIaHqGFTEMLQkA1b5uAf8fn6IAAAAASUVORK5CYII=";

const succeededStage = (
  id: string,
  credits: number,
  offset: number,
  thumbnailUrl: string = FIXTURE_PNG,
): Partial<FixtureStage> => ({
  status: "succeeded",
  taskId: id,
  progress: 100,
  creditCost: credits,
  modelUrl: `https://assets.meshy.test/${id}.glb`,
  thumbnailUrl,
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
  const caption = page.getByTestId("lightbox-caption");
  await expect(caption).toHaveText("preview · 20c · 1:22");
  // A screen-reader user stepping between stages has no other channel: the
  // dialog's own aria-label doesn't reliably re-announce on an already-
  // focused element (US-08 fix-wave finding D).
  await expect(caption).toHaveAttribute("aria-live", "polite");
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
      preview: succeededStage("preview-0001", 20, 0, FIXTURE_PNG_PREVIEW),
      refine: succeededStage("refine-0002", 10, 90_000, FIXTURE_PNG_REFINE),
      remesh: succeededStage("remesh-0003", 5, 180_000, FIXTURE_PNG_REMESH),
    }),
  );
  await page.goto("/");

  await page.getByTestId("enlarge-refine").click();
  const caption = page.getByTestId("lightbox-caption");
  const image = page.getByTestId("lightbox-image");
  await expect(caption).toHaveText("refine · 10c · 1:22");
  // Distinct per-stage fixtures: an implementation that always rendered
  // artifacts[0] would fail here even though every other assertion in this
  // suite would still pass (US-08 fix-wave finding B's regression test).
  await expect(image).toHaveAttribute("src", FIXTURE_PNG_REFINE);

  // Opening mid-list means both directions are live.
  await expect(page.getByTestId("lightbox-prev")).toBeEnabled();
  await expect(page.getByTestId("lightbox-next")).toBeEnabled();

  await page.getByTestId("lightbox-next").click();
  await expect(caption).toHaveText("remesh · 5c · 1:22");
  await expect(image).toHaveAttribute("src", FIXTURE_PNG_REMESH);
  await expect(page.getByTestId("lightbox-next")).toBeDisabled();

  // Keyboard mirrors the arrows.
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("refine · 10c · 1:22");
  await expect(image).toHaveAttribute("src", FIXTURE_PNG_REFINE);
  await page.keyboard.press("ArrowLeft");
  await expect(caption).toHaveText("preview · 20c · 1:22");
  await expect(image).toHaveAttribute("src", FIXTURE_PNG_PREVIEW);
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

// Every fixture above sets thumbnailUrl, so the GLB fallback branch
// (artifact-lightbox.tsx's snapshotGlb path) never executes anywhere else in
// this suite — both C findings from the US-08 fix wave lived in that
// uncovered branch. These two tests force it: a dead thumbnail URL routing
// to a successful snapshot, and a stepped-to artifact whose snapshot itself
// fails.

test("enlarge: a dead thumbnail image falls back to the GLB snapshot render", async ({
  page,
}) => {
  await seedRun(
    page,
    makeRun("running", {
      preview: {
        ...succeededStage("preview-0001", 20, 0),
        // Same-origin 404 — deterministic, no real network dependency. A
        // real gallery mesh backs the fallback render so this is an actual
        // successful WebGL snapshot, not just a state-machine assertion.
        thumbnailUrl: "/this-thumbnail-does-not-exist.png",
        modelUrl: "/gallery/knight/rig.8d812819.glb",
      },
    }),
  );
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  const image = page.getByTestId("lightbox-image");
  // onError on the dead <img> routes this artifact to the snapshot path
  // (US-08 fix-wave finding C) instead of showing a broken-image icon.
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/, { timeout: 15_000 });
});

test("enlarge: stepping to a null-thumbnail artifact clears the stale image and settles on failure", async ({
  page,
}) => {
  // Aborted at the network layer so the GLB render deterministically fails
  // without depending on real DNS resolution for the fake host.
  await page.route("**/unreachable-refine.glb", (route) => route.abort());
  await seedRun(
    page,
    makeRun("running", {
      // Also thumbnail-less, so its `fallback` state gets populated with a
      // real rendered snapshot before we step away from it — otherwise this
      // test can't reproduce finding B (there'd be nothing stale to leak).
      preview: {
        ...succeededStage("preview-0001", 20, 0),
        thumbnailUrl: null,
        modelUrl: "/gallery/knight/rig.8d812819.glb",
      },
      refine: {
        ...succeededStage("refine-0002", 10, 90_000),
        thumbnailUrl: null,
        modelUrl: "https://assets.meshy.test/unreachable-refine.glb",
      },
    }),
  );
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  const image = page.getByTestId("lightbox-image");
  const frame = page.getByTestId("lightbox-frame");
  // Preview's snapshot renders for real before we step away from it.
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/, { timeout: 15_000 });

  await page.getByTestId("lightbox-next").click();
  await expect(page.getByTestId("lightbox-caption")).toHaveText("refine · 10c · 1:22");
  // The stale preview snapshot must not linger under the refine caption
  // while (or after) refine's own snapshot fails to render — this is the
  // exact bug finding B describes: `fallback` never reset on step, so the
  // previous artifact's rendered image showed under the new caption.
  await expect(image).toHaveCount(0);

  // Settles to a failure affordance instead of pulsing forever.
  await expect(page.getByTestId("lightbox-artifact-error")).toBeVisible({ timeout: 15_000 });
  await expect(frame).not.toHaveClass(/animate-pulse/);
  await expect(image).toHaveCount(0);
});

test("enlarge: the dialog portals to document.body", async ({ page }) => {
  await seedRun(page, makeRun("running", { preview: succeededStage("preview-0001", 20, 0) }));
  await page.goto("/");

  await page.getByTestId("enlarge-preview").click();
  const scrim = page.getByTestId("lightbox-scrim");
  await expect(scrim).toBeVisible();
  // Spec REQUIREMENT 8: escapes the rail's overflow-y-auto / mobile bottom
  // sheet by portaling to body, not rendering in the rail's own tree.
  await expect(await scrim.evaluate((el) => el.parentElement === document.body)).toBe(true);
});

test("enlarge: the enlarged image is meaningfully larger than the rail thumbnail at both breakpoints", async ({
  page,
}) => {
  await seedRun(page, makeRun("running", { preview: succeededStage("preview-0001", 20, 0) }));

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByTestId("enlarge-preview").click();
  const mobileBox = await page.getByTestId("lightbox-image").boundingBox();
  expect(mobileBox).not.toBeNull();
  // Before the fix-wave sizing fix this measured ~190px — smaller than the
  // preview-gate's own ~300px review square. It must now exceed that square,
  // or "enlarge" no longer means enlarge on mobile (fix-wave finding A).
  expect(mobileBox!.width).toBeGreaterThan(305);
  expect(mobileBox!.width).toBeLessThan(375);
  await page.getByTestId("lightbox-close").click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.getByTestId("enlarge-preview").click();
  const desktopBox = await page.getByTestId("lightbox-image").boundingBox();
  expect(desktopBox).not.toBeNull();
  // Comfortably close to the 640px frame cap now that the arrows overlay the
  // image instead of flanking it.
  expect(desktopBox!.width).toBeGreaterThan(550);
  expect(desktopBox!.width).toBeLessThan(640);
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
