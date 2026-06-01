/**
 * Scenario type definitions — canonical location.
 *
 * These types are consumed by:
 *   - tests/scenarios/types.ts  (re-exports for back-compat with test runner)
 *   - src/scenarios/registry.ts (scenario registry for the QA viewer)
 *   - src/qa/main.ts            (browser-side playback viewer)
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import type { SimState, SimEvent } from "../sim/index.js";
import type { PlayerCommand } from "../sim/combat/types.js";
import type { VesselType, NauticalSpeed, DiveSpeed, DepthBand } from "../sim/combat/enums.js";

export type CombatScenario = VesselType;
export type { PlayerCommand };
export type { SimState, SimEvent };

/**
 * Optional state overrides applied immediately after startCombat() and
 * before tick 1.
 */
export interface ScenarioInitial {
  playerDepth?: DepthBand;
  playerNauticalSpeed?: NauticalSpeed;
  playerHorizontalIntent?: -1 | 0 | 1;
  playerDiveSpeed?: DiveSpeed;
  enemyX?: number;
  enemyY?: number;
  enemyNauticalSpeed?: NauticalSpeed;
  enemyHorizontalIntent?: -1 | 0 | 1;
}

/** A command scheduled at a specific tick. */
export interface ScriptEntry {
  atTick: number;
  cmd: PlayerCommand;
}

/** Assertion evaluated after the run completes or at a specific tick. */
export interface AtTickAssertion {
  tick: number;
  predicate: (state: SimState) => boolean;
  label: string;
}

/**
 * All assertions for a scenario. Every field is optional — include only
 * what the scenario's intent actually requires.
 */
export interface ExpectClause {
  atTick?: AtTickAssertion[];
  finalState?: (state: SimState) => boolean;
  eventCounts?: Partial<Record<string, { min?: number; max?: number; exact?: number }>>;
  finalCombatResult?: "player_win" | "player_lose" | "escaped" | "ongoing";
}

/**
 * A fully self-contained scenario declaration.
 *
 * id         — stable slug, used in URLs and golden filenames (lowercase-kebab)
 * title      — human label for test reports and the scenario picker
 * seed       — seeds the SimEngine; same seed + same script = same outcome
 * scenario   — if set, engine.startCombat(scenario) is called on tick 0
 * initial    — optional state overrides applied before tick 1
 * script     — ordered list of commands queued at specific ticks
 * expect     — assertions evaluated during / after the run
 * maxTicks   — safety bound; run stops at this tick even without a terminal event
 */
export interface Scenario {
  id: string;
  title: string;
  seed: number;
  scenario?: CombatScenario;
  initial?: ScenarioInitial;
  script: ScriptEntry[];
  expect: ExpectClause;
  maxTicks?: number;
}

export interface AssertionResult {
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ScenarioRunResult {
  final: SimState;
  log: SimEvent[];
  assertionResults: AssertionResult[];
  passed: boolean;
  tickReached: number;
}

export function defineScenario(s: Scenario): Scenario {
  return s;
}

/**
 * A player-facing starting position.
 */
export interface PlayerScenario {
  id: string;
  title: string;
  description: string;
  seed: number;
  scenario?: CombatScenario;
  initial?: ScenarioInitial;
}

export function definePlayerScenario(s: PlayerScenario): PlayerScenario {
  return s;
}
