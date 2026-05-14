/**
 * Combat tick — advances CombatState by one simulation tick.
 *
 * 10-step sequence per §8 of the battle-loop design doc.
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import {
  DepthBand,
  DetectionMethod,
  RangeBand,
  RoomType,
  SpeedSetting,
  SpeedDirection,
} from "./types.js";
import type {
  CombatState,
  ShipState,
  CombatEvent,
  InFlightProjectile,
  CrewMember,
  Room,
} from "./types.js";
import type { Mulberry32 } from "../prng.js";
import { contactQuality } from "./detection.js";
import {
  resolveDeckGun,
  resolveTorpedo,
  resolveDepthCharge,
  DECK_GUN_ACCURACY,
  DECK_GUN_DAMAGE,
  DECK_GUN_COOLDOWN_TICKS,
  TORPEDO_ACCURACY,
  TORPEDO_DAMAGE,
  TORPEDO_COOLDOWN_TICKS,
  TORPEDO_FLIGHT_TICKS,
  DEPTH_CHARGE_ACCURACY,
  DEPTH_CHARGE_DAMAGE,
  DEPTH_CHARGE_COOLDOWN_TICKS,
  deckGunDepthDamageMultiplier,
} from "./weapons.js";
import {
  merchantAi,
  destroyerAi,
  destroyerBattleAi,
  gunboatAi,
  MERCHANT_RANGE_TICKS_PER_BAND,
  DESTROYER_RANGE_TICKS_PER_BAND,
} from "./ai.js";

const PLAYER_RANGE_TICKS: Record<SpeedSetting, number> = {
  [SpeedSetting.SILENT]: 25,
  [SpeedSetting.STANDARD]: 15,
  [SpeedSetting.AHEAD_FULL]: 10,
};

// Speed weight for net-direction calculation: faster ships exert more force.
const SPEED_WEIGHT: Record<SpeedSetting, number> = {
  [SpeedSetting.SILENT]: 1,
  [SpeedSetting.STANDARD]: 2,
  [SpeedSetting.AHEAD_FULL]: 3,
};

const DECK_GUN_FLIGHT_TICKS = 1;
const TRACKING_THRESHOLD = 4;
const DEPTH_TICKS_PER_BAND = 6;

export type PlayerCommand =
  | { type: "SET_SPEED"; speed: SpeedSetting; direction: SpeedDirection }
  | { type: "SET_DEPTH"; target: DepthBand }
  | { type: "FIRE_DECK_GUN" }
  | { type: "FIRE_TORPEDO" }
  | { type: "NONE" }
  | { type: "ASSIGN_CREW"; crewId: string; roomId: string };

function cloneShip(s: ShipState): ShipState {
  return { ...s };
}

function cloneState(s: CombatState): CombatState {
  return {
    ...s,
    player: cloneShip(s.player),
    enemy: cloneShip(s.enemy),
    inFlight: s.inFlight.map((p) => ({ ...p })),
    crew: s.crew.map((c) => ({ ...c })),
    rooms: s.rooms.map((r) => ({ ...r, crewIds: [...r.crewIds] })),
  };
}

function applyCommand(
  ship: ShipState,
  cmd: { type: string; speed?: SpeedSetting; direction?: SpeedDirection },
): void {
  if (cmd.type === "SET_SPEED") {
    if (cmd.speed !== undefined) ship.speed = cmd.speed;
    if (cmd.direction !== undefined) ship.direction = cmd.direction;
  }
}

function rangeTicksNeeded(ship: ShipState, isEnemy: boolean, scenario: string): number {
  if (isEnemy) {
    if (scenario === "destroyer_dive") return DESTROYER_RANGE_TICKS_PER_BAND;
    if (scenario === "gunboat_hunt") return DESTROYER_RANGE_TICKS_PER_BAND;
    if (scenario === "destroyer_battle") return DESTROYER_RANGE_TICKS_PER_BAND;
    return MERCHANT_RANGE_TICKS_PER_BAND;
  }
  return PLAYER_RANGE_TICKS[ship.speed] ?? 15;
}

function shiftRange(current: RangeBand, direction: SpeedDirection): RangeBand {
  const next = current - direction;
  return Math.max(RangeBand.RAMMING, Math.min(RangeBand.LONG, next)) as RangeBand;
}

function deckGunInRange(range: RangeBand): boolean {
  return range < RangeBand.LONG;
}

function torpedoInRange(range: RangeBand): boolean {
  return range <= RangeBand.MEDIUM;
}

/**
 * Advance one depth band toward depthTarget.
 * Returns the new depth if a band shift occurred this tick, otherwise null.
 */
