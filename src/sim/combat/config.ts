import {
  DepthBand,
  DepthType,
  DetectionMethod,
  DiveSpeed,
  NauticalSpeed,
  RangeBand,
  VisibilityLevel,
  VesselType,
} from "./enums.js";

// Detection table indexed [observerDepthBand][targetSpeedTier][targetDepthType][rangeBand] → VisibilityLevel
// NauticalSpeed values map directly to SpeedTier (same int values)
export type DetectionTable = Record<
  DepthBand,
  Record<NauticalSpeed, Record<DepthType, Record<RangeBand, VisibilityLevel>>>
>;

export interface WeaponHitCell {
  hitRate: number;
  damage: number;
}

// depthOffsetBand is 0–4
export type WeaponHitMatrix = Record<RangeBand, Record<number, WeaponHitCell>>;

export interface WeaponConfig {
  id: string;
  cooldownTicks: number;
  maxAmmo?: number;
  flightTicks: number;
  hitMatrix: WeaponHitMatrix;
}

export interface SpeedConfig {
  horizontalTable: Record<NauticalSpeed, Record<DepthBand, number>>;
  verticalTable: Record<DiveSpeed, number>;
}

export interface VesselConfig {
  type: VesselType;
  maxHullHP: number;
  detectionMethods: Array<{ method: DetectionMethod; table: DetectionTable }>;
  weapons: WeaponConfig[];
  speedConfig: SpeedConfig;
  startingX: number;
  startingY: number;
  startingNauticalSpeed: NauticalSpeed;
  startingDiveSpeed: DiveSpeed;
  startingIntent: -1 | 0 | 1;
}

export interface CombatConfig {
  player: VesselConfig;
  vessels: Record<VesselType, VesselConfig>;
  escapeTicks: number;
  positionReportInterval: number;
}

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeZeroDetectionTable(): DetectionTable {
  const none = VisibilityLevel.NONE;
  const allRanges: Record<RangeBand, VisibilityLevel> = {
    [RangeBand.CONTACT_RANGE]: none,
    [RangeBand.SHORT]: none,
    [RangeBand.MEDIUM]: none,
    [RangeBand.LONG]: none,
    [RangeBand.EXTREME]: none,
  };
  const allDepthTypes: Record<DepthType, Record<RangeBand, VisibilityLevel>> = {
    [DepthType.SURFACE]: { ...allRanges },
    [DepthType.SUBMERGED]: { ...allRanges },
  };
  const allSpeeds: Record<NauticalSpeed, Record<DepthType, Record<RangeBand, VisibilityLevel>>> = {
    [NauticalSpeed.DEAD_SLOW]: { ...allDepthTypes },
    [NauticalSpeed.HALF_AHEAD]: { ...allDepthTypes },
    [NauticalSpeed.FULL_AHEAD]: { ...allDepthTypes },
    [NauticalSpeed.FLANK]: { ...allDepthTypes },
  };
  return {
    [DepthBand.SURFACE]: { ...allSpeeds },
    [DepthBand.PERISCOPE]: { ...allSpeeds },
    [DepthBand.SHALLOW]: { ...allSpeeds },
    [DepthBand.DEEP]: { ...allSpeeds },
    [DepthBand.ABYSSAL]: { ...allSpeeds },
  };
}

// Deep-clone a detection table so we can safely mutate specific cells
function cloneTable(t: DetectionTable): DetectionTable {
  return JSON.parse(JSON.stringify(t)) as DetectionTable;
}

