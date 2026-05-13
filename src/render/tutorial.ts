/**
 * Tutorial step logic — pure TypeScript, no PixiJS, no DOM.
 *
 * Steps 0–4: surface_battle
 * Steps 5–9: destroyer_dive
 */

import type { CombatState } from "../sim/combat/types.js";
import { DepthBand, RangeBand, RoomType } from "../sim/combat/types.js";
import type { CombatScenario } from "../sim/index.js";

export type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function getTutorialStep(state: CombatState, scenario: CombatScenario): TutorialStep {
  if (scenario === "destroyer_dive") return getDestroyerDiveStep(state);
  return getSurfaceBattleStep(state);
}

function getSurfaceBattleStep(state: CombatState): TutorialStep {
  if (state.result === "player_lose") return 4;
  if (state.result === "player_win") return 3;
  if (state.range <= RangeBand.SHORT) return 2;
  if (state.crew.some((c) => c.roomId === "deck_gun")) return 1;
  return 0;
}

function getDestroyerDiveStep(state: CombatState): TutorialStep {
  if (state.result === "player_lose") return 9;
  if (state.result === "player_win") return 8;

  const torpedoCrewed = state.rooms.some(
    (r) => r.type === RoomType.TORPEDO && r.crewIds.length > 0,
  );
  const atDepth = state.player.depth >= DepthBand.PERISCOPE;
  if (torpedoCrewed && atDepth && state.range <= RangeBand.MEDIUM) return 7;

  const divingOrDived =
    state.player.depthTarget > DepthBand.SURFACE || state.player.depth > DepthBand.SURFACE;
  if (divingOrDived) return 6;

  return 5;
}

export const TUTORIAL_TEXT: Record<TutorialStep, string> = {
  // surface_battle
  0: "Enemy spotted at LONG range!  Click crew -> click Deck Gun to assign.",
  1: "Crew ready! Closing range...",
  2: "In range -- fire!",
  3: "Enemy defeated!",
  4: "Ship destroyed.  Press R to restart.",
  // destroyer_dive
  5: "A destroyer! Surface battle is suicide.  Click PERISCOPE in the depth bar to dive.",
  6: "Diving...  Move crew from Engine room to Torpedo room while you descend.",
  7: "At depth -- torpedo room ready!  Firing when in range...",
  8: "Destroyer sunk!  Horray!",
  9: "Ship destroyed.  Press R to restart.",
};
