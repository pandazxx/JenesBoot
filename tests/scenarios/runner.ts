/**
 * In-process scenario runner.
 *
 * Imports SimEngine directly — no subprocess, no binary build required.
 * The same module is importable by the browser-side QA viewer (PR #4).
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import { SimEngine } from "../../src/sim/index.js";
import type { SimInitialOverrides } from "../../src/sim/index.js";
import type { Scenario, ScenarioRunResult, AssertionResult, ScenarioInitial } from "./types.js";

function applyInitial(engine: ReturnType<typeof SimEngine>, initial: ScenarioInitial): void {
  const overrides: SimInitialOverrides = {};

  if (initial.playerDepth !== undefined) overrides.playerDepth = initial.playerDepth;
  if (initial.playerNauticalSpeed !== undefined)
    overrides.playerNauticalSpeed = initial.playerNauticalSpeed;
  if (initial.playerHorizontalIntent !== undefined)
    overrides.playerHorizontalIntent = initial.playerHorizontalIntent;
  if (initial.playerDiveSpeed !== undefined) overrides.playerDiveSpeed = initial.playerDiveSpeed;
  if (initial.enemyX !== undefined) overrides.enemyX = initial.enemyX;
  if (initial.enemyY !== undefined) overrides.enemyY = initial.enemyY;
  if (initial.enemyNauticalSpeed !== undefined)
    overrides.enemyNauticalSpeed = initial.enemyNauticalSpeed;
  if (initial.enemyHorizontalIntent !== undefined)
    overrides.enemyHorizontalIntent = initial.enemyHorizontalIntent;

  engine.setInitialState(overrides);
}

function makeResult(label: string, passed: boolean, detail?: string): AssertionResult {
  if (!passed && detail !== undefined) {
    return { label, passed, detail };
  }
  return { label, passed };
}

export function runScenario(scenario: Scenario): ScenarioRunResult {
  const maxTicks = scenario.maxTicks ?? 1000;
  const engine = SimEngine(scenario.seed);

  if (scenario.scenario !== undefined) {
    engine.startCombat(scenario.scenario);
  }

  if (scenario.initial !== undefined) {
    applyInitial(engine, scenario.initial);
  }

  const assertionResults: AssertionResult[] = [];
  const sortedScript = [...scenario.script].sort((a, b) => a.atTick - b.atTick);
  let scriptIndex = 0;
  let tickReached = 0;

  for (let tick = 1; tick <= maxTicks; tick++) {
    while (scriptIndex < sortedScript.length && sortedScript[scriptIndex]!.atTick === tick) {
      engine.queueCommand(sortedScript[scriptIndex]!.cmd);
      scriptIndex++;
    }

    engine.tick();
    tickReached = tick;

    const state = engine.getState();

    if (scenario.expect.atTick !== undefined) {
      for (const assertion of scenario.expect.atTick) {
        if (assertion.tick === tick) {
          const passed = assertion.predicate(state);
          assertionResults.push(
            makeResult(
              assertion.label,
              passed,
              passed ? undefined : `predicate returned false at tick ${tick}`,
            ),
          );
        }
      }
    }

    const hasCombatEnd = state.log.some((e) => e.type === "combat_end");
    const pendingScriptEntries = scriptIndex < sortedScript.length;

    if (hasCombatEnd && !pendingScriptEntries) {
      break;
    }
  }

  const finalState = engine.getState();
  const log = finalState.log;

  if (scenario.expect.finalState !== undefined) {
    const passed = scenario.expect.finalState(finalState);
    assertionResults.push(
      makeResult(
        "finalState predicate",
        passed,
        passed ? undefined : "finalState predicate returned false",
      ),
    );
  }

  if (scenario.expect.eventCounts !== undefined) {
    for (const [eventType, bounds] of Object.entries(scenario.expect.eventCounts)) {
      if (bounds === undefined) continue;
      const count = log.filter((e) => e.type === eventType).length;

      if (bounds.exact !== undefined) {
        const passed = count === bounds.exact;
        assertionResults.push(
          makeResult(
            `eventCounts["${eventType}"] exact ${bounds.exact}`,
            passed,
            passed
              ? undefined
              : `expected exactly ${bounds.exact} "${eventType}" events, got ${count}`,
          ),
        );
      } else {
        if (bounds.min !== undefined) {
          const passed = count >= bounds.min;
          assertionResults.push(
            makeResult(
              `eventCounts["${eventType}"] min ${bounds.min}`,
              passed,
              passed
                ? undefined
                : `expected at least ${bounds.min} "${eventType}" events, got ${count}`,
            ),
          );
        }
        if (bounds.max !== undefined) {
          const passed = count <= bounds.max;
          assertionResults.push(
            makeResult(
              `eventCounts["${eventType}"] max ${bounds.max}`,
              passed,
              passed
                ? undefined
                : `expected at most ${bounds.max} "${eventType}" events, got ${count}`,
            ),
          );
        }
      }
    }
  }

  if (scenario.expect.finalCombatResult !== undefined) {
    const combatResult = finalState.combat?.result ?? null;
    const passed = combatResult === scenario.expect.finalCombatResult;
    assertionResults.push(
      makeResult(
        `finalCombatResult === "${scenario.expect.finalCombatResult}"`,
        passed,
        passed
          ? undefined
          : `expected combat result "${scenario.expect.finalCombatResult}", got "${combatResult ?? "null (no combat)"}"`,
      ),
    );
  }

  const passed = assertionResults.length === 0 ? true : assertionResults.every((r) => r.passed);

  return {
    final: finalState,
    log,
    assertionResults,
    passed,
    tickReached,
  };
}
