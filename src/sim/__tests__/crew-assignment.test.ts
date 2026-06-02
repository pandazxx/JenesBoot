/**
 * Unit tests for setInitialState and basic combat engine mechanics.
 *
 * The crew/room system from qa-build-entry was not carried forward into
 * battle-rework. These tests cover the setInitialState API and verifying
 * that combat resolves correctly via the engine.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";
import type { SimState } from "../index.js";
import { VesselType, DepthBand, NauticalSpeed } from "../combat/enums.js";

describe("setInitialState and engine basics", () => {
  it("initial state: player at SURFACE, enemy at default x after startCombat", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.MERCHANT);
    const combat = engine.getState().combat;
    expect(combat).not.toBeNull();
    expect(combat!.player.depth).toBe(DepthBand.SURFACE);
    expect(combat!.enemy.x).toBeGreaterThan(0);
  });

  it("startCombat emits combat_start on first tick", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.MERCHANT);
    engine.tick();
    const log = engine.getState().log;
    const startEvent = log.find((e) => e.type === "combat_start");
    expect(startEvent).toBeDefined();
  });

  it("run 300 ticks vs merchant — combat ends with player_win when firing deck gun", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.MERCHANT);
    engine.setInitialState({
      playerNauticalSpeed: NauticalSpeed.FULL_AHEAD,
      playerHorizontalIntent: 1,
    });

    for (let i = 0; i < 300; i++) {
      // Fire deck gun every 10 ticks
      if ((i + 1) % 10 === 0) {
        engine.queueCommand({ type: "FIRE_WEAPON", weaponId: "deck_gun" });
      }
      engine.tick();
      const combat = engine.getState().combat;
      if (combat?.result !== "ongoing") break;
    }

    const state = engine.getState();
    const combatEnd = state.log.find((e) => e.type === "combat_end");
    expect(combatEnd).toBeDefined();
    const result = (combatEnd!.payload as Record<string, unknown>)["result"];
    expect(result).toBe("player_win");
  });

  it("setInitialState overrides enemy starting position before tick 1", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.MERCHANT);
    engine.setInitialState({ enemyX: 300 });

    const combat = engine.getState().combat;
    expect(combat).not.toBeNull();
    expect(combat!.enemy.x).toBe(300);
  });

  it("setInitialState is a no-op after tick 1", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.MERCHANT);
    engine.tick();
    const xBefore = engine.getState().combat!.enemy.x;
    engine.setInitialState({ enemyX: 1 });
    expect(engine.getState().combat!.enemy.x).toBe(xBefore);
  });

  it("setInitialState playerDepth overrides depth and y consistently", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.DESTROYER);
    engine.setInitialState({ playerDepth: DepthBand.PERISCOPE });
    const combat = engine.getState().combat;
    expect(combat!.player.depth).toBe(DepthBand.PERISCOPE);
    expect(combat!.player.depthTarget).toBe(DepthBand.PERISCOPE);
    expect(combat!.player.y).toBe(150);
  });

  it("ScenarioInitial.enemyX affects combat via runScenario", async () => {
    const { runScenario } = await import("../../../tests/scenarios/runner.js");
    const { defineScenario: define } = await import("../../../tests/scenarios/types.js");
    const { VesselType: VT } = await import("../combat/enums.js");

    const result = runScenario(
      define({
        id: "test-initial-override",
        title: "test",
        seed: 42,
        scenario: VT.MERCHANT,
        initial: { enemyX: 300 },
        script: [],
        maxTicks: 1,
        expect: {
          atTick: [
            {
              tick: 1,
              label: "enemy starts at x=300 after override",
              predicate: (s: SimState): boolean => {
                const ex = s.combat?.enemy.x;
                // After 1 tick the merchant may have moved slightly; it started at 300
                return ex !== undefined && ex >= 280 && ex <= 320;
              },
            },
          ],
        },
      }),
    );

    expect(result.passed).toBe(true);
  });
});
