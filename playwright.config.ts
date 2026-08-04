import { defineConfig } from "@playwright/test";

// PORT override lets parallel worktrees test without colliding on 3000
// (next dev honors the same variable).
const port = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "tests",
  testMatch: [
    "a11y.spec.ts",
    "scene.spec.ts",
    "controller.spec.ts",
    "pipeline.spec.ts",
    "gallery.spec.ts",
  ],
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
