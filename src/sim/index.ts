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
import type { CombatState } from "./combat/types.js";
import { tickCombat, buildSurfaceBattleState } from "./combat/tick.js";
import type { PlayerCommand } from "./combat/tick.js";

export type { SimEvent, SimState } from "./types.js";
export type { PlayerCommand } from "./combat/tick.js";

/** Public interface for the simulation engine. */
export interface ISimEngine {
  tick(): void;
  getState(): SimState;
  startCombat(scenario: "surface_battle"): void;
  queueCommand(cmd: PlayerCommand): void;
}

/** Internal class — use the SimEngine factory/constructor export below. */
class SimEngineImpl implements ISimEngine {
  private currentTick: number = 0;
  private eventLog: SimEvent[] = [];
  private rng: Mulberry32;
  private seed: number;
  private combatState: CombatState | null = null;
  private combatRng: Mulberry32 | null = null;
  private pendingCommand: PlayerCommand | null = null;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new Mulberry32(seed);
  }

  /** Initialise a combat encounter for the named scenario. */
  startCombat(scenario: "surface_battle"): void {
    if (scenario === "surface_battle") {
      this.combatState = buildSurfaceBattleState();
      // Seed the combat RNG independently so it is deterministic per seed
      // without sharing state with the main RNG stream.
      this.combatRng = new Mulberry32((this.seed ^ 0xdead) >>> 0);
    }
  }

  /** Queue a player command.
   *
   * SET_SPEED is applied immediately and sticks across ticks — the player's
   * chosen speed and direction persist until they change it again. This means
   * the HUD updates even during pause and the setting is never overridden by
   * the auto-pilot.
   *
   * FIRE_DECK_GUN is one-shot: consumed on the next tick and then cleared.
   */
  queueCommand(cmd: PlayerCommand): void {
    if (
      cmd.type === "SET_SPEED" &&
      cmd.speed !== undefined &&
      cmd.direction !== undefined &&
      this.combatState !== null
    ) {
      this.combatState.player.speed = cmd.speed;
      this.combatState.player.direction = cmd.direction;
    } else {
      this.pendingCommand = cmd;
    }
  }

  /** Advance simulation by one tick. */
  tick(): void {
    this.currentTick += 1;

    if (this.currentTick === 1) {
      this.emit("hello", { message: "sim running" });

      if (this.combatState !== null) {
        this.emit("combat_start", {
          playerHP: this.combatState.player.hullHP,
          enemyHP: this.combatState.enemy.hullHP,
          range: this.combatState.range,
        });
      }
    }

    if (this.combatState !== null && this.combatState.result === "ongoing") {
      const rng = this.combatRng ?? this.rng;
      const cmd = this.pendingCommand ?? null;
      this.pendingCommand = null;
      const { newState, events } = tickCombat(this.combatState, this.currentTick, rng, cmd);
      this.combatState = newState;
      for (const ev of events) {
        this.emit(ev.type, ev.payload);
      }
    } else {
      this.pendingCommand = null;
      // Consume one RNG value per tick to keep main RNG state advancing
      void this.rng.next();
    }
  }

  /** Return a snapshot of current simulation state. */
  getState(): SimState {
    return {
      tick: this.currentTick,
      log: [...this.eventLog],
      rngState: this.rng.getState(),
      combat:
        this.combatState !== null
          ? {
              ...this.combatState,
              player: { ...this.combatState.player },
              enemy: { ...this.combatState.enemy },
              inFlight: [...this.combatState.inFlight],
            }
          : null,
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
} = SimEngineFactory as unknown as {
  (seed: number): ISimEngine;
  new (seed: number): ISimEngine;
};
