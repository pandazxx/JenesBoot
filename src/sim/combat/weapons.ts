/**
 * Weapon resolution — deck gun hit/miss calculation.
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import { RangeBand } from "./types.js";
import type { Mulberry32 } from "../prng.js";

/**
 * Deck gun base accuracy by range band.
 * LONG is out of range — callers must not invoke fire at LONG range.
 * RAMMING is treated as POINT_BLANK for accuracy purposes.
 */
export const DECK_GUN_ACCURACY: Record<RangeBand, number> = {
  [RangeBand.LONG]: 0,
  [RangeBand.MEDIUM]: 15,
  [RangeBand.SHORT]: 60,
  [RangeBand.POINT_BLANK]: 85,
  [RangeBand.RAMMING]: 85,
};

/**
 * Deck gun base damage per hit.
 */
export const DECK_GUN_DAMAGE = 3;

/**
 * Ticks between deck gun shots.
 */
export const DECK_GUN_COOLDOWN_TICKS = 10;

/**
 * Returns true if the shot hits.
 * hit_chance = clamp(5, 95, accuracy - evasion)
 */
export function resolveDeckGun(accuracy: number, evasion: number, rng: Mulberry32): boolean {
  const hitChance = Math.max(5, Math.min(95, accuracy - evasion));
  return rng.next() * 100 < hitChance;
}
