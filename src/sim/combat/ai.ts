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
  | { type: "FIRE_DEPTH_CHARGE" }
  | { type: "FIRE_TORPEDO" }
  | { type: "MATCH_AND_CLOSE"; depthTarget: DepthBand }
  | { type: "EVADE_SILENT"; depthTarget: DepthBand }
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
 * Destroyer Battle AI — closes with sonar tracking, fires depth charges on submerged sub,
 * deck gun on surface sub, continues searching when contact lost.
 *
 * Priority order (highest first):
 *   1. CQ≥4, sub submerged, SHORT → FIRE_DEPTH_CHARGE
 *   2. CQ≥4, sub surface, range≤MEDIUM → FIRE_DECK_GUN
 *   3. CQ≥4, range>SHORT → close at AHEAD_FULL
 *   4. CQ<4 → continue closing at STANDARD (search toward last known position)
 */
export function destroyerBattleAi(
  enemy: ShipState,
  range: RangeBand,
  playerDepth: DepthBand,
  contactQualityValue: number,
): AiCommand {
  const playerSubmerged = playerDepth >= DepthBand.PERISCOPE;

  if (contactQualityValue >= 4) {
    if (playerSubmerged && range === RangeBand.SHORT && enemy.torpedoCooldown === 0) {
      return { type: "FIRE_DEPTH_CHARGE" };
    }
    if (!playerSubmerged && range <= RangeBand.MEDIUM && enemy.deckGunCooldown === 0) {
      return { type: "FIRE_DECK_GUN" };
    }
    return {
      type: "SET_SPEED",
      speed: SpeedSetting.AHEAD_FULL,
      direction: SpeedDirection.CLOSE,
    };
  }

  // Contact lost — keep closing at STANDARD to search the last known position.
  // In the continuous axis model, HOLD means the destroyer freezes completely,
  // which breaks the intended "searching" behavior.
  return {
    type: "SET_SPEED",
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.CLOSE,
  };
}

/**
 * Submarine AI — implements §5.3 Submerged Hostile rules.
 *
 * Priority order (highest first):
 *   1. CQ≥4, range≤MEDIUM, depth diff≤1, torpedo ready → FIRE_TORPEDO
 *   2. Hit within last 20 ticks + contact lost → EVADE_SILENT (change depth 1 band)
 *   3. Otherwise → MATCH_AND_CLOSE (match player depth, close at STANDARD)
 */
export function submarineAi(
  enemy: ShipState,
  range: RangeBand,
  playerDepth: DepthBand,
  contactQualityValue: number,
  enemyRecentlyHitTicks: number,
): AiCommand {
  const depthDiff = Math.abs(enemy.depth - playerDepth);

  if (
    contactQualityValue >= 4 &&
    range <= RangeBand.MEDIUM &&
    depthDiff <= 1 &&
    enemy.torpedoCooldown === 0 &&
    enemy.torpedoCount > 0
  ) {
    return { type: "FIRE_TORPEDO" };
  }

  if (enemyRecentlyHitTicks > 0 && contactQualityValue < 4) {
    // Change depth by 1 band only if not already transitioning.
    if (enemy.depth === enemy.depthTarget) {
      const newTarget =
        enemy.depth < DepthBand.ABYSSAL
          ? ((enemy.depth + 1) as DepthBand)
          : ((enemy.depth - 1) as DepthBand);
      return { type: "EVADE_SILENT", depthTarget: newTarget };
    }
    return { type: "SET_SPEED", speed: SpeedSetting.SILENT, direction: SpeedDirection.HOLD };
  }

  return { type: "MATCH_AND_CLOSE", depthTarget: playerDepth };
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
