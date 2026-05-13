/**
 * Detection / contact-quality calculations.
 *
 * Returns a value 0–10 representing how well an observer can track a target.
 * A value >= 4 is "TRACKING" — sufficient to fire weapons.
 */

import { DepthBand, RangeBand, SpeedSetting } from "./types.js";
import type { ShipState } from "./types.js";

// Surface vessel detecting submarine (or surface-vs-surface visual detection).
// Rows = target depth, cols = range.
const TABLE_A: Record<DepthBand, Record<RangeBand, number>> = {
  [DepthBand.SURFACE]: {
    [RangeBand.LONG]: 8,
    [RangeBand.MEDIUM]: 9,
    [RangeBand.SHORT]: 10,
    [RangeBand.POINT_BLANK]: 10,
    [RangeBand.RAMMING]: 10,
  },
  [DepthBand.PERISCOPE]: {
    [RangeBand.LONG]: 3,
    [RangeBand.MEDIUM]: 5,
    [RangeBand.SHORT]: 7,
    [RangeBand.POINT_BLANK]: 3,
    [RangeBand.RAMMING]: 5,
  },
  [DepthBand.SHALLOW]: {
    [RangeBand.LONG]: 2,
    [RangeBand.MEDIUM]: 4,
    [RangeBand.SHORT]: 6,
    [RangeBand.POINT_BLANK]: 2,
    [RangeBand.RAMMING]: 4,
  },
  [DepthBand.DEEP]: {
    [RangeBand.LONG]: 1,
    [RangeBand.MEDIUM]: 2,
    [RangeBand.SHORT]: 4,
    [RangeBand.POINT_BLANK]: 1,
    [RangeBand.RAMMING]: 3,
  },
  [DepthBand.ABYSSAL]: {
    [RangeBand.LONG]: 0,
    [RangeBand.MEDIUM]: 1,
    [RangeBand.SHORT]: 2,
    [RangeBand.POINT_BLANK]: 0,
    [RangeBand.RAMMING]: 2,
  },
};

// Submarine detecting surface vessel.
// Rows = observer depth, cols = range.
const TABLE_B: Record<DepthBand, Record<RangeBand, number>> = {
  [DepthBand.SURFACE]: {
    [RangeBand.LONG]: 5,
    [RangeBand.MEDIUM]: 7,
    [RangeBand.SHORT]: 9,
    [RangeBand.POINT_BLANK]: 10,
    [RangeBand.RAMMING]: 10,
  },
  [DepthBand.PERISCOPE]: {
    [RangeBand.LONG]: 5,
    [RangeBand.MEDIUM]: 7,
    [RangeBand.SHORT]: 9,
    [RangeBand.POINT_BLANK]: 10,
    [RangeBand.RAMMING]: 10,
  },
  [DepthBand.SHALLOW]: {
    [RangeBand.LONG]: 4,
    [RangeBand.MEDIUM]: 6,
    [RangeBand.SHORT]: 8,
    [RangeBand.POINT_BLANK]: 9,
    [RangeBand.RAMMING]: 10,
  },
  [DepthBand.DEEP]: {
    [RangeBand.LONG]: 6,
    [RangeBand.MEDIUM]: 8,
    [RangeBand.SHORT]: 9,
    [RangeBand.POINT_BLANK]: 10,
    [RangeBand.RAMMING]: 10,
  },
  [DepthBand.ABYSSAL]: {
    [RangeBand.LONG]: 7,
    [RangeBand.MEDIUM]: 9,
    [RangeBand.SHORT]: 10,
    [RangeBand.POINT_BLANK]: 10,
    [RangeBand.RAMMING]: 10,
  },
};

function effectiveAcousticSig(ship: ShipState): number {
  const speedMod =
    ship.speed === SpeedSetting.AHEAD_FULL
      ? 2
      : ship.speed === SpeedSetting.SILENT
        ? -3
        : 0;
  const fireMod = ship.acousticSigOverride > 0 ? 3 : 0;
  return 4 + speedMod + fireMod;
}

export function contactQuality(
  observer: ShipState,
  target: ShipState,
  range: RangeBand,
): number {
  const bothSurface =
    observer.depth === DepthBand.SURFACE && target.depth === DepthBand.SURFACE;

  let base: number;
  if (observer.depth === DepthBand.SURFACE) {
    base = TABLE_A[target.depth]?.[range] ?? 0;
  } else {
    base = TABLE_B[observer.depth]?.[range] ?? 0;
  }

  if (bothSurface) {
    return Math.min(10, Math.max(0, base));
  }

  const sig = effectiveAcousticSig(target);
  return Math.min(10, Math.max(0, base + (sig - 4)));
}
