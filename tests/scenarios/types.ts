/**
 * Scenario type definitions for the in-process scenario runner.
 *
 * Re-exports from src/scenarios/types.ts (canonical location).
 * Kept here for back-compat with test files that import from "./types.js".
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

export type {
  PlayerCommand,
  CombatScenario,
  ScenarioInitial,
  ScriptEntry,
  AtTickAssertion,
  ExpectClause,
  Scenario,
  AssertionResult,
  ScenarioRunResult,
} from "../../src/scenarios/types.js";

export { defineScenario } from "../../src/scenarios/types.js";
