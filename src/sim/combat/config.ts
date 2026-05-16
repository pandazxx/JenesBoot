/**
 * SimConfig — all tunable simulation parameters in one place.
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 * loadSimConfig / saveSimConfig access localStorage — only call from the
 * render layer (or settings panel). The sim itself only reads the config
 * value it was handed; it does not touch localStorage.
 */

export interface SimConfig {
  // Movement (x-units/tick)
  xSpeedSilent: number;
  xSpeedStandard: number;
  xSpeedAheadFull: number;
  ySpeed: number;

  // Oxygen
  maxOxygen: number;
  o2DrainPeriscope: number;
  o2DrainShallow: number;
  o2DrainDeep: number;
  o2DrainAbyssal: number;
  o2DrainStandard: number;
  o2DrainAheadFull: number;
  o2SurfaceRegen: number;
  o2GraceTicks: number;

  // Player ship
  playerMaxHullHP: number;
  playerTorpedoCount: number;

  // Weapons
  deckGunDamage: number;
  deckGunCooldown: number;
  torpedoDamage: number;
  torpedoCooldown: number;
  torpedoFlightTicks: number;
  depthChargeDamage: number;
  depthChargeCooldown: number;

  // Enemy HP per scenario
  enemyHullSurfaceBattle: number;
  enemyHullDestroyerDive: number;
  enemyHullGunboatHunt: number;
  enemyHullDestroyerBattle: number;
  enemyHullSubmergedAmbush: number;

  // Enemy initial speed (0=SILENT, 1=STANDARD, 2=AHEAD_FULL)
  enemySpeedDestroyerDive: number;
  enemySpeedGunboatHunt: number;
  enemySpeedDestroyerBattle: number;

  // Escape thresholds (ticks)
  escapeTicksDestroyerDive: number;
  escapeTicksSubmergedAmbush: number;
  escapeTicksOther: number;
}

export function defaultSimConfig(): SimConfig {
  return {
    xSpeedSilent: 6,
    xSpeedStandard: 10,
    xSpeedAheadFull: 15,
    ySpeed: 25,

    maxOxygen: 1800,
    o2DrainPeriscope: 1,
    o2DrainShallow: 2,
    o2DrainDeep: 3,
    o2DrainAbyssal: 4,
    o2DrainStandard: 1,
    o2DrainAheadFull: 2,
    o2SurfaceRegen: 2,
    o2GraceTicks: 20,

    playerMaxHullHP: 20,
    playerTorpedoCount: 4,

    deckGunDamage: 3,
    deckGunCooldown: 10,
    torpedoDamage: 5,
    torpedoCooldown: 20,
    torpedoFlightTicks: 3,
    depthChargeDamage: 3,
    depthChargeCooldown: 10,

    enemyHullSurfaceBattle: 8,
    enemyHullDestroyerDive: 10,
    enemyHullGunboatHunt: 15,
    enemyHullDestroyerBattle: 10,
    enemyHullSubmergedAmbush: 10,

    enemySpeedDestroyerDive: 2,
    enemySpeedGunboatHunt: 2,
    enemySpeedDestroyerBattle: 2,

    escapeTicksDestroyerDive: 40,
    escapeTicksSubmergedAmbush: 30,
    escapeTicksOther: 20,
  };
}

const LS_KEY = "jenesboot-sim-config";

export function loadSimConfig(): SimConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultSimConfig();
    return { ...defaultSimConfig(), ...(JSON.parse(raw) as Partial<SimConfig>) };
  } catch {
    return defaultSimConfig();
  }
}

export function saveSimConfig(config: SimConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    // ignore — storage may be unavailable
  }
}

export function resetSimConfig(): SimConfig {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
  return defaultSimConfig();
}
