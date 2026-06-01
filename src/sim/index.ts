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
import { VesselType } from "./combat/enums.js";
import type { NauticalSpeed, DiveSpeed, DepthBand } from "./combat/enums.js";
import { buildInitialState } from "./combat/state.js";
import { toDepthBand } from "./combat/geometry.js";
import { tickCombat } from "./combat/tick.js";
import type { PlayerCommand } from "./combat/types.js";
import { defaultCombatConfig } from "./combat/config.js";
import type { CombatConfig } from "./combat/config.js";

export type { SimEvent, SimState } from "./types.js";
export type { PlayerCommand } from "./combat/types.js";
export type { CombatConfig } from "./combat/config.js";
export { VesselType } from "./combat/enums.js";

/**
 * Initial-state overrides applied after startCombat() and before tick 1.
 * Only callable once; ignored if called after the first tick.
 * Keep this minimal — add fields only when scenarios actually need them.
 */
export interface SimInitialOverrides {
  playerNauticalSpeed?: NauticalSpeed;
  playerHorizontalIntent?: -1 | 0 | 1;
  playerDepth?: DepthBand;
  playerDiveSpeed?: DiveSpeed;
  enemyX?: number;
  enemyY?: number;
  enemyNauticalSpeed?: NauticalSpeed;
  enemyHorizontalIntent?: -1 | 0 | 1;
}

/** Scenario names — map directly to VesselType enemies by convention. */
export type CombatScenario = VesselType;

/** Public interface for the simulation engine. */
export interface ISimEngine {
  tick(): void;
  getState(): SimState;
  startCombat(enemyType: VesselType): void;
  /**
   * Apply initial-state overrides to the combat state.
   * Must be called after startCombat() and before the first tick().
   * Calling after tick 1 is a no-op.
   */
  setInitialState(overrides: SimInitialOverrides): void;
  queueCommand(cmd: PlayerCommand): void;
  setConfig(config: CombatConfig): void;
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
  private config: CombatConfig;

  constructor(seed: number, config: CombatConfig = defaultCombatConfig()) {
    this.seed = seed;
    this.rng = new Mulberry32(seed);
    this.config = config;
  }

  setConfig(config: CombatConfig): void {
    this.config = config;
  }

  startCombat(enemyType: VesselType): void {
    this.combatState = buildInitialState(enemyType, this.config);
    this.combatRng = new Mulberry32((this.seed ^ 0xdead) >>> 0);
  }

  setInitialState(overrides: SimInitialOverrides): void {
    if (this.currentTick > 0 || this.combatState === null) return;

    const p = this.combatState.player;
    const e = this.combatState.enemy;

    if (overrides.playerDepth !== undefined) {
      p.depth = overrides.playerDepth;
      p.depthTarget = overrides.playerDepth;
      p.y = overrides.playerDepth * 150;
    }
    if (overrides.playerNauticalSpeed !== undefined)
      p.nauticalSpeed = overrides.playerNauticalSpeed;
    if (overrides.playerHorizontalIntent !== undefined)
      p.horizontalIntent = overrides.playerHorizontalIntent;
    if (overrides.playerDiveSpeed !== undefined) p.diveSpeed = overrides.playerDiveSpeed;

    if (overrides.enemyX !== undefined) e.x = overrides.enemyX;
    if (overrides.enemyY !== undefined) {
      e.y = overrides.enemyY;
      e.depth = toDepthBand(overrides.enemyY);
      e.depthTarget = e.depth;
    }
    if (overrides.enemyNauticalSpeed !== undefined) e.nauticalSpeed = overrides.enemyNauticalSpeed;
    if (overrides.enemyHorizontalIntent !== undefined)
      e.horizontalIntent = overrides.enemyHorizontalIntent;
  }

  queueCommand(cmd: PlayerCommand): void {
    this.pendingCommand = cmd;
  }

  tick(): void {
    this.currentTick += 1;

    if (this.currentTick === 1) {
      this.emit("hello", { message: "sim running" });

      if (this.combatState !== null) {
        this.emit("combat_start", {
          playerHP: this.combatState.player.hullHP,
          enemyHP: this.combatState.enemy.hullHP,
          enemyType: this.combatState.enemyType,
        });
      }
    }

    if (this.combatState !== null && this.combatState.result === "ongoing") {
      const rng = this.combatRng ?? this.rng;
      const cmd = this.pendingCommand ?? null;
      this.pendingCommand = null;
      const { newState, events } = tickCombat(
        this.combatState,
        this.currentTick,
        rng,
        cmd,
        this.config,
      );
      this.combatState = newState;
      for (const ev of events) {
        this.emit(ev.type, ev.payload);
      }
    } else {
      this.pendingCommand = null;
      void this.rng.next();
    }
  }

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
              enemyAi: { ...this.combatState.enemyAi },
              inFlight: [...this.combatState.inFlight],
            }
          : null,
    };
  }

  private emit(type: string, payload: unknown): void {
    this.eventLog.push({ tick: this.currentTick, type, payload });
  }
}

function SimEngineFactory(seed: number, config?: CombatConfig): ISimEngine {
  return new SimEngineImpl(seed, config);
}

SimEngineFactory.prototype = SimEngineImpl.prototype;

export const SimEngine: {
  (seed: number, config?: CombatConfig): ISimEngine;
  new (seed: number, config?: CombatConfig): ISimEngine;
} = SimEngineFactory as unknown as {
  (seed: number, config?: CombatConfig): ISimEngine;
  new (seed: number, config?: CombatConfig): ISimEngine;
};