function setCell(
  table: DetectionTable,
  observerDepths: DepthBand[],
  speeds: NauticalSpeed[],
  depthTypes: DepthType[],
  rangeBands: RangeBand[],
  value: VisibilityLevel,
): void {
  for (const od of observerDepths) {
    for (const sp of speeds) {
      for (const dt of depthTypes) {
        for (const rb of rangeBands) {
          const row = table[od]?.[sp]?.[dt];
          if (row !== undefined) {
            row[rb] = value;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Detection tables
// ---------------------------------------------------------------------------

function makeDestroyerPassiveSonarTable(): DetectionTable {
  const t = cloneTable(makeZeroDetectionTable());

  // Observer at surface or periscope (destroyer is a surface ship)
  const surfaceDepths: DepthBand[] = [DepthBand.SURFACE];
  const allSpeeds: NauticalSpeed[] = [
    NauticalSpeed.DEAD_SLOW,
    NauticalSpeed.HALF_AHEAD,
    NauticalSpeed.FULL_AHEAD,
    NauticalSpeed.FLANK,
  ];

  // DEAD_SLOW target submerged: only CONTACT at SHORT
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SUBMERGED], [RangeBand.MEDIUM, RangeBand.LONG, RangeBand.EXTREME], VisibilityLevel.NONE);
  setCell(t, surfaceDepths, [NauticalSpeed.DEAD_SLOW], [DepthType.SUBMERGED], [RangeBand.CONTACT_RANGE], VisibilityLevel.CONTACT);
  setCell(t, surfaceDepths, [NauticalSpeed.DEAD_SLOW], [DepthType.SUBMERGED], [RangeBand.SHORT], VisibilityLevel.NONE);
  setCell(t, surfaceDepths, [NauticalSpeed.DEAD_SLOW], [DepthType.SUBMERGED], [RangeBand.MEDIUM], VisibilityLevel.NONE);

  // HALF_AHEAD target submerged: CONTACT at CONTACT_RANGE and SHORT
  setCell(t, surfaceDepths, [NauticalSpeed.HALF_AHEAD], [DepthType.SUBMERGED], [RangeBand.CONTACT_RANGE], VisibilityLevel.SILHOUETTE);
  setCell(t, surfaceDepths, [NauticalSpeed.HALF_AHEAD], [DepthType.SUBMERGED], [RangeBand.SHORT], VisibilityLevel.CONTACT);

  // FULL_AHEAD target submerged: SILHOUETTE at CONTACT_RANGE, CONTACT at SHORT, NONE at MEDIUM+
  setCell(t, surfaceDepths, [NauticalSpeed.FULL_AHEAD], [DepthType.SUBMERGED], [RangeBand.CONTACT_RANGE], VisibilityLevel.IDENTIFIED);
  setCell(t, surfaceDepths, [NauticalSpeed.FULL_AHEAD], [DepthType.SUBMERGED], [RangeBand.SHORT], VisibilityLevel.SILHOUETTE);
  setCell(t, surfaceDepths, [NauticalSpeed.FULL_AHEAD], [DepthType.SUBMERGED], [RangeBand.MEDIUM], VisibilityLevel.CONTACT);

  // FLANK target submerged: CONTACT at SHORT per spec, SILHOUETTE at CONTACT_RANGE
  setCell(t, surfaceDepths, [NauticalSpeed.FLANK], [DepthType.SUBMERGED], [RangeBand.CONTACT_RANGE], VisibilityLevel.LOCKED_ON);
  setCell(t, surfaceDepths, [NauticalSpeed.FLANK], [DepthType.SUBMERGED], [RangeBand.SHORT], VisibilityLevel.CONTACT);
  setCell(t, surfaceDepths, [NauticalSpeed.FLANK], [DepthType.SUBMERGED], [RangeBand.MEDIUM], VisibilityLevel.SILHOUETTE);
  setCell(t, surfaceDepths, [NauticalSpeed.FLANK], [DepthType.SUBMERGED], [RangeBand.LONG], VisibilityLevel.CONTACT);

  // Surface target: SILHOUETTE+ at MEDIUM+ for any speed
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.LOCKED_ON);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.IDENTIFIED);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.SILHOUETTE);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.LONG], VisibilityLevel.CONTACT);

  return t;
}