function advanceDepth(ship: ShipState): DepthBand | null {
  if (ship.depth === ship.depthTarget) return null;

  if (ship.depthTransitionTicks === 0) {
    ship.depthTransitionTicks = DEPTH_TICKS_PER_BAND;
  }

  ship.depthTransitionTicks -= 1;

  if (ship.depthTransitionTicks === 0) {
    const dir = ship.depthTarget > ship.depth ? 1 : -1;
    ship.depth = (ship.depth + dir) as DepthBand;
    return ship.depth;
  }

  return null;
}

export function tickCombat(
  state: CombatState,
  currentTick: number,
  rng: Mulberry32,
  playerCmd?: PlayerCommand | null,
): { newState: CombatState; events: CombatEvent[] } {
  if (state.result !== "ongoing") {
    return { newState: cloneState(state), events: [] };
  }

  const s = cloneState(state);
  const events: CombatEvent[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Resolve in-flight projectiles arriving this tick
  // -------------------------------------------------------------------------
  const stillInFlight: InFlightProjectile[] = [];
  for (const proj of s.inFlight) {
    if (proj.arrivesOnTick === currentTick) {
      const target = proj.firedBy === "player" ? s.enemy : s.player;
      target.hullHP = Math.max(0, target.hullHP - proj.damage);
      events.push({
        type: "shot_hit",
        payload: { by: proj.firedBy, damage: proj.damage, targetHP: target.hullHP },
      });
    } else {
      stillInFlight.push(proj);
    }
  }
  s.inFlight = stillInFlight;

  // -------------------------------------------------------------------------
  // Step 2: Cooldowns tick down
  // -------------------------------------------------------------------------
  if (s.player.deckGunCooldown > 0) s.player.deckGunCooldown -= 1;
  if (s.player.torpedoCooldown > 0) s.player.torpedoCooldown -= 1;
  if (s.enemy.deckGunCooldown > 0) s.enemy.deckGunCooldown -= 1;
  if (s.enemy.torpedoCooldown > 0) s.enemy.torpedoCooldown -= 1;
  if (s.playerFiredTicks > 0) {
    s.playerFiredTicks -= 1;
    if (s.playerFiredTicks === 0) s.player.acousticSigOverride = 0;
  }
  if (s.enemyFiredTicks > 0) {
    s.enemyFiredTicks -= 1;
    if (s.enemyFiredTicks === 0) s.enemy.acousticSigOverride = 0;
  }

  // -------------------------------------------------------------------------
  // Step 3: Fire commands arrive via playerCmd; speed/depth are sticky
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Step 4: Enemy AI
  // -------------------------------------------------------------------------
  const enemyCQ = contactQuality(s.enemy, s.player, s.range);

  const wasTracking = s.enemyTracking;
  if (enemyCQ >= TRACKING_THRESHOLD) {
    s.enemyLastKnownRange = s.range;
    s.enemyBlindShotsFired = 0;
    s.enemyTracking = true;
    if (!wasTracking) {
      events.push({
        type: "enemy_spotted",
        payload: { range: s.range, playerDepth: s.player.depth },
      });
    }
  } else {
    s.enemyTracking = false;
    if (wasTracking) {
      events.push({
        type: "enemy_contact_lost",
        payload: { lastKnownRange: s.enemyLastKnownRange },
      });
    }
  }

  let enemyCmd;
  if (s.scenario === "destroyer_dive") {
    enemyCmd = destroyerAi(s.enemy, s.range, s.player.depth);
  } else if (s.scenario === "destroyer_battle") {
    enemyCmd = destroyerBattleAi(s.enemy, s.range, s.player.depth, enemyCQ);
  } else if (s.scenario === "gunboat_hunt") {
    enemyCmd = gunboatAi(
      s.enemy,
      s.range,
      s.player.depth,
      enemyCQ,
      s.enemyLastKnownRange,
      s.enemyBlindShotsFired,
    );
  } else {
    enemyCmd = merchantAi(s.enemy, s.range, s.enemy.maxHullHP);
  }

  if (enemyCmd.type === "SET_SPEED") {
    applyCommand(s.enemy, enemyCmd);
  } else if (enemyCmd.type === "FIRE_BLIND_SHOT") {
    // Blind shots are fired from a stationary search pattern — stop closing.
    s.enemy.direction = SpeedDirection.HOLD;
  } else if (enemyCmd.type === "FIRE_DEPTH_CHARGE") {
    // Destroyer holds position while dropping charges.
    s.enemy.direction = SpeedDirection.HOLD;
  }

  // -------------------------------------------------------------------------
  // Step 5: Advance range
  // -------------------------------------------------------------------------
  // Speed-weighted net direction: AHEAD_FULL beats STANDARD beats SILENT.
  // This lets a destroyer outrun a standard-speed submarine.
  // speedOverride on a ship substitutes for the table lookup (e.g. gunboat at 4).
  const playerWeight =
    (s.player.speedOverride ?? SPEED_WEIGHT[s.player.speed] ?? 2) * s.player.direction;
  const enemyWeight =
    (s.enemy.speedOverride ?? SPEED_WEIGHT[s.enemy.speed] ?? 2) * s.enemy.direction;
  const netDirectionRaw = playerWeight + enemyWeight;
  const netDirection: SpeedDirection =
    netDirectionRaw > 0
      ? SpeedDirection.CLOSE
      : netDirectionRaw < 0
        ? SpeedDirection.OPEN
        : SpeedDirection.HOLD;

  if (netDirection !== SpeedDirection.HOLD) {
    s.player.rangeTicksAccumulator += 1;
    const needed = rangeTicksNeeded(s.player, false, s.scenario);
    if (s.player.rangeTicksAccumulator >= needed) {
      s.player.rangeTicksAccumulator -= needed;
      const prevRange = s.range;
      s.range = shiftRange(s.range, netDirection);
      if (s.range !== prevRange) {
        events.push({ type: "range_change", payload: { from: prevRange, to: s.range } });
      }
    }
  } else {
    s.player.rangeTicksAccumulator = 0;
  }

  // -------------------------------------------------------------------------
  // Step 6: Advance depth transitions
  // -------------------------------------------------------------------------
  const playerNewDepth = advanceDepth(s.player);
  if (playerNewDepth !== null) {
    events.push({ type: "depth_change", payload: { who: "player", depth: playerNewDepth } });
  }

  const enemyNewDepth = advanceDepth(s.enemy);
  if (enemyNewDepth !== null) {
    events.push({ type: "depth_change", payload: { who: "enemy", depth: enemyNewDepth } });
  }

  // -------------------------------------------------------------------------
  // Step 7: Fire weapons
  // -------------------------------------------------------------------------

  // Player deck gun — surface only, requires DECK_GUN room crew
  const deckGunCrewed = s.rooms.some((r) => r.type === RoomType.DECK_GUN && r.crewIds.length > 0);
  const playerAtSurface = s.player.depth === DepthBand.SURFACE;
  const playerWantsDeckGun =
    playerCmd?.type === "FIRE_DECK_GUN" ||
    (s.player.deckGunCooldown === 0 && deckGunInRange(s.range) && playerAtSurface);

  if (
    deckGunCrewed &&
    playerAtSurface &&
    playerWantsDeckGun &&
    deckGunInRange(s.range) &&
    s.player.deckGunCooldown === 0 &&
    contactQuality(s.player, s.enemy, s.range) >= TRACKING_THRESHOLD
  ) {
    const accuracy = DECK_GUN_ACCURACY[s.range] ?? 0;
    const hit = resolveDeckGun(accuracy, s.enemy.evasion, rng);
    events.push({
      type: "shot_fired",
      payload: { by: "player", weapon: "deck_gun", range: s.range },
    });
    s.player.deckGunCooldown = DECK_GUN_COOLDOWN_TICKS;
    s.player.acousticSigOverride = 1;
    s.playerFiredTicks = 5;
    if (hit) {
      s.inFlight.push({
        firedBy: "player",
        damage: DECK_GUN_DAMAGE,
        arrivesOnTick: currentTick + DECK_GUN_FLIGHT_TICKS,
      });
    } else {
      events.push({ type: "shot_miss", payload: { by: "player", weapon: "deck_gun" } });
    }
  }

  // Player torpedo — requires TORPEDO room crew, depth PERISCOPE–DEEP, range ≤ MEDIUM
  const torpedoCrewed = s.rooms.some((r) => r.type === RoomType.TORPEDO && r.crewIds.length > 0);
  const playerSubmerged = s.player.depth >= DepthBand.PERISCOPE && s.player.depth <= DepthBand.DEEP;
  const playerWantsTorpedo =
    playerCmd?.type === "FIRE_TORPEDO" ||
    (s.player.torpedoCooldown === 0 && torpedoInRange(s.range) && playerSubmerged);

  if (
    torpedoCrewed &&
    playerSubmerged &&
    playerWantsTorpedo &&
    torpedoInRange(s.range) &&
    s.player.torpedoCooldown === 0 &&
    s.player.torpedoCount > 0 &&
    contactQuality(s.player, s.enemy, s.range) >= TRACKING_THRESHOLD
  ) {
    const accuracy = TORPEDO_ACCURACY[s.range] ?? 0;
    const hit = resolveTorpedo(accuracy, s.enemy.evasion, rng);
    events.push({
      type: "shot_fired",
      payload: { by: "player", weapon: "torpedo", range: s.range },
    });
    s.player.torpedoCooldown = TORPEDO_COOLDOWN_TICKS;
    s.player.torpedoCount -= 1;
    s.player.acousticSigOverride = 1;
    s.playerFiredTicks = 5;
    if (hit) {
      s.inFlight.push({
        firedBy: "player",
        damage: TORPEDO_DAMAGE,
        arrivesOnTick: currentTick + TORPEDO_FLIGHT_TICKS,
      });
    } else {
      events.push({ type: "shot_miss", payload: { by: "player", weapon: "torpedo" } });
    }
  }

  // Enemy deck gun — fires when tracking; depth multiplier applied
  if (
    enemyCmd.type === "FIRE_DECK_GUN" &&
    deckGunInRange(s.range) &&
    s.enemy.deckGunCooldown === 0 &&
    enemyCQ >= TRACKING_THRESHOLD
  ) {
    const dmgMult = deckGunDepthDamageMultiplier(s.player.depth);
    if (dmgMult > 0) {
      const accuracy = DECK_GUN_ACCURACY[s.range] ?? 0;
      const hit = resolveDeckGun(accuracy, s.player.evasion, rng);
      const damage = Math.max(1, Math.round(DECK_GUN_DAMAGE * dmgMult));
      events.push({
        type: "shot_fired",
        payload: { by: "enemy", weapon: "deck_gun", range: s.range },
      });
      s.enemy.deckGunCooldown = DECK_GUN_COOLDOWN_TICKS;
      s.enemy.acousticSigOverride = 1;
      s.enemyFiredTicks = 5;
      if (hit) {
        s.inFlight.push({
          firedBy: "enemy",
          damage,
          arrivesOnTick: currentTick + DECK_GUN_FLIGHT_TICKS,
        });
      } else {
        events.push({ type: "shot_miss", payload: { by: "enemy", weapon: "deck_gun" } });
      }
    }
  }

  // Enemy blind shot — gunboat fires at last known range without contact quality gate.
  // AI state updates (counter, cooldown) always apply so the AI exhausts its 3 blind shots.
  // Actual projectile is skipped silently if depth blocks it (dmgMult === 0).
  if (
    enemyCmd.type === "FIRE_BLIND_SHOT" &&
    deckGunInRange(s.range) &&
    s.enemy.deckGunCooldown === 0
  ) {
    s.enemyBlindShotsFired += 1;
    s.enemy.deckGunCooldown = DECK_GUN_COOLDOWN_TICKS;
    s.enemy.acousticSigOverride = 1;
    s.enemyFiredTicks = 5;
    const dmgMult = deckGunDepthDamageMultiplier(s.player.depth);
    if (dmgMult > 0) {
      const accuracy = DECK_GUN_ACCURACY[s.range] ?? 0;
      const hit = resolveDeckGun(accuracy, s.player.evasion, rng);
      const damage = Math.max(1, Math.round(DECK_GUN_DAMAGE * dmgMult));
      events.push({
        type: "shot_fired",
        payload: { by: "enemy", weapon: "deck_gun", blind: true, range: s.range },
      });
      if (hit) {
        s.inFlight.push({
          firedBy: "enemy",
          damage,
          arrivesOnTick: currentTick + DECK_GUN_FLIGHT_TICKS,
        });
      } else {
        events.push({
          type: "shot_miss",
          payload: { by: "enemy", weapon: "deck_gun", blind: true },
        });
      }
    }
  }

  // Enemy depth charge — destroyer_battle fires at submerged sub at SHORT range.
  // torpedoCooldown doubles as depth charge cooldown on the destroyer (it has no torpedoes).
  if (
    enemyCmd.type === "FIRE_DEPTH_CHARGE" &&
    s.range === RangeBand.SHORT &&
    s.enemy.torpedoCooldown === 0 &&
    enemyCQ >= TRACKING_THRESHOLD &&
    s.player.depth >= DepthBand.PERISCOPE
  ) {
    const accuracy = DEPTH_CHARGE_ACCURACY[s.player.depth] ?? 0;
    const hit = resolveDepthCharge(accuracy, s.player.evasion, rng);
    events.push({
      type: "shot_fired",
      payload: { by: "enemy", weapon: "depth_charge", range: s.range, playerDepth: s.player.depth },
    });
    s.enemy.torpedoCooldown = DEPTH_CHARGE_COOLDOWN_TICKS;
    s.enemy.acousticSigOverride = 1;
    s.enemyFiredTicks = 5;
    if (hit) {
      s.inFlight.push({
        firedBy: "enemy",
        damage: DEPTH_CHARGE_DAMAGE,
        arrivesOnTick: currentTick + DECK_GUN_FLIGHT_TICKS,
      });
    } else {
      events.push({ type: "shot_miss", payload: { by: "enemy", weapon: "depth_charge" } });
    }
  }

  // -------------------------------------------------------------------------
  // Step 8: Damage applied in step 1
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Step 9: Win/lose conditions
  // -------------------------------------------------------------------------
  if (s.player.hullHP <= 0) {
    s.result = "player_lose";
    events.push({ type: "combat_end", payload: { result: "player_lose", atTick: currentTick } });
  } else if (s.enemy.hullHP <= 0) {
    s.result = "player_win";
    events.push({ type: "combat_end", payload: { result: "player_win", atTick: currentTick } });
  }

  // Escape condition — gunboat_hunt and destroyer_battle
  if ((s.scenario === "gunboat_hunt" || s.scenario === "destroyer_battle") && s.result === "ongoing") {
    const enemyCQForEscape = contactQuality(s.enemy, s.player, s.range);
    if (
      s.range === RangeBand.LONG &&
      netDirection === SpeedDirection.OPEN &&
      enemyCQForEscape === 0
    ) {
      s.escapeAccumulator += 1;
    } else {
      s.escapeAccumulator = 0;
    }
    if (s.escapeAccumulator >= 20) {
      s.result = "escaped";
      events.push({ type: "combat_end", payload: { result: "escaped", atTick: currentTick } });
    }
  }

  // -------------------------------------------------------------------------
  // Step 10: Return
  // -------------------------------------------------------------------------
  return { newState: s, events };
}

/** Build the initial CombatState for the surface_battle scenario. */
export function buildSurfaceBattleState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 4,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 10,
    detectionMethods: [DetectionMethod.VISUAL, DetectionMethod.SONAR],
  };

  const enemy: ShipState = {
    hullHP: 8,
    maxHullHP: 8,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 0,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 5,
    detectionMethods: [DetectionMethod.VISUAL],
  };

  const crew: CrewMember[] = [{ id: "mate", name: "Mate", roomId: "bridge" }];
  const rooms: Room[] = [
    { id: "bridge", type: RoomType.BRIDGE, crewIds: ["mate"] },
    { id: "deck_gun", type: RoomType.DECK_GUN, crewIds: [] },
    { id: "engine", type: RoomType.ENGINE, crewIds: [] },
    { id: "torpedo", type: RoomType.TORPEDO, crewIds: [] },
  ];

  return {
    scenario: "surface_battle",
    range: RangeBand.LONG,
    player,
    enemy,
    inFlight: [],
    result: "ongoing",
    playerFiredTicks: 0,
    enemyFiredTicks: 0,
    crew,
    rooms,
    enemyLastKnownRange: RangeBand.LONG,
    enemyBlindShotsFired: 0,
    enemyTracking: false,
    escapeAccumulator: 0,
  };
}

