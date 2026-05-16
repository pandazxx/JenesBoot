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
import { RoomType } from "./combat/types.js";
import {
  tickCombat,
  buildSurfaceBattleState,
  buildDestroyerDiveState,
  buildGunboatHuntState,
  buildDestroyerBattleState,
  buildSubmergedAmbushState,
} from "./combat/tick.js";
import type { PlayerCommand } from "./combat/tick.js";
import { type SimConfig, defaultSimConfig } from "./combat/config.js";

export type { SimEvent, SimState } from "./types.js";
export type { PlayerCommand } from "./combat/tick.js";
export type { SimConfig } from "./combat/config.js";

export type CombatScenario =
  | "surface_battle"
  | "destroyer_dive"
  | "gunboat_hunt"
  | "destroyer_battle"
  | "submerged_ambush";

/** Public interface for the simulation engine. */
export interface ISimEngine {
  tick(): void;
  getState(): SimState;
  startCombat(scenario: CombatScenario): void;
  queueCommand(cmd: PlayerCommand): void;
  setConfig(config: SimConfig): void;
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
  private config: SimConfig;

  constructor(seed: number, config: SimConfig = defaultSimConfig()) {
    this.seed = seed;
    this.rng = new Mulberry32(seed);
    this.config = config;
  }

  setConfig(config: SimConfig): void {
    this.config = config;
  }

  startCombat(scenario: CombatScenario): void {
    if (scenario === "surface_battle") {
      this.combatState = buildSurfaceBattleState(this.config);
    } else if (scenario === "destroyer_dive") {
      this.combatState = buildDestroyerDiveState(this.config);
    } else if (scenario === "gunboat_hunt") {
      this.combatState = buildGunboatHuntState(this.config);
    } else if (scenario === "destroyer_battle") {
      this.combatState = buildDestroyerBattleState(this.config);
    } else if (scenario === "submerged_ambush") {
      this.combatState = buildSubmergedAmbushState(this.config);
    }
    this.combatRng = new Mulberry32((this.seed ^ 0xdead) >>> 0);
  }

  /**
   * Queue a player command.
   *
   * SET_SPEED, SET_DEPTH, and ASSIGN_CREW are sticky: applied immediately so
   * state is visible in getState() before the next tick.
   *
   * SET_DEPTH is gated on bridge being crewed — ignored otherwise.
   *
   * FIRE_* commands are one-shot: consumed on the next tick then cleared.
   */
  queueCommand(cmd: PlayerCommand): void {
    if (cmd.type === "SET_SPEED" && this.combatState !== null) {
      this.combatState.player.speed = cmd.speed;
      this.combatState.player.direction = cmd.direction;
    } else if (cmd.type === "SET_DEPTH" && this.combatState !== null) {
      const bridgeCrewed = this.combatState.rooms.some(
        (r) => r.type === RoomType.BRIDGE && r.crewIds.length > 0,
      );
      if (bridgeCrewed) {
        this.combatState.player.depthTarget = cmd.target;
      }
    } else if (cmd.type === "ASSIGN_CREW" && this.combatState !== null) {
      const crew = this.combatState.crew.find((c) => c.id === cmd.crewId);
      if (crew) {
        const oldRoom = this.combatState.rooms.find((r) => r.crewIds.includes(cmd.crewId));
        if (oldRoom) oldRoom.crewIds = oldRoom.crewIds.filter((id) => id !== cmd.crewId);
        crew.roomId = cmd.roomId;
        const newRoom = this.combatState.rooms.find((r) => r.id === cmd.roomId);
        if (newRoom && !newRoom.crewIds.includes(cmd.crewId)) newRoom.crewIds.push(cmd.crewId);
      }
    } else {
      this.pendingCommand = cmd;
    }
  }

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
              inFlight: [...this.combatState.inFlight],
              crew: this.combatState.crew.map((c) => ({ ...c })),
              rooms: this.combatState.rooms.map((r) => ({ ...r, crewIds: [...r.crewIds] })),
            }
          : null,
    };
  }

  private emit(type: string, payload: unknown): void {
    this.eventLog.push({ tick: this.currentTick, type, payload });
  }
}

function SimEngineFactory(seed: number, config?: SimConfig): ISimEngine {
  return new SimEngineImpl(seed, config);
}

SimEngineFactory.prototype = SimEngineImpl.prototype;

export const SimEngine: {
  (seed: number, config?: SimConfig): ISimEngine;
  new (seed: number, config?: SimConfig): ISimEngine;
} = SimEngineFactory as unknown as {
  (seed: number, config?: SimConfig): ISimEngine;
  new (seed: number, config?: SimConfig): ISimEngine;
};
