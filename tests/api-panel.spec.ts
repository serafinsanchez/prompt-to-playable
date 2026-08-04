import { test, expect, type Page } from "@playwright/test";

import { STORAGE_KEY as RUN_STORAGE_KEY, STORAGE_VERSION } from "../lib/meshy/storage";

// US-04 acceptance: any stage row expands (click AND keyboard) to the real
// request behind it — proxy-relative path, v1/v2 badge, chained task ids
// from the run snapshot, masked key header — and the copy button puts a
// runnable curl on the clipboard with inline feedback, no toast.

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

async function seedChainedRun(page: Page): Promise<void> {
  const base = Date.now() - 300_000;
  const stages = Object.fromEntries(
    STAGES.map((stage, i) => [
      stage,
      {
        stage,
        status: "succeeded",
        taskId: `${stage.replace(":", "-")}-000${String(i + 1)}`,
        progress: 100,
        precedingTasks: null,
        creditCost: 5,
        modelUrl: null, // keep thumbnails out of this spec's way
        startedAt: base + i * 10_000,
        completedAt: base + i * 10_000 + 8_000,
        error: null,
      },
    ]),
  );
  const run = {
    prompt: "a bronze knight with a tower shield",
    status: "succeeded",
    stages,
    startedAt: base,
    completedAt: base + 240_000,
    creditsSpent: 45,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
  };
  await page.addInitScript(
    ([key, envelope]) => {
      window.localStorage.setItem(key, envelope);
    },
    [RUN_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, run })] as const,
  );
}

test("refine row expands to the real v2 call with the chained preview task id", async ({
  page,
}) => {
  await seedChainedRun(page);
  await page.goto("/");

  // Collapsed by default.
  await expect(page.getByTestId("api-panel-refine")).toHaveCount(0);

  const toggle = page.getByTestId("stage-toggle-refine");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const panel = page.getByTestId("api-panel-refine");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("POST /api/meshy/openapi/v2/text-to-3d");
  await expect(page.getByTestId("api-version-refine")).toHaveText("v2");
  await expect(panel).toContainText('"preview_task_id": "preview-0001"');
  await expect(panel).toContainText('"enable_pbr": true');
  // The key never appears — masked header only.
  await expect(panel).toContainText("x-meshy-key: •••");
  await expect(panel).toContainText("5 credits consumed");

  // Collapse again.
  await toggle.click();
  await expect(page.getByTestId("api-panel-refine")).toHaveCount(0);
});

test("animate rows are v1 and each shows its own integer action_id", async ({ page }) => {
  await seedChainedRun(page);
  await page.goto("/");

  await page.getByTestId("stage-toggle-animate:walk").click();
  const walk = page.getByTestId("api-panel-animate:walk");
  await expect(walk).toContainText("POST /api/meshy/openapi/v1/animations");
  await expect(page.getByTestId("api-version-animate:walk")).toHaveText("v1");
  await expect(walk).toContainText('"rig_task_id": "rig-0004"');
  await expect(walk).toContainText('"action_id": 30');

  await page.getByTestId("stage-toggle-animate:jump").click();
  await expect(page.getByTestId("api-panel-animate:jump")).toContainText('"action_id": 466');
});

test("keyboard expansion + copy curl with inline feedback", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedChainedRun(page);
  await page.goto("/");

  // Keyboard path: focus the toggle and open with Enter.
  await page.getByTestId("stage-toggle-preview").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("api-panel-preview")).toBeVisible();

  await page.getByTestId("api-copy-preview").click();
  await expect(page.getByTestId("api-panel-preview")).toContainText("copied.");

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("curl -X POST https://api.meshy.ai/openapi/v2/text-to-3d");
  expect(clipboard).toContain('-H "Authorization: Bearer $MESHY_API_KEY"');
  expect(clipboard).toContain("a bronze knight with a tower shield");
  // No-toast rule: the "copied." feedback is asserted inline inside the panel
  // above; no toast library exists in this app (no-new-packages constraint).
  // A DOM-wide "no toast" selector is not assertable in dev — Next's dev
  // overlay itself renders a `nextjs-toast` element.
});
