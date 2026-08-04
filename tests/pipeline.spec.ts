import { test, expect } from "@playwright/test";

// US-03a acceptance: test-mode key + prompt starts a live run through the real
// proxy; the stage list appears; a reload resumes the run from localStorage
// (task ids) + sessionStorage (key) instead of starting over. The test-mode
// key cannot pass rig, so this only exercises the early stages — the fixture
// unit tests cover the full graph.
const TEST_MODE_KEY = "msy_dummy_api_key_for_test_mode_12345678";
const RUN_STORAGE_KEY = "prompt-to-playable:pipeline-run";

test("prompt craft hints: action language and held props warn without blocking", async ({
  page,
}) => {
  await page.goto("/");

  // Neutral prompt — no hints.
  await page.getByTestId("prompt-input").fill("a calm robot chef");
  await expect(page.getByTestId("prompt-hint-action")).toHaveCount(0);
  await expect(page.getByTestId("prompt-hint-prop")).toHaveCount(0);

  // The basketball-player failure mode: action pose + fused prop, both hinted.
  await page.getByTestId("prompt-input").fill("a basketball player dunking");
  await expect(page.getByTestId("prompt-hint-action")).toContainText('"dunking"');
  await expect(page.getByTestId("prompt-hint-prop")).toContainText("basketball");

  // Hints advise, never block: with a key the start button stays enabled.
  await page.getByTestId("key-input").fill(TEST_MODE_KEY);
  await expect(page.getByTestId("pipeline-start")).toBeEnabled();
});

test("preview gate: seeded awaiting-review run shows the gate; re-roll restarts preview", async ({
  page,
}) => {
  // A run paused at the gate: preview succeeded (20 credits), nothing after.
  // Seeded straight into storage so no credits are needed to reach the gate.
  const stage = (id: string) => ({
    stage: id,
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
    haltReason: null,
  });
  const gatedRun = {
    prompt: "a basketball player, full body game character",
    status: "awaiting-review",
    stages: {
      preview: {
        ...stage("preview"),
        status: "succeeded",
        taskId: "preview-0001",
        progress: 100,
        creditCost: 20,
        startedAt: 1,
        completedAt: 2,
      },
      refine: stage("refine"),
      remesh: stage("remesh"),
      rig: stage("rig"),
      "animate:idle": stage("animate:idle"),
      "animate:walk": stage("animate:walk"),
      "animate:run": stage("animate:run"),
      "animate:jump": stage("animate:jump"),
      "animate:emote": stage("animate:emote"),
    },
    startedAt: 1,
    completedAt: null,
    creditsSpent: 20,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
  };
  await page.addInitScript(
    ([runKey, envelope, keyValue]) => {
      window.localStorage.setItem(runKey, envelope);
      window.sessionStorage.setItem("prompt-to-playable:meshy-key", keyValue);
    },
    [RUN_STORAGE_KEY, JSON.stringify({ version: 3, run: gatedRun }), TEST_MODE_KEY] as const,
  );

  await page.goto("/");

  // The gate holds: checklist + both actions visible, refine untouched,
  // prompt bar reads Paused and refuses a second run.
  await expect(page.getByTestId("preview-gate")).toBeVisible();
  await expect(page.getByTestId("gate-approve")).toBeEnabled();
  await expect(page.getByTestId("stage-row-refine")).toContainText(/pending/i);
  await expect(page.getByTestId("pipeline-start")).toBeDisabled();
  await expect(page.getByTestId("pipeline-start")).toHaveText(/paused/i);

  // Re-roll: the gate closes, a fresh preview task is created (test-mode key
  // creates fine), and the discarded 20 credits stay on the meter.
  await page.getByTestId("gate-reroll").click();
  await expect(page.getByTestId("preview-gate")).toHaveCount(0);
  await expect(page.getByTestId("stage-row-preview")).toContainText(/running|succeeded/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("run-readout")).toContainText(/20 credits/);
});

