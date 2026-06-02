import type {
  DepthBand,
  DepthType,
  DetectionMethod,
  DiveSpeed,
  NauticalSpeed,
  RangeBand,
  VisibilityLevel,
  VesselType,
} from "./enums.js";

export interface VesselState {
  vesselType: VesselType;
  hullHP: number;
  maxHullHP: number;
  x: number;
  y: number;
  depth: DepthBand;
  depthTarget: DepthBand;
  nauticalSpeed: NauticalSpeed;
  diveSpeed: DiveSpeed;
  horizontalIntent: -1 | 0 | 1;
  weaponCooldowns: Record<string, number>;
  weaponAmmo: Record<string, number>;
  detectionMethods: readonly DetectionMethod[];
}

export interface AiState {
  currentVisibility: VisibilityLevel;
  lastKnownX: number;
  lastKnownY: number;
  holdingAtLastKnown: boolean;
}

export interface InFlightProjectile {
  firedBy: "player" | "enemy";
  weaponId: string;
  damage: number;
  arrivesOnTick: number;
}

export interface CombatState {
  enemyType: VesselType;
  player: VesselState;
  enemy: VesselState;
  enemyAi: AiState;
  inFlight: InFlightProjectile[];
  result: "ongoing" | "player_win" | "player_lose" | "escaped";
  escapeAccumulator: number;
  prevRangeBand: RangeBand;
  prevPlayerDepth: DepthBand;
  prevEnemyDepth: DepthBand;
  prevEnemyVisibility: VisibilityLevel;
  /**
   * True once the merchant has spotted the player (visibility > NONE for the first time).
   * Committed-flight flag: once set, the merchant flees even if it briefly loses contact.
   */
  merchantHasSpotted: boolean;
}

export type CombatEventType =
  | "combat_start"
  | "visibility_change"
  | "range_change"
  | "depth_change"
  | "weapon_fired"
  | "weapon_hit"
  | "weapon_miss"
  | "combat_end"
  | "enemy_spotted"
  | "enemy_contact_lost"
  | "merchant_fled"
  | "position_report";

export interface CombatEvent {
  type: CombatEventType;
  payload: unknown;
}

export type PlayerCommand =
  | { type: "SET_NAUTICAL_SPEED"; speed: NauticalSpeed; intent: -1 | 0 | 1 }
  | { type: "SET_DEPTH"; target: DepthBand; diveSpeed: DiveSpeed }
  | { type: "FIRE_WEAPON"; weaponId: string }
  | { type: "NONE" };

export type {
  DepthBand,
  DepthType,
  DetectionMethod,
  DiveSpeed,
  NauticalSpeed,
  RangeBand,
  VisibilityLevel,
  VesselType,
};
