/**
 * Unit tests for crew / room assignment mechanics.
 *
 * Moved here from tests/scenarios/surface-battle.scenario.ts so scenario
 * files contain only defineScenario default exports (no vitest boilerplate).
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";
import type { SimState } from "../index.js";
import { DepthBand, RangeBand } from "../combat/types.js";

describe("crew assignment — in-process unit tests", () => {
  it("initial state has crew[0].roomId === 'bridge'", () => {
    const engine = new SimEngine(42);
    engine.startCombat("surface_battle");
    engine.tick();
    const combat = engine.getState().combat;
    expect(combat).not.toBeNull();
    expect(combat!.crew[0]!.roomId).toBe("bridge");
  });

  it("ASSIGN_CREW moves mate to deck_gun and updates both rooms", () => {
    const engine = new SimEngine(42);
    engine.startCombat("surface_battle");
    engine.tick();

    engine.queueCommand({ type: "ASSIGN_CREW", crewId: "mate", roomId: "deck_gun" });
    engine.tick();

    const combat = engine.getState().combat!;
    expect(combat.crew[0]!.roomId).toBe("deck_gun");
    const deckGunRoom = combat.rooms.find((r) => r.id === "deck_gun");
    expect(deckGunRoom?.crewIds).toContain("mate");
    const bridgeRoom = combat.rooms.find((r) => r.id === "bridge");
    expect(bridgeRoom?.crewIds).not.toContain("mate");
  });

  it("run 150 ticks with crew at deck_gun — combat ends with player_win", () => {
    const engine = new SimEngine(42);
    engine.startCombat("surface_battle");
    engine.queueCommand({ type: "ASSIGN_CREW", crewId: "mate", roomId: "deck_gun" });

    for (let i = 0; i < 150; i++) {
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
    const engine = new SimEngine(42);
    engine.startCombat("surface_battle");
    engine.setInitialState({ enemyX: 300 });

    const combat = engine.getState().combat;
    expect(combat).not.toBeNull();
    expect(combat!.enemy.x).toBe(300);
  });

  it("setInitialState is a no-op after tick 1", () => {
    const engine = new SimEngine(42);
    engine.startCombat("surface_battle");
    engine.tick();
    const xBefore = engine.getState().combat!.enemy.x;
    engine.setInitialState({ enemyX: 1 });
    expect(engine.getState().combat!.enemy.x).toBe(xBefore);
  });

  it("setInitialState playerDepth overrides depth and y consistently", () => {
    const engine = new SimEngine(42);
    engine.startCombat("destroyer_dive");
    engine.setInitialState({ playerDepth: DepthBand.PERISCOPE });
    const combat = engine.getState().combat;
    expect(combat!.player.depth).toBe(DepthBand.PERISCOPE);
    expect(combat!.player.depthTarget).toBe(DepthBand.PERISCOPE);
    expect(combat!.player.y).toBe(150);
  });

  it("ScenarioInitial.enemyX affects combat via runScenario", async () => {
    const { runScenario } = await import("../../../tests/scenarios/runner.js");
    const { defineScenario: define } = await import("../../../tests/scenarios/types.js");

    const result = runScenario(
      define({
        id: "test-initial-override",
        title: "test",
        seed: 42,
        scenario: "surface_battle",
        initial: { enemyX: 300 },
        script: [],
        maxTicks: 1,
        expect: {
          atTick: [
            {
              tick: 1,
              label: "enemy starts at x=300 after override; combat is at SHORT range after tick 1",
              predicate: (s: SimState): boolean => (s.combat?.range ?? 99) <= RangeBand.SHORT,
            },
          ],
        },
      }),
    );

    expect(result.passed).toBe(true);
  });
});
