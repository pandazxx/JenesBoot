// Scenario: destroyer-battle — verify the destroyer closes from LONG to SHORT
// within 60 ticks when the player stays at surface.
//
// Seed: 0. maxTicks: 60. Enemy: DESTROYER.
// The destroyer starts at x=700 (LONG range from player at x=0) and closes
// at FULL_AHEAD (15 units/tick), reaching SHORT (gap < 300) in ~30 ticks.

import type { SimState } from "../../src/sim/index.js";
import { VesselType, RangeBand } from "../../src/sim/combat/enums.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "destroyer-battle",
  title: "Destroyer closes from LONG to SHORT within 60 ticks (player holds surface)",
  seed: 0,
  scenario: VesselType.DESTROYER,
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
