import { test, expect } from "@playwright/test";

// US-03a acceptance: test-mode key + prompt starts a live run through the real
// proxy; the stage list appears; a reload resumes the run from localStorage
// (task ids) + sessionStorage (key) instead of starting over. The test-mode
// key cannot pass rig, so this only exercises the early stages — the fixture
// unit tests cover the full graph.
const TEST_MODE_KEY = "msy_dummy_api_key_for_test_mode_12345678";
const RUN_STORAGE_KEY = "prompt-to-playable:pipeline-run";

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
