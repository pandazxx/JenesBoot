// Scenario: merchant-hunt — sub stalks a stationary merchant from PERISCOPE depth,
// closes from LONG range at AHEAD_FULL, surfaces when the merchant enters SHORT range,
// opens fire with the deck gun while the merchant panics and flees.
//
// Story assertions (tight by design — convergence in 1 iteration is a red flag):
//   1. Player wins (finalCombatResult: "player_win").
//   2. Merchant never fires — no shot_fired event with by==="enemy".
//   3. Player is at PERISCOPE during the approach phase (tick 15).
//   4. Player is at SURFACE when entering SHORT range (tick 21).
//   5. Merchant flees (merchant_fled event emitted at least once).
//   6. Combat takes meaningful time — ongoing at tick 40.
//   7. Combat resolves before tick 200 (maxTicks bound).
//
// Timing (xSpeedAheadFull=15, BAND_SIZE=150, player at x=0, enemy at x=750):
//   Gap closes at 15 units/tick. SHORT starts when gap < 450.
//   750 - 15t < 450 → t > 20. SHORT reached at tick 21 (after movement).
//   SET_DEPTH SURFACE at tick 21 transitions player from y=150 to y=125 (1 tick = SURFACE band).
//   First deck gun shot fires tick 21 (player surfaced + SHORT + deck_gun crewed).
//   enemy_spotted fires tick 22 (enemy CQ on SURFACE player at SHORT = 10 ≥ 4).
//   merchant_fled fires at same tick as enemy_spotted.
//   Both ships at AHEAD_FULL: gap stays 435 (SHORT). Player fires every 10 ticks.
//
// Seed: 42. maxTicks: 200. Scenario: surface_battle (merchant enemy).

import type { SimState } from "../../src/sim/index.js";
import { DepthBand, SpeedSetting, SpeedDirection } from "../../src/sim/combat/types.js";
import { defineScenario } from "./types.js";

export default defineScenario({
  id: "merchant-hunt",
  title: "Merchant hunt — approach from PERISCOPE, surface, and destroy",
  seed: 42,
  scenario: "surface_battle",
  initial: {
    // Sub starts at PERISCOPE, stationary. Enemy starts at default x=750 (LONG range), stationary.
    playerDepth: DepthBand.PERISCOPE,
    playerSpeed: SpeedSetting.STANDARD,
    playerDirection: SpeedDirection.HOLD,
    enemySpeed: SpeedSetting.STANDARD,
    enemyDirection: SpeedDirection.HOLD,
  },
  script: [
    // Tick 1: begin the approach at AHEAD_FULL CLOSE from PERISCOPE.
    {
      atTick: 1,
      cmd: { type: "SET_SPEED", speed: SpeedSetting.AHEAD_FULL, direction: SpeedDirection.CLOSE },
    },

    // Tick 21: gap enters SHORT range after movement. Issue SET_DEPTH before ASSIGN_CREW
    // so the bridge is still crewed when SET_DEPTH is evaluated (bridge gate check).
    // Both commands applied before tick 21 runs, in script-array order.
    { atTick: 21, cmd: { type: "SET_DEPTH", target: DepthBand.SURFACE } },
    { atTick: 21, cmd: { type: "ASSIGN_CREW", crewId: "mate", roomId: "deck_gun" } },
  ],
  maxTicks: 200,
  expect: {
    // Assertion 1: player wins.
    finalCombatResult: "player_win",

    atTick: [
      {
        // Assertion 3: player at PERISCOPE during the approach phase.
        tick: 15,
        label: "player at PERISCOPE during approach (tick 15)",
        predicate: (s: SimState): boolean => s.combat?.player.depth === DepthBand.PERISCOPE,
      },
      {
        // Assertion 4: player has surfaced by tick 21 (when first shot fires).
        tick: 21,
        label: "player at SURFACE when entering SHORT range (tick 21)",
        predicate: (s: SimState): boolean => s.combat?.player.depth === DepthBand.SURFACE,
      },
      {
        // Assertion 6: combat still ongoing at tick 40 — a real hunt doesn't end in 28 ticks.
        tick: 40,
        label: "combat ongoing at tick 40 (meaningful duration)",
        predicate: (s: SimState): boolean => s.combat?.result === "ongoing",
      },
    ],

    eventCounts: {
      // Assertion 5: merchant panics and flees (committed-flight flag set).
      merchant_fled: { min: 1 },
      // Exactly one combat_end event.
      combat_end: { exact: 1 },
      // At least one range_change as sub closes from LONG to SHORT.
      range_change: { min: 1 },
      // At least 3 deck gun shots for a believable hunt.
      shot_fired: { min: 3 },
    },

    finalState: (s: SimState): boolean => {
      // Assertion 2: merchant never fires — no shot_fired event with by==="enemy".
      const enemyFired = s.log.some(
        (e) => e.type === "shot_fired" && (e.payload as Record<string, unknown>)["by"] === "enemy",
      );
      if (enemyFired) return false;

      // Enemy HP is 0 at combat end.
      const enemyHP = s.combat?.enemy.hullHP ?? 1;
      return enemyHP === 0;
    },
  },
});
