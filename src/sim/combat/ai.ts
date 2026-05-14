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
 * Gunboat AI — closes aggressively when tracking, holds position when searching.
 *
 * TRACKING (CQ ≥ 4): close and fire.
 * SEARCHING (CQ < 4): hold at last known position and fire blind shots.
 *   Holding lets a diving sub open distance and accumulate the escape counter.
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

  // Searching: hold at last known position and fire blind shots there.
  // The sub can outrun the gunboat while it circles the last known location.
  if (range === lastKnownRange && blindShotsFired < 3 && enemy.deckGunCooldown === 0) {
    return { type: "FIRE_BLIND_SHOT" };
  }

  return {
    type: "SET_SPEED",
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
  };
}
