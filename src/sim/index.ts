/**
 * SimEngine — the heart of the simulation.
 *
 * Rules for this file and everything it imports:
 *   - No PixiJS imports.
 *   - No DOM APIs (window, document, navigator, …).
 *   - No Math.random() — use this.rng.next() instead.
 *   - No wall-clock reads (Date.now(), performance.now(), …).
 *
 * The same SimEngine instance runs identically in the browser (web build)
 * and in Node (headless build).
 *
 * SimEngine is exported as a factory function so callers can write:
 *   const engine = SimEngine(42);
 * as well as the constructor form:
 *   const engine = new SimEngine(42);
 */

import { Mulberry32 } from "./prng.js";
import type { SimEvent, SimState } from "./types.js";

export type { SimEvent, SimState } from "./types.js";

/** Public interface for the simulation engine. */
export interface ISimEngine {
  tick(): void;
  getState(): SimState;
}

/** Internal class — use the SimEngine factory/constructor export below. */
class SimEngineImpl implements ISimEngine {
  private currentTick: number = 0;
  private eventLog: SimEvent[] = [];
  private rng: Mulberry32;

  constructor(seed: number) {
    this.rng = new Mulberry32(seed);
  }

  /** Advance simulation by one tick. */
  tick(): void {
    this.currentTick += 1;

    if (this.currentTick === 1) {
      this.emit("hello", { message: "sim running" });
    }

    // Future mechanics go here. Always use this.rng.next() for randomness.
    void this.rng.next(); // consume one value per tick to keep state advancing
  }

  /** Return a snapshot of current simulation state. */
  getState(): SimState {
    return {
      tick: this.currentTick,
      log: [...this.eventLog],
      rngState: this.rng.getState(),
    };
  }

  private emit(type: string, payload: unknown): void {
    this.eventLog.push({ tick: this.currentTick, type, payload });
  }
}

/**
 * SimEngine factory / constructor.
 *
 * Works both as a plain function call and with `new`:
 *   const engine = SimEngine(42);    // factory style
 *   const engine = new SimEngine(42); // constructor style
 */
function SimEngineFactory(seed: number): ISimEngine {
  return new SimEngineImpl(seed);
}

/** Allow `new SimEngine(seed)` to also work. */
SimEngineFactory.prototype = SimEngineImpl.prototype;

export const SimEngine: {
  (seed: number): ISimEngine;
  new (seed: number): ISimEngine;
} = SimEngineFactory as unknown as { (seed: number): ISimEngine; new (seed: number): ISimEngine };
