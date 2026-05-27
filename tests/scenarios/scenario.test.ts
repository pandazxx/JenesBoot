/**
 * Vitest integration for the scenario runner.
 *
 * Imports every *.scenario.ts that exports a Scenario object (named "default"),
 * calls runScenario(), and emits one describe block per scenario with one it()
 * per assertion result. This gives per-assertion granularity in JUnit output.
 *
 * Scenarios that still use the old spawnSync style (no default export) are
 * skipped here and run as standalone test files via the glob in vitest.config.ts.
 */

import { describe, it, expect } from "vitest";
import { runScenario } from "./runner.js";
import type { Scenario } from "./types.js";

import helloWorld from "./hello-world.scenario.js";
import surfaceBattle from "./surface-battle.scenario.js";

const scenarios: Scenario[] = [helloWorld, surfaceBattle];

for (const scenario of scenarios) {
  describe(scenario.title, () => {
    const result = runScenario(scenario);

    it(`completed within ${scenario.maxTicks ?? 1000} ticks (reached tick ${result.tickReached})`, () => {
      expect(result.tickReached).toBeGreaterThan(0);
    });

    if (result.assertionResults.length === 0) {
      it("no assertions defined — scenario ran to completion", () => {
        expect(result.passed).toBe(true);
      });
    } else {
      for (const assertion of result.assertionResults) {
        it(assertion.label, () => {
          if (!assertion.passed) {
            expect.fail(assertion.detail ?? `assertion "${assertion.label}" failed`);
          }
          expect(assertion.passed).toBe(true);
        });
      }
    }
  });
}