function makeDestroyerVisualTable(): DetectionTable {
  const t = cloneTable(makeZeroDetectionTable());
  const surfaceDepths: DepthBand[] = [DepthBand.SURFACE];
  const allSpeeds: NauticalSpeed[] = [
    NauticalSpeed.DEAD_SLOW,
    NauticalSpeed.HALF_AHEAD,
    NauticalSpeed.FULL_AHEAD,
    NauticalSpeed.FLANK,
  ];

  // LOCKED_ON at CONTACT_RANGE and SHORT for surface targets
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.LOCKED_ON);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.LOCKED_ON);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.IDENTIFIED);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.LONG], VisibilityLevel.SILHOUETTE);
  // Periscope visible from surface at close range
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SUBMERGED], [RangeBand.CONTACT_RANGE], VisibilityLevel.CONTACT);

  return t;
}

function makeGunboatVisualTable(): DetectionTable {
  const t = cloneTable(makeZeroDetectionTable());
  const surfaceDepths: DepthBand[] = [DepthBand.SURFACE];
  const allSpeeds: NauticalSpeed[] = [
    NauticalSpeed.DEAD_SLOW,
    NauticalSpeed.HALF_AHEAD,
    NauticalSpeed.FULL_AHEAD,
    NauticalSpeed.FLANK,
  ];

  // Gunboat: visual only, surface targets
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.LOCKED_ON);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.IDENTIFIED);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.SILHOUETTE);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.LONG], VisibilityLevel.CONTACT);

  return t;
}

function makeMerchantVisualTable(): DetectionTable {
  const t = cloneTable(makeZeroDetectionTable());
  const surfaceDepths: DepthBand[] = [DepthBand.SURFACE];
  const allSpeeds: NauticalSpeed[] = [
    NauticalSpeed.DEAD_SLOW,
    NauticalSpeed.HALF_AHEAD,
    NauticalSpeed.FULL_AHEAD,
    NauticalSpeed.FLANK,
  ];

  // Merchant: poor visual, only surface targets at close range
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.IDENTIFIED);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.SILHOUETTE);
  setCell(t, surfaceDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.CONTACT);

  return t;
}

function makeSubmarinePassiveSonarTable(): DetectionTable {
  const t = cloneTable(makeZeroDetectionTable());
  const submergedDepths: DepthBand[] = [DepthBand.PERISCOPE, DepthBand.SHALLOW];
  const allSpeeds: NauticalSpeed[] = [
    NauticalSpeed.DEAD_SLOW,
    NauticalSpeed.HALF_AHEAD,
    NauticalSpeed.FULL_AHEAD,
    NauticalSpeed.FLANK,
  ];

  // Submarine passive sonar: works when submerged, detects surface vessels easily
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.LOCKED_ON);
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.IDENTIFIED);
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.SILHOUETTE);
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.LONG], VisibilityLevel.CONTACT);

  // At shallow depth, reduced range
  setCell(t, submergedDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.IDENTIFIED);
  setCell(t, submergedDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.SILHOUETTE);
  setCell(t, submergedDepths, allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.CONTACT);

  return t;
}

function makeSubmarineVisualTable(): DetectionTable {
  const t = cloneTable(makeZeroDetectionTable());
  const allSpeeds: NauticalSpeed[] = [
    NauticalSpeed.DEAD_SLOW,
    NauticalSpeed.HALF_AHEAD,
    NauticalSpeed.FULL_AHEAD,
    NauticalSpeed.FLANK,
  ];

  // Periscope visual: can see surface targets
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.CONTACT_RANGE], VisibilityLevel.LOCKED_ON);
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.SHORT], VisibilityLevel.IDENTIFIED);
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.MEDIUM], VisibilityLevel.SILHOUETTE);
  setCell(t, [DepthBand.SURFACE, DepthBand.PERISCOPE], allSpeeds, [DepthType.SURFACE], [RangeBand.LONG], VisibilityLevel.CONTACT);

  return t;
}

