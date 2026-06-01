// Scenario: merchant-hunt — sub closes on merchant from LONG range at FULL_AHEAD,
// fires deck gun repeatedly, and destroys the merchant before tick 200.
//
// Story assertions:
//   1. Player wins (finalCombatResult: "player_win").
//   2. Merchant never fires — no weapon_fired event with firedBy==="enemy".
//   3. Merchant flees (merchant_fled event emitted at least once).
//   4. Combat resolves before tick 200 (maxTicks bound).
//   5. At least 3 weapon_fired events.
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
  id: "merchant-hunt",
  title: "Merchant hunt — approach at FULL_AHEAD and destroy",
  seed: 42,
  scenario: VesselType.MERCHANT,
  initial: {
    playerNauticalSpeed: NauticalSpeed.FULL_AHEAD,
    playerHorizontalIntent: 1,
    playerDiveSpeed: DiveSpeed.TRIM,
    enemyHorizontalIntent: 0,
    enemyNauticalSpeed: NauticalSpeed.DEAD_SLOW,
  },
  script: fireScript,
  maxTicks: 200,
  expect: {
    finalCombatResult: "player_win",

    eventCounts: {
      // Merchant panics and flees (committed-flight flag set).
      merchant_fled: { min: 1 },
      // Exactly one combat_end event.
      combat_end: { exact: 1 },
      // At least one range_change as sub closes from LONG to SHORT.
      range_change: { min: 1 },
      // At least 3 weapon_fired events.
      weapon_fired: { min: 3 },
    },

    finalState: (s: SimState): boolean => {
      // Merchant never fires.
      const enemyFired = s.log.some(
        (e) =>
          e.type === "weapon_fired" &&
          (e.payload as Record<string, unknown>)["firedBy"] === "enemy",
      );
      if (enemyFired) return false;

      // Enemy HP is 0 at combat end.
      const enemyHP = s.combat?.enemy.hullHP ?? 1;
      return enemyHP === 0;
    },
  },
});
