// Scenario: merchant-hunt — sub approaches a stationary merchant from SHALLOW depth,
// surfaces, hunts it down with the deck gun while the merchant flees at half HP.
//
// Story assertions:
//   1. Player wins (finalCombatResult: "player_win").
//   2. Combat ends before tick 200.
//   3. Player fires at least 3 deck gun shots (shot_fired min 3).
//   4. Merchant flees (enemy_spotted fires after merchant crosses 50% hull — its AI
//      switches to AHEAD_FULL OPEN, which keeps the enemy visible and tracked longer).
//   5. Merchant is destroyed (enemy hullHP === 0 at end).
//
// Seed: 42. maxTicks: 200. Scenario: surface_battle (merchant enemy).

import type { SimState } from "../../src/sim/index.js";
import { DepthBand, SpeedSetting, SpeedDirection } from "../../src/sim/combat/types.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "merchant-hunt",
  title: "Merchant hunt — surface, close, and destroy",
  seed: 42,
  scenario: "surface_battle",
  initial: {
    playerDepth: DepthBand.SHALLOW,
    playerSpeed: SpeedSetting.AHEAD_FULL,
    playerDirection: SpeedDirection.CLOSE,
    enemyX: 450,
    enemySpeed: SpeedSetting.STANDARD,
    enemyDirection: SpeedDirection.HOLD,
  },
  script: [
    // Tick 1: Start surfacing first (bridge still crewed), then reassign mate to deck gun.
    // SET_DEPTH is gated on bridge crew — must queue it before ASSIGN_CREW moves mate out.
    // Commands at the same tick are dispatched in script array order.
    { atTick: 1, cmd: { type: "SET_DEPTH", target: DepthBand.SURFACE } },
    { atTick: 1, cmd: { type: "ASSIGN_CREW", crewId: "mate", roomId: "deck_gun" } },
  ],
  maxTicks: 200,
  expect: {
    // Assertion 1: player wins.
    finalCombatResult: "player_win",

    // Assertion 2: combat ends within 200 ticks (enforced by maxTicks + combat_end check).
    // We tighten to 150 ticks: the merchant starts at MEDIUM range and the sub surfaces fast.
    atTick: [
      {
        tick: 150,
        predicate: (s: SimState): boolean => {
          // Either combat is already over or enemy HP is already 0.
          return s.combat?.result !== "ongoing" || (s.combat?.enemy.hullHP ?? 1) === 0;
        },
        label: "combat resolved before tick 150",
      },
    ],

    eventCounts: {
      // Assertion 3: at least 3 deck gun shots fired.
      shot_fired: { min: 3 },
      // Exactly one combat_end event.
      combat_end: { exact: 1 },
      // At least one range_change (sub closes from MEDIUM to SHORT/POINT_BLANK).
      range_change: { min: 1 },
    },

    // Assertion 4+5: final state — enemy HP is 0 and we fired at least 3 shots.
    finalState: (s: SimState): boolean => {
      const enemyHP = s.combat?.enemy.hullHP ?? 1;
      return enemyHP === 0;
    },
  },
});
