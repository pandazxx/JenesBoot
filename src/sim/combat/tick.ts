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
import { merchantAi, destroyerAi, destroyerBattleAi, gunboatAi, submarineAi } from "./ai.js";

/** One band = 150 axis units, both x (range) and y (depth). */
const BAND_SIZE = 150;

/** Horizontal speed in x-units per tick. Preserves original ticks-per-band timing. */
const X_SPEED: Record<SpeedSetting, number> = {
  [SpeedSetting.SILENT]: 6, // 150/6  = 25 ticks/band
  [SpeedSetting.STANDARD]: 10, // 150/10 = 15 ticks/band
  [SpeedSetting.AHEAD_FULL]: 15, // 150/15 = 10 ticks/band
};

/** Depth speed: y-units per tick toward depthTarget. 150/25 = 6 ticks/band. */
const Y_SPEED = 25;

const DECK_GUN_FLIGHT_TICKS = 1;
const TRACKING_THRESHOLD = 4;

const O2_DEPTH_DRAIN: [number, number, number, number, number] = [0, 1, 2, 3, 4];
const O2_SPEED_DRAIN: [number, number, number] = [0, 1, 2];
const O2_SURFACE_REGEN = 2;
const O2_GRACE_TICKS = 20;

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

function xGapToRangeBand(gap: number): RangeBand {
  return Math.min(RangeBand.LONG, Math.floor(gap / BAND_SIZE)) as RangeBand;
}

function yToDepthBand(y: number): DepthBand {
  return Math.min(DepthBand.ABYSSAL, Math.floor(y / BAND_SIZE)) as DepthBand;
}

function deckGunInRange(range: RangeBand): boolean {
  return range < RangeBand.LONG;
}

