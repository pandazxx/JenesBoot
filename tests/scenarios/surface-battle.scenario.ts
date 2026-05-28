// Scenario: surface-battle — verify the surface engagement plays out correctly.
//
// Player (20 HP, AHEAD_FULL CLOSE) engages a merchant (8 HP, STANDARD HOLD)
// starting at LONG range. Player should close range, enter deck-gun range,
// and destroy the merchant before tick 150.
//
// Seed: 42. maxTicks: 150. Scenario: surface_battle.

import type { SimState } from "../../src/sim/index.js";
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
