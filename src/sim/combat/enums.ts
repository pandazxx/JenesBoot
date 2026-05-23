export const RangeBand = {
  CONTACT_RANGE: 0,
  SHORT: 1,
  MEDIUM: 2,
  LONG: 3,
  EXTREME: 4,
} as const;
export type RangeBand = (typeof RangeBand)[keyof typeof RangeBand];

export const DepthBand = {
  SURFACE: 0,
  PERISCOPE: 1,
  SHALLOW: 2,
  DEEP: 3,
  ABYSSAL: 4,
} as const;
export type DepthBand = (typeof DepthBand)[keyof typeof DepthBand];

export const NauticalSpeed = {
  DEAD_SLOW: 0,
  HALF_AHEAD: 1,
  FULL_AHEAD: 2,
  FLANK: 3,
} as const;
export type NauticalSpeed = (typeof NauticalSpeed)[keyof typeof NauticalSpeed];

export const DiveSpeed = {
  TRIM: 0,
  STANDARD: 1,
  HARD: 2,
  CRASH: 3,
} as const;
export type DiveSpeed = (typeof DiveSpeed)[keyof typeof DiveSpeed];

export const DetectionMethod = {
  VISUAL_SURFACE: "VISUAL_SURFACE",
  VISUAL_PERISCOPE: "VISUAL_PERISCOPE",
  SONAR_ACTIVE: "SONAR_ACTIVE",
  SONAR_PASSIVE: "SONAR_PASSIVE",
} as const;
export type DetectionMethod = (typeof DetectionMethod)[keyof typeof DetectionMethod];

export const VisibilityLevel = {
  NONE: 0,
  CONTACT: 1,
  SILHOUETTE: 2,
  IDENTIFIED: 3,
  LOCKED_ON: 4,
} as const;
export type VisibilityLevel = (typeof VisibilityLevel)[keyof typeof VisibilityLevel];

export const VesselType = {
  SUBMARINE: "SUBMARINE",
  MERCHANT: "MERCHANT",
  GUNBOAT: "GUNBOAT",
  DESTROYER: "DESTROYER",
} as const;
export type VesselType = (typeof VesselType)[keyof typeof VesselType];

export const DepthType = {
  SURFACE: "SURFACE",
  SUBMERGED: "SUBMERGED",
} as const;
export type DepthType = (typeof DepthType)[keyof typeof DepthType];
