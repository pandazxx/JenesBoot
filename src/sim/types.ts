/**
 * Core simulation types.
 *
 * This module has zero imports from PixiJS, DOM APIs, or any module that
 * touches window / document. Keep it that way.
 */

import type { CombatState } from "./combat/types.js";

/** A single structured event emitted by the simulation. */
export interface SimEvent {
  tick: number;
  type: string;
  payload: unknown;
}

/** Full observable state returned by SimEngine.getState(). */
export interface SimState {
  /** How many ticks have elapsed since construction. */
  tick: number;
  /** Ordered list of all events emitted so far. */
  log: SimEvent[];
  /** Current value of the PRNG state (for reproducibility checks). */
  rngState: number;
  /** Active combat state, or null when not in combat. */
  combat: CombatState | null;
}
