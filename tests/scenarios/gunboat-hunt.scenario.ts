// Scenario: gunboat-hunt — player closes on gunboat and wins with torpedoes within 400 ticks.
//
// Player closes aggressively at AHEAD_FULL, then dives to PERISCOPE when SHORT
// range is reached to fire torpedoes at the gunboat. This verifies the full
// visual-detection, close-range, and torpedo-fire pipeline.
//
// Seed: 42. maxTicks: 400. Scenario: gunboat_hunt.

import type { SimState } from "../../src/sim/index.js";
import { DepthBand, SpeedDirection, SpeedSetting } from "../../src/sim/combat/types.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "gunboat-hunt",
  title: "Gunboat hunt — player closes and wins with torpedoes within 400 ticks",
  seed: 42,
  scenario: "gunboat_hunt",
  script: [
    {
      atTick: 1,
      cmd: { type: "SET_SPEED", speed: SpeedSetting.AHEAD_FULL, direction: SpeedDirection.CLOSE },
    },
    { atTick: 25, cmd: { type: "SET_DEPTH", target: DepthBand.PERISCOPE } },
  ],
  maxTicks: 400,
  expect: {
    eventCounts: {
      combat_start: { exact: 1 },
      combat_end: { exact: 1 },
      shot_fired: { min: 1 },
    },
    finalCombatResult: "player_win",
    finalState: (s: SimState): boolean => {
      const torpedoShots = s.log.filter(
        (e) =>
          e.type === "shot_fired" && (e.payload as Record<string, unknown>)["weapon"] === "torpedo",
      );
      return torpedoShots.length > 0;
    },
  },
});
