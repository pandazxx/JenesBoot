import { DepthBand, RangeBand, VisibilityLevel, VesselType } from "./enums.js";
import { toDepthBand } from "./geometry.js";
import type { VesselState, AiState, CombatState } from "./types.js";
import type { CombatConfig, VesselConfig } from "./config.js";

function buildVesselState(cfg: VesselConfig): VesselState {
  const weaponCooldowns: Record<string, number> = {};
  const weaponAmmo: Record<string, number> = {};

  for (const weapon of cfg.weapons) {
    weaponCooldowns[weapon.id] = 0;
    if (weapon.maxAmmo !== undefined) {
      weaponAmmo[weapon.id] = weapon.maxAmmo;
    }
  }

  const depth = toDepthBand(cfg.startingY);

  return {
    vesselType: cfg.type,
    hullHP: cfg.maxHullHP,
    maxHullHP: cfg.maxHullHP,
    x: cfg.startingX,
    y: cfg.startingY,
    depth,
    depthTarget: depth,
    nauticalSpeed: cfg.startingNauticalSpeed,
    diveSpeed: cfg.startingDiveSpeed,
    horizontalIntent: cfg.startingIntent,
    weaponCooldowns,
    weaponAmmo,
    detectionMethods: cfg.detectionMethods.map((d) => d.method),
  };
}

function buildAiState(player: VesselState): AiState {
  return {
    currentVisibility: VisibilityLevel.NONE,
    lastKnownX: player.x,
    lastKnownY: player.y,
    holdingAtLastKnown: false,
  };
}

export function buildInitialState(enemyType: VesselType, config: CombatConfig): CombatState {
  const enemyConfig = config.vessels[enemyType] ?? config.player;
  const player = buildVesselState(config.player);
  const enemy = buildVesselState(enemyConfig);

  return {
    enemyType,
    player,
    enemy,
    enemyAi: buildAiState(player),
    inFlight: [],
    result: "ongoing",
    escapeAccumulator: 0,
    prevRangeBand: RangeBand.LONG,
    prevPlayerDepth: DepthBand.SURFACE,
    prevEnemyDepth: DepthBand.SURFACE,
    prevEnemyVisibility: VisibilityLevel.NONE,
  };
}

export function cloneVessel(v: VesselState): VesselState {
  return {
    ...v,
    weaponCooldowns: { ...v.weaponCooldowns },
    weaponAmmo: { ...v.weaponAmmo },
    detectionMethods: [...v.detectionMethods],
  };
}

export function cloneState(s: CombatState): CombatState {
  return {
    ...s,
    player: cloneVessel(s.player),
    enemy: cloneVessel(s.enemy),
    enemyAi: { ...s.enemyAi },
    inFlight: s.inFlight.map((p) => ({ ...p })),
  };
}

