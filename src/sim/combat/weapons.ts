import { VisibilityLevel, VesselType } from "./enums.js";
import type { RangeBand } from "./enums.js";
import type { Mulberry32 } from "../prng.js";
import type { CombatConfig } from "./config.js";

export function resolveWeaponFire(
  weaponId: string,
  attackerVisibility: VisibilityLevel,
  rangeBand: RangeBand,
  depthOffset: number,
  rng: Mulberry32,
  config: CombatConfig,
  vesselType: VesselType,
): { fired: boolean; hit: boolean; damage: number } {
  if (attackerVisibility <= VisibilityLevel.NONE) {
    return { fired: false, hit: false, damage: 0 };
  }

  const vesselConfig =
    vesselType === VesselType.SUBMARINE
      ? config.player
      : (config.vessels[vesselType] ?? config.player);

  const weaponConfig = vesselConfig.weapons.find((w) => w.id === weaponId);
  if (weaponConfig === undefined) {
    return { fired: false, hit: false, damage: 0 };
  }

  const rangeRow = weaponConfig.hitMatrix[rangeBand];
  if (rangeRow === undefined) {
    return { fired: false, hit: false, damage: 0 };
  }

  const cell = rangeRow[depthOffset];
  if (cell === undefined || cell.hitRate <= 0) {
    return { fired: false, hit: false, damage: 0 };
  }

  const roll = rng.next();
  const hit = roll < cell.hitRate;
  return { fired: true, hit, damage: cell.damage };
}
