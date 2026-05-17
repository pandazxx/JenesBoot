/**
 * Detection / contact-quality calculations.
 *
 * Returns a value 0–10 representing how well an observer can track a target.
 * A value >= 4 is "TRACKING" — sufficient to fire weapons.
 */

import { DepthBand, DetectionMethod, RangeBand, SpeedSetting } from "./types.js";
import type { ShipState } from "./types.js";

// Visual detection: indexed [observerDepth][targetDepth][range].
// Submerged observers have no visual. Surface/periscope observers cannot see
// below PERISCOPE depth.
const VISUAL_TABLE: Record<DepthBand, Record<DepthBand, Record<RangeBand, number>>> = {
  [DepthBand.SURFACE]: {
    [DepthBand.SURFACE]: {
      [RangeBand.LONG]: 8,
      [RangeBand.MEDIUM]: 9,
      [RangeBand.SHORT]: 10,
      [RangeBand.POINT_BLANK]: 10,
      [RangeBand.RAMMING]: 10,
    },
    [DepthBand.PERISCOPE]: {
      [RangeBand.LONG]: 1,
      [RangeBand.MEDIUM]: 2,
      [RangeBand.SHORT]: 4,
      [RangeBand.POINT_BLANK]: 3,
      [RangeBand.RAMMING]: 4,
    },
    [DepthBand.SHALLOW]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.DEEP]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.ABYSSAL]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
  },
  [DepthBand.PERISCOPE]: {
    [DepthBand.SURFACE]: {
      [RangeBand.LONG]: 8,
      [RangeBand.MEDIUM]: 9,
      [RangeBand.SHORT]: 10,
      [RangeBand.POINT_BLANK]: 10,
      [RangeBand.RAMMING]: 10,
    },
    [DepthBand.PERISCOPE]: {
      [RangeBand.LONG]: 1,
      [RangeBand.MEDIUM]: 2,
      [RangeBand.SHORT]: 4,
      [RangeBand.POINT_BLANK]: 3,
      [RangeBand.RAMMING]: 4,
    },
    [DepthBand.SHALLOW]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.DEEP]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.ABYSSAL]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
  },
  [DepthBand.SHALLOW]: {
    [DepthBand.SURFACE]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.PERISCOPE]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.SHALLOW]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.DEEP]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.ABYSSAL]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
  },
  [DepthBand.DEEP]: {
    [DepthBand.SURFACE]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.PERISCOPE]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.SHALLOW]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.DEEP]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.ABYSSAL]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
  },
  [DepthBand.ABYSSAL]: {
    [DepthBand.SURFACE]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.PERISCOPE]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.SHALLOW]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.DEEP]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
    [DepthBand.ABYSSAL]: {
      [RangeBand.LONG]: 0,
      [RangeBand.MEDIUM]: 0,
      [RangeBand.SHORT]: 0,
      [RangeBand.POINT_BLANK]: 0,
      [RangeBand.RAMMING]: 0,
    },
  },
};

// Sonar detection base values per [observerDepth][range] — replicated across all targetDepth rows.
// These are the old TABLE_B values (acoustic detection regardless of target depth).
const SONAR_BASE: Record<DepthBand, Record<RangeBand, number>> = {
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
    ship.speed === SpeedSetting.AHEAD_FULL ? 2 : ship.speed === SpeedSetting.SILENT ? -3 : 0;
  const fireMod = ship.acousticSigOverride > 0 ? 3 : 0;
  return 4 + speedMod + fireMod;
}

export function contactQuality(observer: ShipState, target: ShipState, range: RangeBand): number {
  let best = 0;

  for (const method of observer.detectionMethods) {
    let base: number;

    if (method === DetectionMethod.VISUAL) {
      base = VISUAL_TABLE[observer.depth]?.[target.depth]?.[range] ?? 0;
    } else if (method === DetectionMethod.SONAR) {
      const sig = effectiveAcousticSig(target);
      const sonarBase = SONAR_BASE[observer.depth]?.[range] ?? 0;
      base = sonarBase + (sig - 4);
    } else {
      base = 0;
    }

    if (base > best) best = base;
  }

  return Math.min(10, Math.max(0, best));
}
