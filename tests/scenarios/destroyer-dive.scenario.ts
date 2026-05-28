// Scenario: destroyer-dive — player dives and torpedoes the destroyer within 300 ticks.
//
// Player dives to PERISCOPE, assigns engineer to torpedo room, then fires
// torpedoes to win. This verifies dive mechanics and crew assignment interact
// correctly with combat resolution.
//
// Seed: 42. maxTicks: 300. Scenario: destroyer_dive.

import type { SimState } from "../../src/sim/index.js";
import { DepthBand } from "../../src/sim/combat/types.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "destroyer-dive",
  title: "Destroyer dive — player dives and torpedoes destroyer within 300 ticks",
  seed: 42,
  scenario: "destroyer_dive",
  script: [
    { atTick: 1, cmd: { type: "SET_DEPTH", target: DepthBand.PERISCOPE } },
    { atTick: 1, cmd: { type: "ASSIGN_CREW", crewId: "engineer", roomId: "torpedo" } },
  ],
  maxTicks: 300,
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