test("live pipeline: start with test-mode key, stage list appears, run survives reload", async ({
  page,
}) => {
  await page.goto("/");

  // No run yet — the panel shows key entry + prompt, no stage list.
  await expect(page.getByTestId("live-pipeline")).toBeVisible();
  await expect(page.getByTestId("stage-list")).toHaveCount(0);

  // Start is disabled until both key and prompt exist.
  await expect(page.getByTestId("pipeline-start")).toBeDisabled();
  await page.getByTestId("key-input").fill(TEST_MODE_KEY);
  await page.getByTestId("prompt-input").fill("a bronze knight with a tower shield");
  await expect(page.getByTestId("pipeline-start")).toBeEnabled();
  await page.getByTestId("pipeline-start").click();

  // The run starts: stage list + readout appear, preview leaves "pending".
  await expect(page.getByTestId("stage-list")).toBeVisible();
  await expect(page.getByTestId("run-readout")).toBeVisible();
  await expect(page.getByTestId("stage-row-preview")).toContainText(
    /running|succeeded/,
    { timeout: 30_000 },
  );

  // The run (task ids) is in localStorage; the key is NOT (sessionStorage only).
  const persisted = await page.evaluate((key) => {
    return {
      run: window.localStorage.getItem(key),
      localStorageDump: JSON.stringify(window.localStorage),
      sessionKeyPresent: JSON.stringify(window.sessionStorage).includes("msy_dummy"),
    };
  }, RUN_STORAGE_KEY);
  expect(persisted.run).not.toBeNull();
  const storedRun = JSON.parse(persisted.run!) as {
    run: { prompt: string; stages: { preview: { taskId: string | null } } };
  };
  expect(storedRun.run.stages.preview.taskId).not.toBeNull();
  expect(persisted.localStorageDump).not.toContain(TEST_MODE_KEY);
  expect(persisted.sessionKeyPresent).toBe(true);

  // Reload mid-run: the run resumes from storage instead of resetting.
  await page.reload();
  await expect(page.getByTestId("stage-list")).toBeVisible();
  await expect(page.getByTestId("run-readout")).toBeVisible();
  const resumedTaskId = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return (JSON.parse(raw) as { run: { stages: { preview: { taskId: string | null } } } })
      .run.stages.preview.taskId;
  }, RUN_STORAGE_KEY);
  expect(resumedTaskId).toBe(storedRun.run.stages.preview.taskId);

  // Polling actually continues after the reload (the machine keeps advancing).
  await expect(page.getByTestId("stage-row-preview")).toContainText(
    /running|succeeded/,
    { timeout: 30_000 },
  );
});

// US-08 regression: StageRail passes ArtifactLightbox a fresh inline onClose
// on every render, and StageRail itself re-renders on every live poll tick
// (the store's `run` selector yields a new reference). If the lightbox's
// focus-trap effect depended on that unstable onClose, it would tear down
// and rebuild on each tick, visibly yanking focus to the enlarge button and
// back while the dialog stays open. The seeded-fixture stage-rail.spec.ts
// tests never tick (no live key attached), so they can't catch this — only a
// real, still-polling run reproduces it. No deterministic test hook exists
// to force a single tick (see task-2-report.md), so this proves the fix by
// waiting for a genuine live state change instead of a fixed sleep.
test("enlarge: focus stays inside the lightbox across a live poll re-render", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("key-input").fill(TEST_MODE_KEY);
  await page.getByTestId("prompt-input").fill("a bronze knight with a tower shield");
  await page.getByTestId("pipeline-start").click();

  // Approve the gate so the run keeps ticking into refine — a gated run
  // ("awaiting-review") doesn't poll, so it can't reproduce the bug.
  await expect(page.getByTestId("preview-gate")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("gate-approve").click();
  await expect(page.getByTestId("preview-gate")).toHaveCount(0);

  await page.getByTestId("enlarge-preview").click();
  const dialog = page.getByTestId("artifact-lightbox");
  await expect(dialog).toBeVisible();

  // Record every focusin from here on. Correct behavior: none at all, since
  // nothing moves focus programmatically once the dialog is open and the
  // visitor isn't tabbing. A regression shows up as an event whose target is
  // outside the dialog (the opener, mid-teardown) followed by one back in.
  await page.evaluate(() => {
    const events: { insideDialog: boolean }[] = [];
    (window as unknown as { __lightboxFocusEvents: typeof events }).__lightboxFocusEvents =
      events;
    document.addEventListener("focusin", (event) => {
      const box = document.querySelector('[data-testid="artifact-lightbox"]');
      events.push({
        insideDialog: box !== null && event.target instanceof Node && box.contains(event.target),
      });
    });
  });

  // Wait for refine to actually move — proof a real store `run` re-render
  // happened during the window, not just elapsed wall-clock time.
  const refineBefore = await page.getByTestId("stage-row-refine").textContent();
  await page.waitForFunction(
    (before) => {
      const el = document.querySelector('[data-testid="stage-row-refine"]');
      return el !== null && el.textContent !== before;
    },
    refineBefore,
    { timeout: 60_000 },
  );

  // Still open — a re-render, not a close — and focus never left.
  await expect(dialog).toBeVisible();
  const events = await page.evaluate(
    () =>
      (window as unknown as { __lightboxFocusEvents: { insideDialog: boolean }[] })
        .__lightboxFocusEvents,
  );
  expect(events).toEqual([]);
});