function torpedoInRange(range: RangeBand): boolean {
  return range <= RangeBand.MEDIUM;
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
      if (proj.firedBy === "player") s.enemyRecentlyHitTicks = 20;
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
  if (s.enemyRecentlyHitTicks > 0) s.enemyRecentlyHitTicks -= 1;
  if (s.playerFiredTicks > 0) {
    s.playerFiredTicks -= 1;
    if (s.playerFiredTicks === 0) s.player.acousticSigOverride = 0;
  }
  if (s.enemyFiredTicks > 0) {
    s.enemyFiredTicks -= 1;
    if (s.enemyFiredTicks === 0) s.enemy.acousticSigOverride = 0;
  }

  // O2 drain / regen — player sub only
  if (s.player.maxOxygen > 0) {
    const oxygenBefore = s.player.oxygen;
    if (s.player.depth === DepthBand.SURFACE) {
      s.player.oxygen = Math.min(s.player.maxOxygen, s.player.oxygen + O2_SURFACE_REGEN);
    } else {
      const drain = (O2_DEPTH_DRAIN[s.player.depth] ?? 0) + (O2_SPEED_DRAIN[s.player.speed] ?? 0);
      s.player.oxygen = Math.max(0, s.player.oxygen - drain);
    }
    const halfMax = s.player.maxOxygen * 0.5;
    const quarterMax = s.player.maxOxygen * 0.25;
    if (oxygenBefore > halfMax && s.player.oxygen <= halfMax) {
      events.push({
        type: "oxygen_low",
        payload: { oxygen: s.player.oxygen, maxOxygen: s.player.maxOxygen },
      });
    }
    if (oxygenBefore > quarterMax && s.player.oxygen <= quarterMax) {
      events.push({
        type: "oxygen_critical",
        payload: { oxygen: s.player.oxygen, maxOxygen: s.player.maxOxygen },
      });
    }
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
  } else if (s.scenario === "submerged_ambush") {
    enemyCmd = submarineAi(s.enemy, s.range, s.player.depth, enemyCQ, s.enemyRecentlyHitTicks);
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
    // Blind shots fired from a stationary search pattern — stop closing.
    s.enemy.direction = SpeedDirection.HOLD;
  } else if (enemyCmd.type === "FIRE_DEPTH_CHARGE") {
    // Destroyer holds position while dropping charges.
    s.enemy.direction = SpeedDirection.HOLD;
  } else if (enemyCmd.type === "MATCH_AND_CLOSE") {
    s.enemy.speed = SpeedSetting.STANDARD;
    s.enemy.direction = SpeedDirection.CLOSE;
    s.enemy.depthTarget = enemyCmd.depthTarget;
  } else if (enemyCmd.type === "EVADE_SILENT") {
    s.enemy.speed = SpeedSetting.SILENT;
    s.enemy.direction = SpeedDirection.HOLD;
    s.enemy.depthTarget = enemyCmd.depthTarget;
  }

  // -------------------------------------------------------------------------
  // Step 5+6: Move ships on (x, y) axes; derive range and depth bands
  // -------------------------------------------------------------------------
  const xGapBefore = Math.abs(s.player.x - s.enemy.x);

  // x — horizontal movement (player CLOSE increases x, enemy CLOSE decreases x)
  s.player.x += (s.player.speedOverride ?? X_SPEED[s.player.speed] ?? 10) * s.player.direction;
  s.enemy.x -= (s.enemy.speedOverride ?? X_SPEED[s.enemy.speed] ?? 10) * s.enemy.direction;
  // Ships cannot pass through each other — clamp so player always stays left of enemy.
  if (s.player.x > s.enemy.x) {
    const mid = (s.player.x + s.enemy.x) / 2;
    s.player.x = mid;
    s.enemy.x = mid;
  }

  // y — depth movement toward depthTarget (band value × BAND_SIZE)
  const playerYTarget = s.player.depthTarget * BAND_SIZE;
  if (s.player.y !== playerYTarget) {
    const dy = playerYTarget - s.player.y;
    s.player.y = Math.abs(dy) <= Y_SPEED ? playerYTarget : s.player.y + Math.sign(dy) * Y_SPEED;
  }
  const enemyYTarget = s.enemy.depthTarget * BAND_SIZE;
  if (s.enemy.y !== enemyYTarget) {
    const dy = enemyYTarget - s.enemy.y;
    s.enemy.y = Math.abs(dy) <= Y_SPEED ? enemyYTarget : s.enemy.y + Math.sign(dy) * Y_SPEED;
  }

  // Derive range band from absolute x gap; emit event on change
  const xGap = Math.abs(s.player.x - s.enemy.x);
  const gapOpening = xGap > xGapBefore;
  const prevRange = s.range;
  s.range = xGapToRangeBand(xGap);
  if (s.range !== prevRange) {
    events.push({ type: "range_change", payload: { from: prevRange, to: s.range } });
  }

  // Derive depth bands from y; emit events on change
  const playerDepthDerived = yToDepthBand(s.player.y);
  if (playerDepthDerived !== s.player.depth) {
    s.player.depth = playerDepthDerived;
    events.push({ type: "depth_change", payload: { who: "player", depth: s.player.depth } });
  }
  const enemyDepthDerived = yToDepthBand(s.enemy.y);
  if (enemyDepthDerived !== s.enemy.depth) {
    s.enemy.depth = enemyDepthDerived;
    events.push({ type: "depth_change", payload: { who: "enemy", depth: s.enemy.depth } });
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

  // Enemy torpedo — submerged_ambush hostile fires when it has a firing solution.
  if (
    enemyCmd.type === "FIRE_TORPEDO" &&
    torpedoInRange(s.range) &&
    s.enemy.torpedoCooldown === 0 &&
    s.enemy.torpedoCount > 0 &&
    enemyCQ >= TRACKING_THRESHOLD
  ) {
    const accuracy = TORPEDO_ACCURACY[s.range] ?? 0;
    const hit = resolveTorpedo(accuracy, s.player.evasion, rng);
    events.push({
      type: "shot_fired",
      payload: { by: "enemy", weapon: "torpedo", range: s.range },
    });
    s.enemy.torpedoCooldown = TORPEDO_COOLDOWN_TICKS;
    s.enemy.torpedoCount -= 1;
    s.enemy.acousticSigOverride = 1;
    s.enemyFiredTicks = 5;
    if (hit) {
      s.inFlight.push({
        firedBy: "enemy",
        damage: TORPEDO_DAMAGE,
        arrivesOnTick: currentTick + TORPEDO_FLIGHT_TICKS,
      });
    } else {
      events.push({ type: "shot_miss", payload: { by: "enemy", weapon: "torpedo" } });
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

  // O2 suffocation lose condition
  if (s.result === "ongoing") {
    if (s.player.oxygen <= 0 && s.player.depth > DepthBand.SURFACE) {
      s.oxygenDepletedTicks += 1;
      if (s.oxygenDepletedTicks === 1) {
        events.push({ type: "oxygen_depleted", payload: { graceTicks: O2_GRACE_TICKS } });
      }
      if (s.oxygenDepletedTicks >= O2_GRACE_TICKS) {
        s.result = "player_lose";
        events.push({
          type: "combat_end",
          payload: { result: "player_lose", reason: "suffocation", atTick: currentTick },
        });
      }
    } else {
      s.oxygenDepletedTicks = 0;
    }
  }

  // Escape condition — destroyer_dive: hold DEEP or ABYSSAL with enemy CQ=0 for 40 ticks
  if (s.scenario === "destroyer_dive" && s.result === "ongoing") {
    const enemyCQForEscape = contactQuality(s.enemy, s.player, s.range);
    if (s.player.depth >= DepthBand.DEEP && enemyCQForEscape === 0) {
      s.escapeAccumulator += 1;
    } else {
      s.escapeAccumulator = 0;
    }
    if (s.escapeAccumulator >= 40) {
      s.result = "escaped";
      events.push({ type: "combat_end", payload: { result: "escaped", atTick: currentTick } });
    }
  }

  // Escape condition — submerged_ambush: SILENT for 30 ticks while range ≥ MEDIUM
  if (s.scenario === "submerged_ambush" && s.result === "ongoing") {
    if (s.player.speed === SpeedSetting.SILENT && s.range >= RangeBand.MEDIUM) {
      s.escapeAccumulator += 1;
    } else {
      s.escapeAccumulator = 0;
    }
    if (s.escapeAccumulator >= 30) {
      s.result = "escaped";
      events.push({ type: "combat_end", payload: { result: "escaped", atTick: currentTick } });
    }
  }

  // Escape condition — gunboat_hunt and destroyer_battle
  if (
    (s.scenario === "gunboat_hunt" || s.scenario === "destroyer_battle") &&
    s.result === "ongoing"
  ) {
    const enemyCQForEscape = contactQuality(s.enemy, s.player, s.range);
    if (s.range === RangeBand.LONG && gapOpening && enemyCQForEscape === 0) {
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
    oxygen: 1800,
    maxOxygen: 1800,
    x: 0,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
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
    oxygen: 0,
    maxOxygen: 0,
    x: 750,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
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
    enemyRecentlyHitTicks: 0,
    oxygenDepletedTicks: 0,
  };
}

/** Build the initial CombatState for the destroyer_dive scenario. */
export function buildDestroyerDiveState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    oxygen: 1800,
    maxOxygen: 1800,
    x: 0,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
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
    oxygen: 0,
    maxOxygen: 0,
    x: 750,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
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
    enemyRecentlyHitTicks: 0,
    oxygenDepletedTicks: 0,
  };
}

/** Build the initial CombatState for the gunboat_hunt scenario. */
export function buildGunboatHuntState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    oxygen: 1800,
    maxOxygen: 1800,
    x: 0,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
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
    oxygen: 0,
    maxOxygen: 0,
    x: 750,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 0,
    acousticSig: 6,
    acousticSigOverride: 0,
    evasion: 5,
    detectionMethods: [DetectionMethod.VISUAL],
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
    enemyRecentlyHitTicks: 0,
    oxygenDepletedTicks: 0,
  };
}

