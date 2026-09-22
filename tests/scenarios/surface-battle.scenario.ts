// Scenario: surface-battle — player closes on merchant at FULL_AHEAD and destroys it
// by repeatedly firing the deck gun once in range.
//
// Player (SURFACE, FULL_AHEAD, closing) engages a merchant starting at LONG range.
// Player fires deck gun every 10 ticks from tick 20 onward.
// Player should close, enter deck-gun range, and destroy the merchant before tick 200.
//
// Seed: 42. maxTicks: 200. Enemy: MERCHANT.

import type { SimState } from "../../src/sim/index.js";
import { VesselType, NauticalSpeed, DiveSpeed } from "../../src/sim/combat/enums.js";
import { defineScenario } from "./types.js";

const fireScript = Array.from({ length: 18 }, (_, i) => ({
  atTick: 20 + i * 10,
  cmd: { type: "FIRE_WEAPON" as const, weaponId: "deck_gun" },
}));

export default defineScenario({
  id: "surface-battle",
  title: "Surface battle — merchant destroyed before tick 200",
  seed: 42,
  scenario: VesselType.MERCHANT,
  initial: {
    playerNauticalSpeed: NauticalSpeed.FULL_AHEAD,
    playerHorizontalIntent: 1,
    playerDiveSpeed: DiveSpeed.TRIM,
  },
  script: fireScript,
  maxTicks: 200,
  expect: {
    eventCounts: {
      combat_start: { min: 1 },
      range_change: { min: 1 },
      weapon_fired: { min: 1 },
      combat_end: { exact: 1 },
    },
    finalState: (s: SimState): boolean => {
      const log = s.log;
      const endEvent = log.find((e) => e.type === "combat_end");
      if (endEvent === undefined) return false;
      const p = endEvent.payload as Record<string, unknown>;
      const result = p["result"] as string;
      return result === "player_win";
    },
    finalCombatResult: "player_win",
  },
});
