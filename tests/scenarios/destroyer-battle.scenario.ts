// Scenario: destroyer-battle — verify the destroyer closes from LONG to SHORT
// within 60 ticks when the player stays at surface.
//
// Seed: 0. maxTicks: 60. Scenario: destroyer_battle.
// The destroyer starts at LONG range (gap ~750 units) and closes at AHEAD_FULL
// (15 units/tick), reaching SHORT (< 300 units) in ~30 ticks.

import type { SimState } from "../../src/sim/index.js";
import { RangeBand } from "../../src/sim/combat/types.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "destroyer-battle",
  title: "Destroyer closes from LONG to SHORT within 60 ticks (player holds surface)",
  seed: 0,
  scenario: "destroyer_battle",
  script: [],
  maxTicks: 60,
  expect: {
    finalState: (s: SimState): boolean => {
      const shortReached = s.log.some(
        (e) =>
          e.type === "range_change" &&
          ((e.payload as Record<string, unknown>)["to"] as number) <= RangeBand.SHORT,
      );
      return shortReached;
    },
    eventCounts: {
      combat_start: { exact: 1 },
      range_change: { min: 1 },
    },
  },
});
