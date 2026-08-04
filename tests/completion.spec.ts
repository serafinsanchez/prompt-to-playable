import { test, expect, type Page } from "@playwright/test";

import { STORAGE_KEY as RUN_STORAGE_KEY, STORAGE_VERSION } from "../lib/meshy/storage";

// US-05 acceptance: a succeeded run seeded into localStorage renders the
// completion state (receipt + play + download), "Play it" swaps the generated
// character onto the stage, gallery and generated coexist within the session,
// and an expired run degrades to honest copy. GLB URLs are mocked with
// same-origin gallery files so the swap exercises the real loader without
// Meshy's asset host.

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

/**
 * Same-origin stand-ins for Meshy signed URLs. Deliberately NOT the knight —
 * the gallery's default character is the knight (manifest entry 0), and the
 * coexistence test needs the generated rig URL to differ from the stage's.
 */
const MOCK_GLB: Record<string, string> = {
  rig: "/gallery/goblin-scout/rig.f4e1834c.glb",
  "animate:idle": "/gallery/goblin-scout/idle.ce259443.glb",
  "animate:walk": "/gallery/goblin-scout/walk.eaf2f2b2.glb",
  "animate:run": "/gallery/goblin-scout/run.ca988cf8.glb",
  "animate:jump": "/gallery/goblin-scout/jump.7dc8c128.glb",
  "animate:emote": "/gallery/goblin-scout/emote.f590fd73.glb",
};

function makeSucceededRun(completedAgoMs: number) {
  const completedAt = Date.now() - completedAgoMs;
  const startedAt = completedAt - 360_000; // exactly 6 minutes of generation
  const stages = Object.fromEntries(
    STAGES.map((stage, index) => [
      stage,
      {
        stage,
        status: "succeeded",
        taskId: `${stage}-task`,
        progress: 100,
        precedingTasks: null,
        creditCost: index === 0 ? 20 : 5,
        modelUrl: MOCK_GLB[stage] ?? null,
        startedAt: startedAt + index * 30_000,
        completedAt: startedAt + index * 30_000 + 25_000,
        error: null,
      },
    ]),
  );
  return {
    prompt: "a bronze knight with a tower shield",
    status: "succeeded",
    stages,
    startedAt,
    completedAt,
    creditsSpent: 55,
    waitingForQueue: false,
    rateLimitBackoffMs: null,
    nextPollAt: null,
  };
}

async function seedRun(page: Page, run: ReturnType<typeof makeSucceededRun>): Promise<void> {
  await page.addInitScript(
    ([key, envelope]) => {
      window.localStorage.setItem(key, envelope);
    },
    [RUN_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, run })] as const,
  );
}

function stageRig(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__ptpCharacterRig);
}

declare global {
  interface Window {
    __ptpCharacterRig?: string;
  }
}

test("completion state renders receipt, play, and download from a succeeded run", async ({
  page,
}) => {
  await seedRun(page, makeSucceededRun(60_000));
  await page.goto("/");

  const completion = page.getByTestId("completion");
  await expect(completion).toBeVisible();
  await expect(page.getByTestId("completion-receipt")).toHaveText(
    "55 credits. 6 minutes. Yours.",
  );
  await expect(page.getByTestId("play-generated")).toBeVisible();
  await expect(page.getByTestId("play-generated")).toHaveText("Play it");
  await expect(page.getByTestId("download-toggle")).toBeVisible();
  await expect(page.getByTestId("download-list")).toBeHidden();
});