/** Build the initial CombatState for the destroyer_battle scenario. */
export function buildDestroyerBattleState(): CombatState {
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    oxygen: 1800,
    maxOxygen: 1800,
    x: 0,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.HOLD,
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
    oxygen: 0,
    maxOxygen: 0,
    x: 750,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    speed: SpeedSetting.AHEAD_FULL,
    direction: SpeedDirection.CLOSE,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 0,
    acousticSig: 5,
    acousticSigOverride: 0,
    evasion: 8,
    detectionMethods: [DetectionMethod.VISUAL, DetectionMethod.SONAR],
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
    enemyRecentlyHitTicks: 0,
    oxygenDepletedTicks: 0,
  };
}

/** Build the initial CombatState for the submerged_ambush scenario. */
export function buildSubmergedAmbushState(): CombatState {
  // Player waits at PERISCOPE SILENT; enemy approaches at STANDARD same depth.
  // At LONG, 0-depth-diff: player CQ on enemy ≈4 (tracking), enemy CQ on player ≈1 (SILENT).
  const player: ShipState = {
    hullHP: 20,
    maxHullHP: 20,
    oxygen: 1800,
    maxOxygen: 1800,
    x: 0,
    y: 150,
    depth: DepthBand.PERISCOPE,
    depthTarget: DepthBand.PERISCOPE,
    speed: SpeedSetting.SILENT,
    direction: SpeedDirection.HOLD,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 4,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 10,
    detectionMethods: [DetectionMethod.SONAR],
  };

  const enemy: ShipState = {
    hullHP: 10,
    maxHullHP: 10,
    oxygen: 0,
    maxOxygen: 0,
    x: 750,
    y: 150,
    depth: DepthBand.PERISCOPE,
    depthTarget: DepthBand.PERISCOPE,
    speed: SpeedSetting.STANDARD,
    direction: SpeedDirection.CLOSE,
    deckGunCooldown: 0,
    torpedoCooldown: 0,
    torpedoCount: 4,
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 8,
    detectionMethods: [DetectionMethod.SONAR],
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
    scenario: "submerged_ambush",
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
    enemyRecentlyHitTicks: 0,
    oxygenDepletedTicks: 0,
  };
}
