import { DepthBand, NauticalSpeed, DiveSpeed, VisibilityLevel, VesselType } from "./enums.js";
import { BAND_SIZE } from "./geometry.js";
import type { RangeBand } from "./enums.js";
import type { VesselState, AiState } from "./types.js";
import type { CombatConfig } from "./config.js";

export type AiCommand =
  | { type: "SET_SPEED"; speed: NauticalSpeed; intent: -1 | 0 | 1 }
  | { type: "SET_DEPTH"; target: DepthBand; diveSpeed: DiveSpeed }
  | { type: "FIRE_WEAPON"; weaponId: string }
  | { type: "HOLD" }
  | { type: "NONE" };

export function tickEnemyAi(
  enemy: VesselState,
  ai: AiState,
  player: VesselState,
  visibility: VisibilityLevel,
  rangeBand: RangeBand,
  depthOffsetBand: number,
  config: CombatConfig,
): AiCommand[] {
  void rangeBand;
  void depthOffsetBand;
  const commands: AiCommand[] = [];

  if (enemy.vesselType === VesselType.MERCHANT) {
    if (visibility > VisibilityLevel.NONE) {
      commands.push({ type: "SET_SPEED", speed: NauticalSpeed.FLANK, intent: -1 });
    } else {
      commands.push({ type: "HOLD" });
    }
    return commands;
  }

  if (enemy.vesselType === VesselType.DESTROYER || enemy.vesselType === VesselType.GUNBOAT) {
    const isDestroyer = enemy.vesselType === VesselType.DESTROYER;
    const chaseSpeed = isDestroyer ? NauticalSpeed.FULL_AHEAD : NauticalSpeed.HALF_AHEAD;

    if (visibility > VisibilityLevel.NONE) {
      // Close toward player
      const intent: -1 | 0 | 1 = enemy.x > player.x ? -1 : 1;
      commands.push({ type: "SET_SPEED", speed: chaseSpeed, intent });
    } else if (!ai.holdingAtLastKnown) {
      // Navigate toward last known position
      const gapToLastKnown = ai.lastKnownX - enemy.x;
      if (Math.abs(gapToLastKnown) < BAND_SIZE) {
        // Close enough to last known — hold
        commands.push({ type: "HOLD" });
      } else {
        const intent: -1 | 0 | 1 = gapToLastKnown > 0 ? 1 : -1;
        commands.push({ type: "SET_SPEED", speed: NauticalSpeed.HALF_AHEAD, intent });
      }
    } else {
      commands.push({ type: "HOLD" });
    }

    // Fire all ready weapons
    const vesselConfig = config.vessels[enemy.vesselType] ?? config.player;
    for (const weapon of vesselConfig.weapons) {
      const cooldown = enemy.weaponCooldowns[weapon.id] ?? 0;
      const ammo = weapon.maxAmmo !== undefined ? (enemy.weaponAmmo[weapon.id] ?? 0) : Infinity;
      if (cooldown === 0 && ammo > 0) {
        commands.push({ type: "FIRE_WEAPON", weaponId: weapon.id });
      }
    }

    return commands;
  }

  commands.push({ type: "NONE" });
  return commands;
}
