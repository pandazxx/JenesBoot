import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "tests/scenarios/**/*.scenario.ts",
    ],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: {
      junit: "test-results/junit.xml",
    },
    coverage: {
      reporter: ["text"],
    },
  },
});