// ---------------------------------------------------------------------------
// Weapon hit matrices
// ---------------------------------------------------------------------------

function zeroHitMatrix(): WeaponHitMatrix {
  const zeroCell: WeaponHitCell = { hitRate: 0, damage: 0 };
  const depthRecord: Record<number, WeaponHitCell> = { 0: zeroCell, 1: zeroCell, 2: zeroCell, 3: zeroCell, 4: zeroCell };
  return {
    [RangeBand.CONTACT_RANGE]: { ...depthRecord },
    [RangeBand.SHORT]: { ...depthRecord },
    [RangeBand.MEDIUM]: { ...depthRecord },
    [RangeBand.LONG]: { ...depthRecord },
    [RangeBand.EXTREME]: { ...depthRecord },
  };
}

function makeDeckGunHitMatrix(): WeaponHitMatrix {
  const m = zeroHitMatrix();
  // Deck gun hits surface/periscope targets (depthOffset 0 and 1)
  // CONTACT_RANGE: high hit rate
  const crRow = m[RangeBand.CONTACT_RANGE];
  if (crRow) {
    crRow[0] = { hitRate: 0.85, damage: 3 };
    crRow[1] = { hitRate: 0.60, damage: 2 };
  }
  // SHORT: good hit rate
  const shortRow = m[RangeBand.SHORT];
  if (shortRow) {
    shortRow[0] = { hitRate: 0.65, damage: 3 };
    shortRow[1] = { hitRate: 0.40, damage: 2 };
  }
  // MEDIUM: moderate hit rate
  const medRow = m[RangeBand.MEDIUM];
  if (medRow) {
    medRow[0] = { hitRate: 0.30, damage: 3 };
    medRow[1] = { hitRate: 0.15, damage: 2 };
  }
  // LONG and EXTREME: zero (out of range)
  return m;
}

function makeDepthChargeHitMatrix(): WeaponHitMatrix {
  const m = zeroHitMatrix();
  // Depth charges work at CONTACT_RANGE and SHORT, any depth offset
  const crRow = m[RangeBand.CONTACT_RANGE];
  if (crRow) {
    crRow[0] = { hitRate: 0.70, damage: 3 };
    crRow[1] = { hitRate: 0.65, damage: 3 };
    crRow[2] = { hitRate: 0.55, damage: 3 };
    crRow[3] = { hitRate: 0.40, damage: 3 };
    crRow[4] = { hitRate: 0.25, damage: 3 };
  }
  const shortRow = m[RangeBand.SHORT];
  if (shortRow) {
    shortRow[0] = { hitRate: 0.50, damage: 3 };
    shortRow[1] = { hitRate: 0.55, damage: 3 };
    shortRow[2] = { hitRate: 0.45, damage: 3 };
    shortRow[3] = { hitRate: 0.35, damage: 3 };
    shortRow[4] = { hitRate: 0.20, damage: 3 };
  }
  return m;
}

function makeTorpedoHitMatrix(): WeaponHitMatrix {
  const m = zeroHitMatrix();
  // Torpedoes work at CONTACT_RANGE and SHORT, similar depth (offset 0-2)
  const crRow = m[RangeBand.CONTACT_RANGE];
  if (crRow) {
    crRow[0] = { hitRate: 0.85, damage: 5 };
    crRow[1] = { hitRate: 0.75, damage: 5 };
    crRow[2] = { hitRate: 0.55, damage: 5 };
  }
  const shortRow = m[RangeBand.SHORT];
  if (shortRow) {
    shortRow[0] = { hitRate: 0.75, damage: 5 };
    shortRow[1] = { hitRate: 0.65, damage: 5 };
    shortRow[2] = { hitRate: 0.45, damage: 5 };
  }
  const medRow = m[RangeBand.MEDIUM];
  if (medRow) {
    medRow[0] = { hitRate: 0.55, damage: 5 };
    medRow[1] = { hitRate: 0.45, damage: 5 };
    medRow[2] = { hitRate: 0.30, damage: 5 };
  }
  return m;
}

