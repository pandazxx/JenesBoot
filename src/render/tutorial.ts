/**
 * Tutorial step logic — pure TypeScript, no PixiJS, no DOM.
 */

import type { CombatState } from "../sim/combat/types.js";
import { RangeBand } from "../sim/combat/types.js";

export type TutorialStep = 0 | 1 | 2 | 3 | 4;

export function getTutorialStep(state: CombatState): TutorialStep {
  if (state.result === "player_lose") return 4;
  if (state.result === "player_win") return 3;
  if (state.range <= RangeBand.SHORT) return 2;
  if (state.crew.some((c) => c.roomId === "deck_gun")) return 1;
  return 0;
}

export const TUTORIAL_TEXT: Record<TutorialStep, string> = {
  0: "Enemy spotted at LONG range!  Click crew -> click Deck Gun to assign.",
  1: "Crew ready! Closing range...",
  2: "In range -- fire!",
  3: "Enemy defeated!",
  4: "Ship destroyed.  Press R to restart.",
};
