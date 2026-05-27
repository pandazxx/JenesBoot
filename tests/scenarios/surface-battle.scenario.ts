// Scenario: surface-battle — verify the surface engagement plays out correctly.
//
// Player (20 HP, AHEAD_FULL CLOSE) engages a merchant (8 HP, STANDARD HOLD)
// starting at LONG range. Player should close range, enter deck-gun range,
// and destroy the merchant before tick 150.
//
// Seed: 42. maxTicks: 150. Scenario: surface_battle.
//
// This file also contains in-process unit tests for crew assignment mechanics.
// Those run as plain vitest describe blocks (no Scenario wrapper needed).

import { describe, it, expect } from "vitest";
import { SimEngine } from "../../src/sim/index.js";
import type { SimState } from "../../src/sim/index.js";
import { DepthBand, RangeBand } from "../../src/sim/combat/types.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "surface-battle",
  title: "Surface battle — merchant destroyed before tick 150",
  seed: 42,
  scenario: "surface_battle",
  script: [{ atTick: 1, cmd: { type: "ASSIGN_CREW", crewId: "mate", roomId: "deck_gun" } }],
  maxTicks: 150,
  expect: {
    eventCounts: {
      combat_start: { min: 1 },
      range_change: { min: 1 },
      shot_fired: { min: 1 },
      combat_end: { exact: 1 },
    },
    finalState: (s: SimState): boolean => {
      const log = s.log;
      const endEvent = log.find((e) => e.type === "combat_end");
      if (endEvent === undefined) return false;
      const p = endEvent.payload as Record<string, unknown>;
      const atTick = p["atTick"] as number;
      const result = p["result"] as string;
      return result === "player_win" && atTick <= 150;
    },
    finalCombatResult: "player_win",
  },
});

// ---------------------------------------------------------------------------
// In-process unit tests for crew / room assignment mechanics.
// These are orthogonal to the playthrough scenario above.
// ---------------------------------------------------------------------------

describe("crew assignment — in-process unit tests", () => {
  it("initial state has crew[0].roomId === 'bridge'", () => {
    const engine = SimEngine(42);
    engine.startCombat("surface_battle");
    engine.tick();
    const combat = engine.getState().combat;
    expect(combat).not.toBeNull();
    expect(combat!.crew[0]!.roomId).toBe("bridge");
  });

  it("ASSIGN_CREW moves mate to deck_gun and updates both rooms", () => {
    const engine = SimEngine(42);
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
    const engine = SimEngine(42);
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
    const engine = SimEngine(42);
    engine.startCombat("surface_battle");
    engine.setInitialState({ enemyX: 300 });

    const combat = engine.getState().combat;
    expect(combat).not.toBeNull();
    expect(combat!.enemy.x).toBe(300);
  });

  it("setInitialState is a no-op after tick 1", () => {
    const engine = SimEngine(42);
    engine.startCombat("surface_battle");
    engine.tick();
    const xBefore = engine.getState().combat!.enemy.x;
    engine.setInitialState({ enemyX: 1 });
    expect(engine.getState().combat!.enemy.x).toBe(xBefore);
  });

  it("setInitialState playerDepth overrides depth and y consistently", () => {
    const engine = SimEngine(42);
    engine.startCombat("destroyer_dive");
    engine.setInitialState({ playerDepth: DepthBand.PERISCOPE });
    const combat = engine.getState().combat;
    expect(combat!.player.depth).toBe(DepthBand.PERISCOPE);
    expect(combat!.player.depthTarget).toBe(DepthBand.PERISCOPE);
    expect(combat!.player.y).toBe(150);
  });

  it("ScenarioInitial.enemyX affects combat via runScenario", async () => {
    const { runScenario } = await import("./runner.js");
    const { defineScenario: define } = await import("./types.js");

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
