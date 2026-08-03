import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns tests/a11y.spec.ts; vitest owns tests/unit/.
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