/** Build the initial CombatState for the destroyer_dive scenario. */
export function buildDestroyerDiveState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 4,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 10,
    detectionMethods: [DetectionMethod.VISUAL, DetectionMethod.SONAR],
  };

  const enemy: ShipState = {
    hullHP: 10,
    maxHullHP: 10,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 0,
    acousticSig: 5,
    acousticSigOverride: 0,
    evasion: 8,
    detectionMethods: [DetectionMethod.VISUAL],
  };

  const crew: CrewMember[] = [
    { id: "mate", name: "Mate", roomId: "bridge" },
    { id: "engineer", name: "Engineer", roomId: "engine" },
  ];
  const rooms: Room[] = [
    { id: "bridge", type: RoomType.BRIDGE, crewIds: ["mate"] },
    { id: "deck_gun", type: RoomType.DECK_GUN, crewIds: [] },
    { id: "engine", type: RoomType.ENGINE, crewIds: ["engineer"] },
    { id: "torpedo", type: RoomType.TORPEDO, crewIds: [] },
  ];

  return {
    scenario: "destroyer_dive",
    range: RangeBand.LONG,
    player,
    enemy,
    inFlight: [],
    result: "ongoing",
    playerFiredTicks: 0,
    enemyFiredTicks: 0,
    crew,
    rooms,
    enemyLastKnownRange: RangeBand.LONG,
    enemyBlindShotsFired: 0,
    enemyTracking: false,
    escapeAccumulator: 0,
  };
}