// ---------------------------------------------------------------------------
// Speed configs
// ---------------------------------------------------------------------------

function makeSurfaceSpeedConfig(
  deadSlow: number,
  halfAhead: number,
  fullAhead: number,
  flank: number,
): SpeedConfig {
  return {
    horizontalTable: {
      [NauticalSpeed.DEAD_SLOW]: {
        [DepthBand.SURFACE]: deadSlow,
        [DepthBand.PERISCOPE]: 0,
        [DepthBand.SHALLOW]: 0,
        [DepthBand.DEEP]: 0,
        [DepthBand.ABYSSAL]: 0,
      },
      [NauticalSpeed.HALF_AHEAD]: {
        [DepthBand.SURFACE]: halfAhead,
        [DepthBand.PERISCOPE]: 0,
        [DepthBand.SHALLOW]: 0,
        [DepthBand.DEEP]: 0,
        [DepthBand.ABYSSAL]: 0,
      },
      [NauticalSpeed.FULL_AHEAD]: {
        [DepthBand.SURFACE]: fullAhead,
        [DepthBand.PERISCOPE]: 0,
        [DepthBand.SHALLOW]: 0,
        [DepthBand.DEEP]: 0,
        [DepthBand.ABYSSAL]: 0,
      },
      [NauticalSpeed.FLANK]: {
        [DepthBand.SURFACE]: flank,
        [DepthBand.PERISCOPE]: 0,
        [DepthBand.SHALLOW]: 0,
        [DepthBand.DEEP]: 0,
        [DepthBand.ABYSSAL]: 0,
      },
    },
    verticalTable: {
      [DiveSpeed.TRIM]: 0,
      [DiveSpeed.STANDARD]: 0,
      [DiveSpeed.HARD]: 0,
      [DiveSpeed.CRASH]: 0,
    },
  };
}

function makeSubmarineSpeedConfig(): SpeedConfig {
  return {
    horizontalTable: {
      [NauticalSpeed.DEAD_SLOW]: {
        [DepthBand.SURFACE]: 4,
        [DepthBand.PERISCOPE]: 4,
        [DepthBand.SHALLOW]: 4,
        [DepthBand.DEEP]: 4,
        [DepthBand.ABYSSAL]: 4,
      },
      [NauticalSpeed.HALF_AHEAD]: {
        [DepthBand.SURFACE]: 8,
        [DepthBand.PERISCOPE]: 8,
        [DepthBand.SHALLOW]: 7,
        [DepthBand.DEEP]: 6,
        [DepthBand.ABYSSAL]: 5,
      },
      [NauticalSpeed.FULL_AHEAD]: {
        [DepthBand.SURFACE]: 14,
        [DepthBand.PERISCOPE]: 12,
        [DepthBand.SHALLOW]: 10,
        [DepthBand.DEEP]: 8,
        [DepthBand.ABYSSAL]: 6,
      },
      [NauticalSpeed.FLANK]: {
        [DepthBand.SURFACE]: 18,
        [DepthBand.PERISCOPE]: 15,
        [DepthBand.SHALLOW]: 12,
        [DepthBand.DEEP]: 10,
        [DepthBand.ABYSSAL]: 8,
      },
    },
    verticalTable: {
      [DiveSpeed.TRIM]: 5,
      [DiveSpeed.STANDARD]: 15,
      [DiveSpeed.HARD]: 25,
      [DiveSpeed.CRASH]: 40,
    },
  };
}

// ---------------------------------------------------------------------------
// Vessel configs
// ---------------------------------------------------------------------------

