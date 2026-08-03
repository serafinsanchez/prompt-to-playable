import { test, expect } from "@playwright/test";

// US-01a acceptance: the playground mounts its canvas and the knight's GLBs
// load without any console errors during mount.
test("playground renders the canvas with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");

  await expect(page.locator("canvas")).toBeVisible();

  // The loading line unmounts once all six GLBs are in (~53 MB from dev server).
  await expect(page.getByTestId("scene-loading")).toHaveCount(0, { timeout: 120_000 });

  expect(errors).toEqual([]);
});
