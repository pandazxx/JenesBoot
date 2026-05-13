/**
 * Enemy AI — merchant vessel behaviour.
 *
 * Returns a command object; never mutates state.
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import { RangeBand, SpeedSetting, SpeedDirection } from "./types.js";
import type { ShipState } from "./types.js";

export type AiCommand =
  | { type: "FIRE_DECK_GUN" }
  | { type: "SET_SPEED"; speed: SpeedSetting; direction: SpeedDirection }
  | { type: "NONE" };

/**
 * Ticks per range band for the merchant (slower than standard 15).
 */
export const MERCHANT_RANGE_TICKS_PER_BAND = 20;

/**
 * Merchant AI — 3 rules evaluated in priority order.
 */
export function merchantAi(
  enemy: ShipState,
  range: RangeBand,
  initialMaxHullHP: number,
): AiCommand {
  if (range <= RangeBand.SHORT && enemy.deckGunCooldown === 0) {
    return { type: "FIRE_DECK_GUN" };
  }

  if (enemy.hullHP < initialMaxHullHP * 0.5) {
    return {
      type: "SET_SPEED",
      speed: SpeedSetting.AHEAD_FULL,
      direction: SpeedDirection.OPEN,
    };
  }

  return {
    type: "SET_SPEED",
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
  };
}
