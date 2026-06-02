/**
 * Unit tests for destroyer pursuit mechanics.
 *
 * Covers: destroyer closing from LONG range, weapon fire, position reports,
 * and player win/lose resolution.
 *
 * Uses tickCombat + buildInitialState directly for low-level white-box tests.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";
import { buildInitialState } from "../combat/state.js";
import { tickCombat } from "../combat/tick.js";
import { defaultCombatConfig } from "../combat/config.js";
import { Mulberry32 } from "../prng.js";
import {
  VesselType,
  DepthBand,
  NauticalSpeed,
  DiveSpeed,
  RangeBand,
  VisibilityLevel,
} from "../combat/enums.js";

describe("destroyer pursuit scenario", () => {
  it("initial state: player at SURFACE, destroyer FULL_AHEAD CLOSE at LONG range", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);
    const state = engine.getState();
    const combat = state.combat;
    expect(combat).not.toBeNull();
    if (!combat) return;

    expect(combat.enemyType).toBe(VesselType.DESTROYER);
    expect(combat.player.depth).toBe(DepthBand.SURFACE);
    expect(combat.enemy.nauticalSpeed).toBe(NauticalSpeed.FULL_AHEAD);
    expect(combat.enemy.horizontalIntent).toBe(-1);
    expect(combat.enemy.x).toBeGreaterThan(500);
  });

  it("destroyer closes gap: enemy x decreases toward player over time", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);

    const xStart = engine.getState().combat!.enemy.x;
    for (let i = 0; i < 30; i++) engine.tick();
    const xAfter = engine.getState().combat!.enemy.x;

    expect(xAfter).toBeLessThan(xStart);
  });

  it("destroyer closes from LONG to SHORT within 60 ticks when player holds surface", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);

    let shortReached = false;
    for (let i = 0; i < 60; i++) {
      engine.tick();
      const combat = engine.getState().combat;
      if (!combat || combat.result !== "ongoing") break;

      const gap = Math.abs(combat.enemy.x - combat.player.x);
      if (gap < 300) {
        shortReached = true;
        break;
      }
    }

    expect(shortReached).toBe(true);
  });

  it("tickCombat: destroyer fires depth_charge when player is submerged and close", () => {
    const config = defaultCombatConfig();
    const state = buildInitialState(VesselType.DESTROYER, config);

    // Place player at PERISCOPE SHORT range (gap ~250 units)
    state.player.y = 150;
    state.player.depth = DepthBand.PERISCOPE;
    state.player.depthTarget = DepthBand.PERISCOPE;
    state.player.x = 0;
    state.player.nauticalSpeed = NauticalSpeed.HALF_AHEAD;
    state.player.horizontalIntent = 0;

    // Destroyer at SHORT range, closing
    state.enemy.x = 250;
    state.enemy.nauticalSpeed = NauticalSpeed.FULL_AHEAD;
    state.enemy.horizontalIntent = -1;
    // Force AI to have contact
    state.enemyAi.currentVisibility = VisibilityLevel.CONTACT;
    state.enemyAi.lastKnownX = 0;
    state.enemyAi.lastKnownY = 150;
    // Reset cooldowns so weapons can fire immediately
    state.enemy.weaponCooldowns = { deck_gun: 0, depth_charge: 0 };

    const rng = new Mulberry32(0);
    let depthChargeFired = false;

    let s = state;
    for (let i = 1; i <= 30; i++) {
      const { newState, events } = tickCombat(s, i, rng, null, config);
      const fired = events.some(
        (e) =>
          e.type === "weapon_fired" &&
          (e.payload as { weaponId?: string }).weaponId === "depth_charge",
      );
      if (fired) {
        depthChargeFired = true;
        break;
      }
      s = newState;
    }

    expect(depthChargeFired).toBe(true);
  });

  it("tickCombat: enemy speed config is absolute and independent of player speed config", () => {
    const config = defaultCombatConfig();

    // Verify destroyer starts at FULL_AHEAD speed config values (~15 units/tick)
    const destroyerCfg = config.vessels[VesselType.DESTROYER];
    expect(destroyerCfg).toBeDefined();
    const fullAheadSpeed =
      destroyerCfg!.speedConfig.horizontalTable[NauticalSpeed.FULL_AHEAD]![DepthBand.SURFACE] ?? 0;
    expect(fullAheadSpeed).toBe(15);

    // Player's speed config should be different
    const playerFullAheadSpeed =
      config.player.speedConfig.horizontalTable[NauticalSpeed.FULL_AHEAD]![DepthBand.SURFACE] ?? 0;
    expect(playerFullAheadSpeed).toBe(14);
  });

  it("player win: dive silent and torpedo the destroyer within 400 ticks (seed 42)", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.DESTROYER);

    // Dive to PERISCOPE and go silent — DEAD_SLOW avoids destroyer sonar
    engine.queueCommand({
      type: "SET_DEPTH",
      target: DepthBand.PERISCOPE,
      diveSpeed: DiveSpeed.STANDARD,
    });

    let wentSilent = false;
    for (let i = 0; i < 400; i++) {
      engine.tick();
      const state = engine.getState();
      const combat = state.combat;
      if (!combat || combat.result !== "ongoing") break;

      if (!wentSilent && combat.player.depth === DepthBand.PERISCOPE) {
        engine.queueCommand({
          type: "SET_NAUTICAL_SPEED",
          speed: NauticalSpeed.DEAD_SLOW,
          intent: 0,
        });
        wentSilent = true;
      } else if (wentSilent) {
        engine.queueCommand({ type: "FIRE_WEAPON", weaponId: "torpedo" });
      }
    }

    const result = engine.getState().combat?.result;
    expect(result).toBe("player_win");
  });

  it("position_report events emitted at configured interval", () => {
    const config = defaultCombatConfig();
    const interval = config.positionReportInterval;

    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);

    // Run for at least one interval
    for (let i = 0; i < interval; i++) {
      engine.tick();
      const combat = engine.getState().combat;
      if (!combat || combat.result !== "ongoing") break;
    }

    const log = engine.getState().log;
    const posReports = log.filter((e) => e.type === "position_report");
    expect(posReports.length).toBeGreaterThanOrEqual(1);

    const report = posReports[0];
    expect(report).toBeDefined();
    if (!report) return;
    const p = report.payload as Record<string, unknown>;
    expect(typeof p["playerX"]).toBe("number");
    expect(typeof p["enemyX"]).toBe("number");
    expect(typeof p["rangeBand"]).toBe("number");
  });

  it("range_change event emitted when destroyer closes from LONG to SHORT", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);

    for (let i = 0; i < 60; i++) {
      engine.tick();
      const combat = engine.getState().combat;
      if (!combat || combat.result !== "ongoing") break;
    }

    const rangeChanges = engine.getState().log.filter((e) => e.type === "range_change");
    expect(rangeChanges.length).toBeGreaterThanOrEqual(1);

    // At least one should show a transition to a closer range
    const closerTransition = rangeChanges.some(
      (e) => ((e.payload as Record<string, unknown>)["to"] as number) <= RangeBand.SHORT,
    );
    expect(closerTransition).toBe(true);
  });
});
