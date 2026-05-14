/**
 * Combat system types.
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

export const DetectionMethod = {
  VISUAL: "visual",
  SONAR: "sonar",
  RADAR: "radar",
} as const;
export type DetectionMethod = (typeof DetectionMethod)[keyof typeof DetectionMethod];

export const RoomType = {
  BRIDGE: "BRIDGE",
  DECK_GUN: "DECK_GUN",
  ENGINE: "ENGINE",
  TORPEDO: "TORPEDO",
} as const;
export type RoomType = (typeof RoomType)[keyof typeof RoomType];

export interface CrewMember {
  id: string;
  name: string;
  roomId: string | null;
}

export interface Room {
  id: string;
  type: RoomType;
  crewIds: string[];
}

export const DepthBand = {
  SURFACE: 0,
  PERISCOPE: 1,
  SHALLOW: 2,
  DEEP: 3,
  ABYSSAL: 4,
} as const;
export type DepthBand = (typeof DepthBand)[keyof typeof DepthBand];

export const RangeBand = {
  RAMMING: 0,
  POINT_BLANK: 1,
  SHORT: 2,
  MEDIUM: 3,
  LONG: 4,
} as const;
export type RangeBand = (typeof RangeBand)[keyof typeof RangeBand];

export const SpeedSetting = {
  SILENT: 0,
  STANDARD: 1,
  AHEAD_FULL: 2,
} as const;
export type SpeedSetting = (typeof SpeedSetting)[keyof typeof SpeedSetting];

export const SpeedDirection = {
  OPEN: -1,
  HOLD: 0,
  CLOSE: 1,
} as const;
export type SpeedDirection = (typeof SpeedDirection)[keyof typeof SpeedDirection];

export interface ShipState {
  hullHP: number;
  maxHullHP: number;
  depth: DepthBand;
  depthTarget: DepthBand;
  depthTransitionTicks: number;
  speed: SpeedSetting;
  direction: SpeedDirection;
  rangeTicksAccumulator: number;
  deckGunCooldown: number;
  torpedoCooldown: number;
  torpedoCount: number;
  acousticSig: number;
  acousticSigOverride: number;
  evasion: number;
  detectionMethods: DetectionMethod[];
  speedOverride?: number;
}

export interface CombatState {
  scenario: "surface_battle" | "destroyer_dive" | "gunboat_hunt";
  range: RangeBand;
  player: ShipState;
  enemy: ShipState;
  inFlight: InFlightProjectile[];
  result: "ongoing" | "player_win" | "player_lose" | "escaped";
  playerFiredTicks: number;
  enemyFiredTicks: number;
  crew: CrewMember[];
  rooms: Room[];
  enemyLastKnownRange: RangeBand;
  enemyBlindShotsFired: number;
  enemyTracking: boolean;
  escapeAccumulator: number;
}

export interface InFlightProjectile {
  firedBy: "player" | "enemy";
  damage: number;
  arrivesOnTick: number;
}

export type CombatEventType =
  | "combat_start"
  | "range_change"
  | "depth_change"
  | "shot_fired"
  | "shot_hit"
  | "shot_miss"
  | "combat_end"
  | "enemy_spotted"
  | "enemy_contact_lost";

export interface CombatEvent {
  type: CombatEventType;
  payload: unknown;
}