test("download disclosure lists the rig and all five clips with slug filenames", async ({
  page,
}) => {
  await seedRun(page, makeSucceededRun(60_000));
  await page.goto("/");

  const toggle = page.getByTestId("download-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const list = page.getByTestId("download-list");
  await expect(list).toBeVisible();
  await expect(list.locator("a")).toHaveCount(6);

  const slug = "a-bronze-knight-with-a-tower-shield";
  const rig = page.getByTestId(`download-${slug}-rig.glb`);
  await expect(rig).toHaveAttribute("href", MOCK_GLB.rig);
  await expect(rig).toHaveAttribute("download", `${slug}-rig.glb`);
  for (const clip of ["idle", "walk", "run", "jump", "emote"]) {
    const link = page.getByTestId(`download-${slug}-${clip}.glb`);
    await expect(link).toHaveAttribute("href", MOCK_GLB[`animate:${clip}`]);
    await expect(link).toHaveAttribute("download", `${slug}-${clip}.glb`);
  }
});

test("play swaps the generated character in; gallery and generated coexist", async ({
  page,
}) => {
  test.setTimeout(120_000); // three full GLB set loads on one dev server
  await seedRun(page, makeSucceededRun(60_000));
  await page.goto("/");

  // A gallery character owns the stage first (US-02 default select).
  await expect.poll(() => stageRig(page), { timeout: 60_000 }).toBeTruthy();
  const galleryRig = (await stageRig(page)) as string;

  // Play it → the run's rig takes the stage; the button reports the state.
  await page.getByTestId("play-generated").click();
  await expect.poll(() => stageRig(page), { timeout: 60_000 }).toBe(MOCK_GLB.rig);
  await expect(page.getByTestId("play-generated")).toHaveText("On stage");
  await expect(page.getByTestId("play-generated")).toBeDisabled();
  // No gallery card claims the stage while the generated character holds it.
  await expect(page.getByTestId("gallery-card-knight")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Swap to a different gallery character — the stage hands back (req 5)...
  await page.getByTestId("gallery-card-astronaut").click();
  await expect
    .poll(() => stageRig(page), { timeout: 60_000 })
    .not.toBe(MOCK_GLB.rig);

  // ...and "Play it" brings your character straight back.
  await page.getByTestId("play-generated").click();
  await expect.poll(() => stageRig(page), { timeout: 60_000 }).toBe(MOCK_GLB.rig);
  expect(galleryRig).not.toBe(MOCK_GLB.rig);
});

test("a run missing a clip URL offers downloads but never a dead Play button", async ({
  page,
}) => {
  const run = makeSucceededRun(60_000);
  (run.stages["animate:emote"] as { modelUrl: string | null }).modelUrl = null;
  await seedRun(page, run);
  await page.goto("/");

  await expect(page.getByTestId("completion")).toBeVisible();
  await expect(page.getByTestId("play-generated")).toHaveCount(0);
  await page.getByTestId("download-toggle").click();
  await expect(page.getByTestId("download-list").locator("a")).toHaveCount(5);
});

test("a run past Meshy's 3-day retention shows honest copy, no dead buttons", async ({
  page,
}) => {
  await seedRun(page, makeSucceededRun(4 * 24 * 60 * 60 * 1000));
  await page.goto("/");

  await expect(page.getByTestId("completion")).toBeVisible();
  await expect(page.getByTestId("completion-expired")).toHaveText(
    "Assets expired. Meshy keeps results for 3 days.",
  );
  await expect(page.getByTestId("play-generated")).toHaveCount(0);
  await expect(page.getByTestId("download-toggle")).toHaveCount(0);
  // Start over stays available — the honest exit (US-03a affordance).
  await expect(page.getByTestId("start-over")).toBeVisible();
  // US-09: the playground CTA is the one action that survives expiry.
  await expect(page.getByTestId("playground-cta")).toBeVisible();
});

test("completion card links out to the API playground", async ({ page }) => {
  await seedRun(page, makeSucceededRun(60_000));
  await page.goto("/");

  const cta = page.getByTestId("playground-cta");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute(
    "href",
    "https://www.meshy.ai/api-playground/text-to-3d/preview",
  );
  await expect(cta).toHaveAttribute("target", "_blank");
  await expect(cta).toHaveAttribute("rel", "noopener");
  await expect(page.getByTestId("playground-cta-caption")).toHaveText(
    "Click copies your prompt",
  );
});

// Clipboard APIs need explicit permissions (Chromium) — scoped to this block.
test.describe("playground CTA clipboard handoff", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("clicking copies the run's prompt and confirms inline", async ({ page }) => {
    // Keep CI hermetic: the new tab must never actually load meshy.ai.
    await page.context().route("https://www.meshy.ai/**", (route) => route.abort());
    await seedRun(page, makeSucceededRun(60_000));
    await page.goto("/");

    const popupPromise = page.waitForEvent("popup");
    await page.getByTestId("playground-cta").click();
    const popup = await popupPromise;
    await popup.close();

    await page.bringToFront(); // clipboard.readText needs the focused document
    await expect(page.getByTestId("playground-cta-caption")).toHaveText(
      "Prompt copied",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "a bronze knight with a tower shield",
    );
  });
});
