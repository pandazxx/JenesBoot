import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "tests/scenarios/**/*.scenario.ts",
      "tests/scenarios/scenario.test.ts",
    ],
    exclude: [
      // Converted scenarios export a Scenario object; scenario.test.ts runs them.
      // Direct pickup via the *.scenario.ts glob would produce "No test suite" errors.
      "tests/scenarios/hello-world.scenario.ts",
      "tests/scenarios/surface-battle.scenario.ts",
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
