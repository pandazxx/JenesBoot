// Scenario: destroyer-dive — player dives silent and torpedoes the destroyer within 200 ticks.
//
// Player dives to PERISCOPE at tick 1, then reduces to DEAD_SLOW at tick 2 to
// go silent. At DEAD_SLOW the destroyer's passive sonar cannot detect the sub
// (DEAD_SLOW submerged → NONE visibility). The sub fires four torpedoes at
// MEDIUM and SHORT range while undetected, winning without taking damage.
//
// Seed: 42. maxTicks: 200. Enemy: DESTROYER.

import type { SimState } from "../../src/sim/index.js";
import { VesselType, DepthBand, DiveSpeed, NauticalSpeed } from "../../src/sim/combat/enums.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "destroyer-dive",
  title: "Destroyer dive — player goes silent and torpedoes destroyer within 200 ticks",
  seed: 42,
  scenario: VesselType.DESTROYER,
  script: [
    {
      atTick: 1,
      cmd: { type: "SET_DEPTH", target: DepthBand.PERISCOPE, diveSpeed: DiveSpeed.STANDARD },
    },
    // Go DEAD_SLOW immediately — destroyer's passive sonar cannot detect DEAD_SLOW submerged
    { atTick: 2, cmd: { type: "SET_NAUTICAL_SPEED", speed: NauticalSpeed.DEAD_SLOW, intent: 0 } },
    // Fire torpedoes once in MEDIUM range, then every 20 ticks at SHORT
    { atTick: 40, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
    { atTick: 60, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
    { atTick: 80, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
    { atTick: 100, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
  ],
  maxTicks: 200,
  expect: {
    eventCounts: {
      combat_start: { exact: 1 },
      combat_end: { exact: 1 },
    },
    finalCombatResult: "player_win",
    finalState: (s: SimState): boolean => {
      const torpedoShots = s.log.filter(
        (e) =>
          e.type === "weapon_fired" &&
          (e.payload as Record<string, unknown>)["weaponId"] === "torpedo",
      );
      return torpedoShots.length > 0;
    },
  },
});
