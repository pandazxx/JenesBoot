// Scenario: gunboat-hunt — player closes on gunboat and wins within 400 ticks.
//
// Both ships close at FULL_AHEAD. Player fires deck gun at SURFACE at ticks 15-25
// (SHORT/CONTACT_RANGE), then dives to PERISCOPE and fires torpedoes.
// This verifies the full visual-detection, close-range, and weapon-fire pipeline.
//
// Seed: 42. maxTicks: 400. Enemy: GUNBOAT.

import type { SimState } from "../../src/sim/index.js";
import { VesselType, NauticalSpeed, DiveSpeed, DepthBand } from "../../src/sim/combat/enums.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "gunboat-hunt",
  title: "Gunboat hunt — player closes and wins within 400 ticks",
  seed: 42,
  scenario: VesselType.GUNBOAT,
  initial: {
    playerNauticalSpeed: NauticalSpeed.FULL_AHEAD,
    playerHorizontalIntent: 1,
  },
  script: [
    // Tick 10: fire deck gun while at SURFACE/SHORT range
    { atTick: 10, cmd: { type: "FIRE_WEAPON", weaponId: "deck_gun" } },
    { atTick: 20, cmd: { type: "FIRE_WEAPON", weaponId: "deck_gun" } },
    {
      atTick: 25,
      cmd: { type: "SET_DEPTH", target: DepthBand.PERISCOPE, diveSpeed: DiveSpeed.STANDARD },
    },
    // After diving, fire torpedoes
    { atTick: 30, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
    { atTick: 50, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
    { atTick: 70, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
    { atTick: 90, cmd: { type: "FIRE_WEAPON", weaponId: "torpedo" } },
  ],
  maxTicks: 400,
  expect: {
    eventCounts: {
      combat_start: { exact: 1 },
      combat_end: { exact: 1 },
      weapon_fired: { min: 1 },
    },
    finalCombatResult: "player_win",
    finalState: (s: SimState): boolean => {
      const weaponShots = s.log.filter(
        (e) =>
          e.type === "weapon_fired" &&
          (e.payload as Record<string, unknown>)["firedBy"] === "player",
      );
      return weaponShots.length > 0;
    },
  },
});