/** Build the initial CombatState for the gunboat_hunt scenario. */
export function buildGunboatHuntState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 4,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 10,
    detectionMethods: [DetectionMethod.VISUAL],
  };

  const enemy: ShipState = {
    hullHP: 15,
    maxHullHP: 15,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 0,
    acousticSig: 6,
    acousticSigOverride: 0,
    evasion: 5,
    detectionMethods: [DetectionMethod.VISUAL],
    speedOverride: 4,
  };

  const crew: CrewMember[] = [
    { id: "mate", name: "Mate", roomId: "bridge" },
    { id: "engineer", name: "Engineer", roomId: "torpedo" },
  ];
  const rooms: Room[] = [
    { id: "bridge", type: RoomType.BRIDGE, crewIds: ["mate"] },
    { id: "deck_gun", type: RoomType.DECK_GUN, crewIds: [] },
    { id: "engine", type: RoomType.ENGINE, crewIds: [] },
    { id: "torpedo", type: RoomType.TORPEDO, crewIds: ["engineer"] },
  ];

  return {
    scenario: "gunboat_hunt",
    range: RangeBand.LONG,
    player,
    enemy,
    inFlight: [],
    result: "ongoing",
    playerFiredTicks: 0,
    enemyFiredTicks: 0,
    crew,
    rooms,
    enemyLastKnownRange: RangeBand.LONG,
    enemyBlindShotsFired: 0,
    enemyTracking: false,
    escapeAccumulator: 0,
  };
}

