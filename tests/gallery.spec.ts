import { test, expect } from "@playwright/test";

// US-02 acceptance: selecting a gallery card swaps the playground character
// in place — no navigation, no reload. The test serves a two-entry manifest
// (real knight + the raw spike GLBs as a second character) via route
// interception, so it passes even while the real manifest has one entry.
const TEST_MANIFEST = [
  {
    slug: "knight",
    prompt: "low-poly knight in full plate armor",
    glbPath: "/gallery/knight/rig.8d812819.glb",
    clipPaths: {
      idle: "/gallery/knight/idle.48b88150.glb",
      walk: "/gallery/knight/walk.c0747f1e.glb",
      run: "/gallery/knight/run.1b59fe82.glb",
      jump: "/gallery/knight/jump.cc6d127e.glb",
      emote: "/gallery/knight/emote.a82d43a6.glb",
    },
    creditTotal: 55,
    generationSeconds: 431,
    stageCredits: { preview: 20, refine: 10, remesh: 5, rig: 5 },
    polyCount: 29015,
  },
  {
    slug: "spike-knight",
    prompt: "the raw unoptimized spike knight",
    glbPath: "/spike/rig.glb",
    clipPaths: {
      idle: "/spike/animate-idle.glb",
      walk: "/spike/animate-walk.glb",
      run: "/spike/animate-run.glb",
      jump: "/spike/animate-jump.glb",
      emote: "/spike/animate-emote.glb",
    },
    creditTotal: 55,
    generationSeconds: 431,
    stageCredits: { preview: 20, refine: 10, remesh: 5, rig: 5 },
    polyCount: 29015,
  },
];

test("clicking a gallery card swaps the character without a reload", async ({ page }) => {
  await page.route("**/gallery/manifest.json", (route) =>
    route.fulfill({ json: TEST_MANIFEST }),
  );

  await page.goto("/");

  // Both cards render — count must equal manifest entry count.
  await expect(page.getByTestId("gallery-card-knight")).toBeVisible();
  await expect(page.getByTestId("gallery-card-spike-knight")).toBeVisible();

  // First entry is on stage once its GLBs bind.
  await page.waitForFunction(
    () => window.__ptpCharacterRig === "/gallery/knight/rig.8d812819.glb",
    undefined,
    { timeout: 120_000 },
  );

  // Marker survives only if no navigation/reload happens.
  await page.evaluate(() => {
    (window as unknown as { __ptpNavMarker: number }).__ptpNavMarker = 1;
  });

  await page.getByTestId("gallery-card-spike-knight").click();

  await page.waitForFunction(() => window.__ptpCharacterRig === "/spike/rig.glb", undefined, {
    timeout: 120_000,
  });

  const marker = await page.evaluate(
    () => (window as unknown as { __ptpNavMarker?: number }).__ptpNavMarker,
  );
  expect(marker).toBe(1);

  // The swapped-in character is alive: controls still move it (US-02 req 3).
  await page.waitForFunction(() => window.__ptpCharacterPosition !== undefined);
  const before = await page.evaluate(() => [...window.__ptpCharacterPosition!]);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => [...window.__ptpCharacterPosition!]);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.2);
});

test("a broken manifest degrades to an inline error, not a crash", async ({ page }) => {
  await page.route("**/gallery/manifest.json", (route) =>
    route.fulfill({ status: 500, body: "boom" }),
  );

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");

  await expect(page.getByTestId("gallery-strip")).toContainText(/manifest didn't load/i);
  // The scene still gives the visitor a character (spike fallback).
  await page.waitForFunction(() => window.__ptpCharacterRig === "/spike/rig.glb", undefined, {
    timeout: 120_000,
  });
  expect(errors).toEqual([]);
});
