import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns tests/a11y.spec.ts; vitest owns tests/unit/ and lib module tests.
    include: ["tests/unit/**/*.test.ts", "lib/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