/** Build the initial CombatState for the destroyer_battle scenario. */
export function buildDestroyerBattleState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 4,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 10,
    detectionMethods: [DetectionMethod.VISUAL, DetectionMethod.SONAR],
  };

  const enemy: ShipState = {
    hullHP: 10,
    maxHullHP: 10,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    depthTransitionTicks: 0,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
    rangeTicksAccumulator: 0,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 0,
    acousticSig: 5,
    acousticSigOverride: 0,
    evasion: 8,
    detectionMethods: [DetectionMethod.VISUAL, DetectionMethod.SONAR],
    speedOverride: 4,
  };

  const crew: CrewMember[] = [
    { id: "mate", name: "Mate", roomId: "bridge" },
    { id: "engineer", name: "Engineer", roomId: "torpedo" },
  ];
  const rooms: Room[] = [
    { id: "bridge", type: RoomType.BRIDGE, crewIds: ["mate"] },
    { id: "deck_gun", type: RoomType.DECK_GUN, crewIds: [] },
    { id: "engine", type: RoomType.ENGINE, crewIds: [] },
    { id: "torpedo", type: RoomType.TORPEDO, crewIds: ["engineer"] },
  ];

  return {
    scenario: "destroyer_battle",
    range: RangeBand.LONG,
    player,
    enemy,
    inFlight: [],
    result: "ongoing",
    playerFiredTicks: 0,
    enemyFiredTicks: 0,
    crew,
    rooms,
    enemyLastKnownRange: RangeBand.LONG,
    enemyBlindShotsFired: 0,
    enemyTracking: false,
    escapeAccumulator: 0,
  };
}
