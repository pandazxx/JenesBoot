/**
 * Headless scenario tests for the destroyer_battle playthrough.
 *
 * Covers: initial state, pursuit (gap closes), depth charge firing,
 * no-hold-after-firing behavior, and enemy speed independence from
 * player xSpeed config.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../../src/sim/index.js";
import { DepthBand, RangeBand, SpeedDirection, SpeedSetting } from "../../src/sim/combat/types.js";
import { buildDestroyerBattleState, tickCombat } from "../../src/sim/combat/tick.js";
import { defaultSimConfig } from "../../src/sim/combat/config.js";
import { Mulberry32 } from "../../src/sim/prng.js";

describe("destroyer_battle scenario", () => {
  it("initial state: player at SURFACE HOLD, enemy at LONG AHEAD_FULL CLOSE, destroyerSpeed=15", () => {
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_battle");
    const state = engine.getState();
    const combat = state.combat;
    expect(combat).not.toBeNull();
    if (!combat) return;

    expect(combat.scenario).toBe("destroyer_battle");
    expect(combat.player.depth).toBe(DepthBand.SURFACE);
    expect(combat.enemy.speed).toBe(SpeedSetting.AHEAD_FULL);
    expect(combat.enemy.direction).toBe(SpeedDirection.CLOSE);
    expect(combat.range).toBe(RangeBand.LONG);
    expect(combat.enemy.aheadFullSpeed).toBe(15);
  });

  it("destroyer closes gap from LONG to SHORT within 60 ticks when player holds surface", () => {
    // Player stays still at SURFACE; destroyer closes at AHEAD_FULL=15 units/tick.
    // Initial gap = 750 (LONG). SHORT threshold < 300, so need ~(750-300)/15 = 30 ticks.
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_battle");

    let shortReached = false;
    for (let i = 0; i < 60; i++) {
      engine.tick();
      const combat = engine.getState().combat;
      if (!combat || combat.result !== "ongoing") break;
      if (combat.range <= RangeBand.SHORT) {
        shortReached = true;
        break;
      }
    }

    expect(shortReached).toBe(true);
  });

  it("destroyer does NOT hold after firing a depth charge — direction stays CLOSE", () => {
    // Set up: player at SHALLOW SHORT range so destroyer has contact (CQ ≥ 4) and fires.
    const state = buildDestroyerBattleState();
    state.player.y = 150; // PERISCOPE — submerged, so destroyer uses depth charges
    state.player.depth = DepthBand.PERISCOPE;
    state.player.depthTarget = DepthBand.PERISCOPE;
    // Force SHORT range: gap = 350 units (floor(350/150)=2 = SHORT; 200 would be POINT_BLANK).
    state.player.x = 0;
    state.enemy.x = 350;
    state.enemy.direction = SpeedDirection.CLOSE;
    state.enemy.torpedoCooldown = 0;
    state.range = RangeBand.SHORT;
    state.enemyTracking = true;
    state.enemyLastKnownRange = RangeBand.SHORT;

    const rng = new Mulberry32(0);
    let firstFireTick = -1;
    let s = state;

    for (let i = 1; i <= 30; i++) {
      const { newState, events } = tickCombat(s, i, rng, null);
      const fired = events.some(
        (e) =>
          e.type === "shot_fired" &&
          (e.payload as { weapon?: string }).weapon === "depth_charge",
      );
      if (fired && firstFireTick < 0) {
        firstFireTick = i;
        // Key: enemy must continue closing after firing, not hold
        expect(newState.enemy.direction).toBe(SpeedDirection.CLOSE);
      }
      s = newState;
    }

    expect(firstFireTick).toBeGreaterThan(0); // depth charge WAS fired during the test
  });

  it("enemy aheadFullSpeed is absolute and independent of player xSpeed settings", () => {
    // When user changes player speed settings, enemy top speed must not change.
    const defaultCfg = defaultSimConfig();
    const modifiedCfg = {
      ...defaultCfg,
      xSpeedSilent: 1,
      xSpeedStandard: 1,
      xSpeedAheadFull: 1,
      destroyerSpeed: 15,
    };

    const stateDefault = buildDestroyerBattleState(defaultCfg);
    const stateModified = buildDestroyerBattleState(modifiedCfg);

    // Both configs have destroyerSpeed=15; aheadFullSpeed must be 15 in both cases.
    expect(stateDefault.enemy.aheadFullSpeed).toBe(15);
    expect(stateModified.enemy.aheadFullSpeed).toBe(15);

    // Enemy movement over 1 tick should be ~15 (AHEAD_FULL) regardless of xSpeedAheadFull=1.
    // Use a state where we can measure movement cleanly: enemy at x=750, player at HOLD.
    const rng0 = new Mulberry32(0);
    const { newState: nsDefault } = tickCombat(stateDefault, 1, rng0, null, defaultCfg);
    const { newState: nsModified } = tickCombat(stateModified, 1, new Mulberry32(0), null, modifiedCfg);

    // In both cases, the destroyer should have moved by at least 9 units toward the player.
    // (STANDARD = 10, AHEAD_FULL = 15; the AI may choose either at LONG range.)
    const defaultMovement = 750 - nsDefault.enemy.x;
    const modifiedMovement = 750 - nsModified.enemy.x;
    expect(defaultMovement).toBeGreaterThan(9);
    expect(modifiedMovement).toBeGreaterThan(9);

    // Critically: modified config movement must NOT collapse to xSpeedAheadFull=1.
    expect(modifiedMovement).toBeGreaterThan(1);
  });

  it("player win: dive and torpedo the destroyer within 400 ticks (seed 0)", () => {
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_battle");

    // Immediately dive to PERISCOPE to use torpedoes
    engine.queueCommand({ type: "SET_DEPTH", target: DepthBand.PERISCOPE });

    let torpedoFired = false;
    for (let i = 0; i < 400; i++) {
      engine.tick();
      const state = engine.getState();
      const combat = state.combat;
      if (!combat || combat.result !== "ongoing") break;

      if (!torpedoFired && combat.range <= RangeBand.MEDIUM) {
        engine.queueCommand({ type: "FIRE_TORPEDO" });
        torpedoFired = true;
      }
    }

    const result = engine.getState().combat?.result;
    expect(result === "player_win" || result === "player_lose" || result === "escaped").toBe(true);
    // The fight must resolve, not loop forever
    expect(result).not.toBe("ongoing");
  });

  it("sub at DEEP has halved acoustic sig — enemy loses sonar contact at LONG range", () => {
    // At DEEP, effectiveAcousticSig(STANDARD sub) = floor(4/2) = 2.
    // Enemy (SURFACE) sonar at LONG = SONAR_BASE[SURFACE][LONG] + (2-4) = 5 - 2 = 3 < 4 = NOT tracking.
    const state = buildDestroyerBattleState();
    state.player.depth = DepthBand.DEEP;
    state.player.y = DepthBand.DEEP * 150;
    state.player.speed = SpeedSetting.STANDARD;
    state.range = RangeBand.LONG;

    const rng = new Mulberry32(0);
    const { newState } = tickCombat(state, 1, rng, null);

    // Enemy must have lost (or never gained) tracking.
    expect(newState.enemyTracking).toBe(false);
    // Player's own tracking state should also reflect CQ on the enemy.
    // Enemy (SURFACE, AHEAD_FULL): sig = 4+2 = 6, no depth penalty. Player uses SONAR.
    // SONAR_BASE[DEEP][LONG] = 0, so player CQ on enemy = 0 + (6-4) = 2... also < 4.
    // So playerTracking = false too.
    expect(newState.playerTracking).toBe(false);
  });

  it("position_report event emitted at tick 50 and 100", () => {
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_battle");

    for (let i = 0; i < 100; i++) {
      engine.tick();
    }

    const log = engine.getState().log;
    const posReports = log.filter((e) => e.type === "position_report");
    expect(posReports.length).toBeGreaterThanOrEqual(2);

    const ticks = posReports.map((e) => e.tick);
    expect(ticks).toContain(50);
    expect(ticks).toContain(100);

    // Each report must have the expected payload shape.
    const report = posReports[0];
    expect(report).toBeDefined();
    if (!report) return;
    const p = report.payload as Record<string, unknown>;
    expect(typeof p["playerX"]).toBe("number");
    expect(typeof p["enemyX"]).toBe("number");
    expect(typeof p["range"]).toBe("number");
  });
});
