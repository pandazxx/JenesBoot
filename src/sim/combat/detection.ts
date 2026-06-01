import { VisibilityLevel, VesselType } from "./enums.js";
import { toRangeBand, toDepthType } from "./geometry.js";
import type { VesselState } from "./types.js";
import type { CombatConfig } from "./config.js";

export function computeVisibility(
  observer: VesselState,
  target: VesselState,
  euclidDist: number,
  config: CombatConfig,
): VisibilityLevel {
  const observerConfig =
    observer.vesselType === VesselType.SUBMARINE
      ? config.player
      : (config.vessels[observer.vesselType] ?? config.player);

  const rangeBand = toRangeBand(euclidDist);
  const targetDepthType = toDepthType(target.depth);
  const targetSpeed = target.nauticalSpeed;

  let best: VisibilityLevel = VisibilityLevel.NONE;

  for (const { method, table } of observerConfig.detectionMethods) {
    if (!observer.detectionMethods.includes(method)) continue;

    const depthRow = table[observer.depth];
    if (depthRow === undefined) continue;

    const speedRow = depthRow[targetSpeed];
    if (speedRow === undefined) continue;

    const depthTypeRow = speedRow[targetDepthType];
    if (depthTypeRow === undefined) continue;

    const value = depthTypeRow[rangeBand] ?? VisibilityLevel.NONE;
    if (value > best) best = value;
  }

  return best;
}
