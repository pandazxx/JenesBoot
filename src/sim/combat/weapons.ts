/**
 * Weapon resolution — hit/miss calculation for deck gun and torpedoes.
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import { DepthBand, RangeBand } from "./types.js";
import type { Mulberry32 } from "../prng.js";

/**
 * Deck gun base accuracy by range band.
 * LONG is out of range — callers must not invoke fire at LONG range.
 */
export const DECK_GUN_ACCURACY: Record<RangeBand, number> = {
  [RangeBand.LONG]: 0,
  [RangeBand.MEDIUM]: 15,
  [RangeBand.SHORT]: 60,
  [RangeBand.POINT_BLANK]: 85,
  [RangeBand.RAMMING]: 85,
};

export const DECK_GUN_DAMAGE = 3;
export const DECK_GUN_COOLDOWN_TICKS = 10;

/**
 * Torpedo base accuracy by range band.
 * LONG is out of range. Torpedoes require depth ≤ PERISCOPE to fire.
 */
export const TORPEDO_ACCURACY: Record<RangeBand, number> = {
  [RangeBand.LONG]: 0,
  [RangeBand.MEDIUM]: 55,
  [RangeBand.SHORT]: 75,
  [RangeBand.POINT_BLANK]: 85,
  [RangeBand.RAMMING]: 85,
};

export const TORPEDO_DAMAGE = 5;
export const TORPEDO_COOLDOWN_TICKS = 20;
export const TORPEDO_FLIGHT_TICKS = 3;

/**
 * Returns true if the shot hits.
 * hit_chance = clamp(5, 95, accuracy - evasion)
 */
export function resolveDeckGun(accuracy: number, evasion: number, rng: Mulberry32): boolean {
  const hitChance = Math.max(5, Math.min(95, accuracy - evasion));
  return rng.next() * 100 < hitChance;
}

export function resolveTorpedo(accuracy: number, evasion: number, rng: Mulberry32): boolean {
  const hitChance = Math.max(5, Math.min(95, accuracy - evasion));
  return rng.next() * 100 < hitChance;
}

export function deckGunDepthDamageMultiplier(targetDepth: DepthBand): number {
  if (targetDepth === DepthBand.SURFACE) return 1.0;
  if (targetDepth === DepthBand.PERISCOPE) return 0.6;
  return 0;
}
