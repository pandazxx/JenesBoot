import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Layer 1: unit tests that import SimEngine directly.
    // Layer 2: scenario tests that drive the compiled headless binary.
    include: [
      "src/**/__tests__/**/*.test.ts",
      "tests/scenarios/**/*.scenario.ts",
    ],
    coverage: {
      reporter: ["text"],
    },
  },
});
