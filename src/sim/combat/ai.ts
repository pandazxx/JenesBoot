/**
 * Enemy AI — merchant, destroyer, and gunboat behaviours.
 *
 * Returns a command object; never mutates state.
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import { DepthBand, RangeBand, SpeedSetting, SpeedDirection } from "./types.js";
import type { ShipState } from "./types.js";

export type AiCommand =
  | { type: "FIRE_DECK_GUN" }
  | { type: "FIRE_BLIND_SHOT" }
  | { type: "SET_SPEED"; speed: SpeedSetting; direction: SpeedDirection }
  | { type: "NONE" };

/** Ticks per range band for the merchant (slower than player standard). */
export const MERCHANT_RANGE_TICKS_PER_BAND = 20;

/** Ticks per range band for the destroyer (faster than player standard). */
export const DESTROYER_RANGE_TICKS_PER_BAND = 10;

/**
 * Merchant AI — 3 rules evaluated in priority order.
 * Flees when hull is below half.
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

/**
 * Destroyer AI — closes aggressively at all times, fires deck gun on surface targets.
 * Never holds back. playerDepth is used to decide whether the deck gun can acquire.
 */
export function destroyerAi(enemy: ShipState, range: RangeBand, playerDepth: DepthBand): AiCommand {
  const canFire =
    playerDepth === DepthBand.SURFACE && range <= RangeBand.SHORT && enemy.deckGunCooldown === 0;
  if (canFire) {
    return { type: "FIRE_DECK_GUN" };
  }

  return {
    type: "SET_SPEED",
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
  };
}

/**
 * Gunboat AI — always closes, fires when tracking, fires blind shots when contact is lost.
 * Never retreats.
 */
export function gunboatAi(
  enemy: ShipState,
  range: RangeBand,
  playerDepth: DepthBand,
  contactQualityValue: number,
  lastKnownRange: RangeBand,
  blindShotsFired: number,
): AiCommand {
  void playerDepth;

  if (contactQualityValue >= 4) {
    if (range <= RangeBand.SHORT && enemy.deckGunCooldown === 0) {
      return { type: "FIRE_DECK_GUN" };
    }
    return {
      type: "SET_SPEED",
      speed: SpeedSetting.AHEAD_FULL,
      direction: SpeedDirection.CLOSE,
    };
  }

  // Searching: lost contact — always close in to regain visual.
  // Fire blind shots when passing through lastKnownRange (periscope tip may still be there).
  if (range === lastKnownRange && blindShotsFired < 3 && enemy.deckGunCooldown === 0) {
    return { type: "FIRE_BLIND_SHOT" };
  }

  // Never back off — keep pressing in regardless of lastKnownRange.
  // At SHORT the periscope becomes visible again (CQ=4) and TRACKING resumes.
  return {
    type: "SET_SPEED",
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
  };
}
