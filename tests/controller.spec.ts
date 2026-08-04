import { test, expect } from "@playwright/test";

// US-01b acceptance: keyboard input moves the character. The scene exposes
// the knight's world position on `window.__ptpCharacterPosition` as a test
// bridge (see controlled-character.tsx).
test("keyboard input moves the character and fades the control hint", async ({ page }) => {
  await page.goto("/");

  // Scene + physics ready: GLBs in, controller mounted, first frames rendered.
  await expect(page.getByTestId("scene-loading")).toHaveCount(0, { timeout: 120_000 });
  await page.waitForFunction(() => window.__ptpCharacterPosition !== undefined);

  // Cold visitors get the control hint before they touch anything.
  await expect(page.getByTestId("control-hint")).toBeVisible();

  const before = await page.evaluate(() => [...window.__ptpCharacterPosition!]);

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");

  const after = await page.evaluate(() => [...window.__ptpCharacterPosition!]);
  const planar = Math.hypot(after[0] - before[0], after[2] - before[2]);
  expect(planar).toBeGreaterThan(0.2);
  // Still on the stage — never fallen through the floor (US-01b req 4).
  expect(after[1]).toBeGreaterThan(-0.5);

  // First movement dismisses the hint for the rest of the session.
  await expect(page.getByTestId("control-hint")).toHaveCount(0);
});

test("jump lifts the character off the ground", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("scene-loading")).toHaveCount(0, { timeout: 120_000 });
  await page.waitForFunction(() => window.__ptpCharacterPosition !== undefined);

  // Wait for the capsule to settle on the floor (y stable and above the stage plane).
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const y0 = window.__ptpCharacterPosition![1];
        setTimeout(() => {
          const y1 = window.__ptpCharacterPosition![1];
          resolve(y1 > -0.5 && Math.abs(y1 - y0) < 0.01);
        }, 300);
      }),
    undefined,
    { timeout: 30_000 },
  );

  const restY = await page.evaluate(() => window.__ptpCharacterPosition![1]);

  await page.keyboard.press("Space");
  const peakY = await page.evaluate(async () => {
    let peak = -Infinity;
    const start = performance.now();
    while (performance.now() - start < 1200) {
      peak = Math.max(peak, window.__ptpCharacterPosition![1]);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return peak;
  });

  expect(peakY).toBeGreaterThan(restY + 0.3);
});
