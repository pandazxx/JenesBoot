/**
 * Vitest integration for the scenario runner.
 *
 * Imports every *.scenario.ts that exports a Scenario object (named "default"),
 * calls runScenario(), and emits one describe block per scenario with one it()
 * per assertion result. This gives per-assertion granularity in JUnit output.
 *
 * Scenarios that still use the old spawnSync style (no default export) are
 * skipped here and run as standalone test files via the glob in vitest.config.ts.
 *
 * After all scenarios complete, writes test-results/scenario-results.json
 * for the HTML report generator (PR #3).
 */

import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runScenario } from "./runner.js";
import type { Scenario } from "./types.js";

import helloWorld from "./hello-world.scenario.js";
import surfaceBattle from "./surface-battle.scenario.js";

const scenarios: Scenario[] = [helloWorld, surfaceBattle];

interface ScenarioResultEntry {
  id: string;
  title: string;
  passed: boolean;
  durationMs: number;
  ticksReached: number;
  terminatingEvent: string | null;
  assertions: Array<{ label: string; passed: boolean; detail: string | null }>;
  firstFailingTick: number | null;
}

interface ScenarioResultsManifest {
  generatedAt: string;
  scenarios: ScenarioResultEntry[];
}

const manifest: ScenarioResultsManifest = {
  generatedAt: new Date().toISOString(),
  scenarios: [],
};

for (const scenario of scenarios) {
  describe(scenario.title, () => {
    const start = Date.now();
    const result = runScenario(scenario);
    const durationMs = Date.now() - start;

    // Determine terminating event from the log
    const terminatingEvent =
      result.log.find((e) => e.type === "combat_end")?.type ?? null;

    // Find the first failing tick: look at atTick assertions if the runner
    // annotates the tick. For non-atTick assertions, leave null.
    let firstFailingTick: number | null = null;
    for (const ar of result.assertionResults) {
      if (!ar.passed && ar.detail !== undefined) {
        const m = /tick (\d+)/.exec(ar.detail);
        if (m !== null && m[1] !== undefined) {
          const t = parseInt(m[1], 10);
          if (firstFailingTick === null || t < firstFailingTick) {
            firstFailingTick = t;
          }
        }
      }
    }

    manifest.scenarios.push({
      id: scenario.id,
      title: scenario.title,
      passed: result.passed,
      durationMs,
      ticksReached: result.tickReached,
      terminatingEvent,
      assertions: result.assertionResults.map((ar) => ({
        label: ar.label,
        passed: ar.passed,
        detail: ar.detail ?? null,
      })),
      firstFailingTick,
    });

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

afterAll(() => {
  const outDir = join(process.cwd(), "test-results");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "scenario-results.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
  } catch (err) {
    // Non-fatal: report generation should not break the test signal.
    console.warn("[scenario.test] Failed to write scenario-results.json:", err);
  }
});