function makePlayerConfig(): VesselConfig {
  return {
    type: VesselType.SUBMARINE,
    maxHullHP: 20,
    detectionMethods: [
      { method: DetectionMethod.VISUAL_PERISCOPE, table: makeSubmarineVisualTable() },
      { method: DetectionMethod.SONAR_PASSIVE, table: makeSubmarinePassiveSonarTable() },
    ],
    weapons: [
      {
        id: "torpedo",
        cooldownTicks: 20,
        maxAmmo: 4,
        flightTicks: 3,
        hitMatrix: makeTorpedoHitMatrix(),
      },
      {
        id: "deck_gun",
        cooldownTicks: 10,
        flightTicks: 1,
        hitMatrix: makeDeckGunHitMatrix(),
      },
    ],
    speedConfig: makeSubmarineSpeedConfig(),
    startingX: 0,
    startingY: 0,
    startingNauticalSpeed: NauticalSpeed.HALF_AHEAD,
    startingDiveSpeed: DiveSpeed.STANDARD,
    startingIntent: 0,
  };
}

function makeDestroyerConfig(): VesselConfig {
  return {
    type: VesselType.DESTROYER,
    maxHullHP: 20,
    detectionMethods: [
      { method: DetectionMethod.VISUAL_SURFACE, table: makeDestroyerVisualTable() },
      { method: DetectionMethod.SONAR_PASSIVE, table: makeDestroyerPassiveSonarTable() },
    ],
    weapons: [
      {
        id: "deck_gun",
        cooldownTicks: 10,
        flightTicks: 1,
        hitMatrix: makeDeckGunHitMatrix(),
      },
      {
        id: "depth_charge",
        cooldownTicks: 10,
        flightTicks: 1,
        hitMatrix: makeDepthChargeHitMatrix(),
      },
    ],
    speedConfig: makeSurfaceSpeedConfig(5, 10, 15, 20),
    startingX: 700,
    startingY: 0,
    startingNauticalSpeed: NauticalSpeed.FULL_AHEAD,
    startingDiveSpeed: DiveSpeed.TRIM,
    startingIntent: -1,
  };
}

function makeMerchantConfig(): VesselConfig {
  return {
    type: VesselType.MERCHANT,
    maxHullHP: 10,
    detectionMethods: [
      { method: DetectionMethod.VISUAL_SURFACE, table: makeMerchantVisualTable() },
    ],
    weapons: [],
    speedConfig: makeSurfaceSpeedConfig(2, 5, 8, 10),
    startingX: 700,
    startingY: 0,
    startingNauticalSpeed: NauticalSpeed.DEAD_SLOW,
    startingDiveSpeed: DiveSpeed.TRIM,
    startingIntent: 0,
  };
}

function makeGunboatConfig(): VesselConfig {
  return {
    type: VesselType.GUNBOAT,
    maxHullHP: 12,
    detectionMethods: [
      { method: DetectionMethod.VISUAL_SURFACE, table: makeGunboatVisualTable() },
    ],
    weapons: [
      {
        id: "deck_gun",
        cooldownTicks: 10,
        flightTicks: 1,
        hitMatrix: makeDeckGunHitMatrix(),
      },
    ],
    speedConfig: makeSurfaceSpeedConfig(3, 8, 12, 15),
    startingX: 700,
    startingY: 0,
    startingNauticalSpeed: NauticalSpeed.FULL_AHEAD,
    startingDiveSpeed: DiveSpeed.TRIM,
    startingIntent: -1,
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function defaultCombatConfig(): CombatConfig {
  const player = makePlayerConfig();
  const destroyer = makeDestroyerConfig();
  const merchant = makeMerchantConfig();
  const gunboat = makeGunboatConfig();

  return {
    player,
    vessels: {
      [VesselType.SUBMARINE]: player,
      [VesselType.DESTROYER]: destroyer,
      [VesselType.MERCHANT]: merchant,
      [VesselType.GUNBOAT]: gunboat,
    },
    escapeTicks: 30,
    positionReportInterval: 50,
  };
}
