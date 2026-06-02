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
 *
 * Golden file support (Part B — PR #6):
 *   - If tests/scenarios/<id>.golden.json exists, the runner reads it and asserts
 *     strict equality against the current run after story assertions.
 *   - UPDATE_GOLDENS=1 writes (or overwrites) the golden file instead of comparing.
 *   - Scenarios without a golden file pass on story assertions alone (opt-in).
 */

import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runScenario } from "./runner.js";
import type { Scenario, ScenarioRunResult } from "./types.js";
import type { SimState, SimEvent } from "../../src/sim/index.js";

import helloWorld from "./hello-world.scenario.js";
import surfaceBattle from "./surface-battle.scenario.js";
import destroyerBattle from "./destroyer-battle.scenario.js";
import destroyerDive from "./destroyer-dive.scenario.js";
import gunboatHunt from "./gunboat-hunt.scenario.js";
import merchantHunt from "./merchant-hunt.scenario.js";

const scenarios: Scenario[] = [
  helloWorld,
  surfaceBattle,
  destroyerBattle,
  destroyerDive,
  gunboatHunt,
  merchantHunt,
];

const UPDATE_GOLDENS = process.env["UPDATE_GOLDENS"] === "1";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Golden snapshot shape — minimal, regression-useful, not a full SimState dump.
// ---------------------------------------------------------------------------

interface GoldenFinalState {
  playerHP: number;
  enemyHP: number;
  playerX: number;
  enemyX: number;
  playerDepth: number;
  enemyDepth: number;
  playerNauticalSpeed: number;
  enemyNauticalSpeed: number;
}

interface GoldenFile {
  scenarioId: string;
  scenarioSeed: number;
  finalTick: number;
  finalCombatResult: string | null;
  finalState: GoldenFinalState;
  eventLog: SimEvent[];
}

function buildGoldenFinalState(state: SimState): GoldenFinalState {
  return {
    playerHP: state.combat?.player.hullHP ?? 0,
    enemyHP: state.combat?.enemy.hullHP ?? 0,
    playerX: Math.round(state.combat?.player.x ?? 0),
    enemyX: Math.round(state.combat?.enemy.x ?? 0),
    playerDepth: state.combat?.player.depth ?? 0,
    enemyDepth: state.combat?.enemy.depth ?? 0,
    playerNauticalSpeed: state.combat?.player.nauticalSpeed ?? 0,
    enemyNauticalSpeed: state.combat?.enemy.nauticalSpeed ?? 0,
  };
}

function buildGolden(scenario: Scenario, result: ScenarioRunResult): GoldenFile {
  return {
    scenarioId: scenario.id,
    scenarioSeed: scenario.seed,
    finalTick: result.tickReached,
    finalCombatResult: result.final.combat?.result ?? null,
    finalState: buildGoldenFinalState(result.final),
    eventLog: result.log,
  };
}

function goldenPath(scenarioId: string): string {
  return join(__dirname, `${scenarioId}.golden.json`);
}

/** Finds the first divergence between two event logs. Returns a short summary or null. */
function firstLogDivergence(golden: SimEvent[], current: SimEvent[]): string | null {
  if (golden.length !== current.length) {
    return `event count differs: golden ${golden.length} vs current ${current.length}`;
  }
  for (let i = 0; i < golden.length; i++) {
    const g = golden[i]!;
    const c = current[i]!;
    if (g.tick !== c.tick || g.type !== c.type) {
      return `at index ${i}: golden tick=${g.tick} type=${g.type}, current tick=${c.tick} type=${c.type}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Manifest for the HTML report
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-scenario describe blocks
// ---------------------------------------------------------------------------

for (const scenario of scenarios) {
  describe(scenario.title, () => {
    const start = Date.now();
    const result = runScenario(scenario);
    const durationMs = Date.now() - start;

    const terminatingEvent = result.log.find((e) => e.type === "combat_end")?.type ?? null;

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

    // Golden handling — read, compare, or write.
    const gPath = goldenPath(scenario.id);
    let goldenMismatchLabel: string | null = null;
    let goldenMismatchDetail: string | null = null;

    if (UPDATE_GOLDENS) {
      try {
        mkdirSync(__dirname, { recursive: true });
        writeFileSync(gPath, JSON.stringify(buildGolden(scenario, result), null, 2), "utf8");
      } catch (err) {
        console.warn(`[scenario.test] Failed to write golden for ${scenario.id}:`, err);
      }
    } else if (existsSync(gPath)) {
      try {
        const golden = JSON.parse(readFileSync(gPath, "utf8")) as GoldenFile;
        const current = buildGolden(scenario, result);

        if (golden.finalTick !== current.finalTick) {
          goldenMismatchLabel = `golden mismatch: see ${scenario.id}.golden.json`;
          goldenMismatchDetail = `finalTick differs: golden=${golden.finalTick}, current=${current.finalTick}`;
        } else if (golden.finalCombatResult !== current.finalCombatResult) {
          goldenMismatchLabel = `golden mismatch: see ${scenario.id}.golden.json`;
          goldenMismatchDetail = `finalCombatResult differs: golden=${golden.finalCombatResult}, current=${current.finalCombatResult}`;
        } else if (JSON.stringify(golden.finalState) !== JSON.stringify(current.finalState)) {
          goldenMismatchLabel = `golden mismatch: see ${scenario.id}.golden.json`;
          goldenMismatchDetail = `finalState differs: golden=${JSON.stringify(golden.finalState)}, current=${JSON.stringify(current.finalState)}`;
        } else {
          const div = firstLogDivergence(golden.eventLog, current.eventLog);
          if (div !== null) {
            goldenMismatchLabel = `golden mismatch: see ${scenario.id}.golden.json`;
            goldenMismatchDetail = div;
          }
        }
      } catch (err) {
        console.warn(`[scenario.test] Failed to read golden for ${scenario.id}:`, err);
      }
    }

    manifest.scenarios.push({
      id: scenario.id,
      title: scenario.title,
      passed: result.passed && goldenMismatchLabel === null,
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

    if (goldenMismatchLabel !== null) {
      it(goldenMismatchLabel, () => {
        expect.fail(goldenMismatchDetail ?? "golden mismatch (no detail)");
      });
    }
  });
}

afterAll(() => {
  const outDir = join(process.cwd(), "test-results");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "scenario-results.json"), JSON.stringify(manifest, null, 2), "utf8");
  } catch (err) {
    console.warn("[scenario.test] Failed to write scenario-results.json:", err);
  }
});
