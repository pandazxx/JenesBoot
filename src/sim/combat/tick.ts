/**
 * Combat tick — advances CombatState by one simulation tick.
 *
 * 10-step sequence per §8 of the battle-loop design doc.
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import { RangeBand, RoomType, SpeedSetting, SpeedDirection, DepthBand } from "./types.js";
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
  DECK_GUN_ACCURACY,
  DECK_GUN_DAMAGE,
  DECK_GUN_COOLDOWN_TICKS,
} from "./weapons.js";
import { merchantAi, MERCHANT_RANGE_TICKS_PER_BAND } from "./ai.js";

/**
 * How many ticks it takes to close/open one range band for each speed setting.
 * Player uses these values; enemy merchant uses MERCHANT_RANGE_TICKS_PER_BAND.
 */
const PLAYER_RANGE_TICKS: Record<SpeedSetting, number> = {
  [SpeedSetting.SILENT]: 25,
  [SpeedSetting.STANDARD]: 15,
  [SpeedSetting.AHEAD_FULL]: 10,
};

/**
 * Ticks for a projectile to fly from one ship to the other.
 * Flat value — we resolve on the following tick.
 */
const PROJECTILE_FLIGHT_TICKS = 1;

/**
 * Minimum contact quality required to fire weapons.
 */
const TRACKING_THRESHOLD = 4;

/** Scripted player command for the surface-battle scenario. */
export type PlayerCommand =
  | { type: "SET_SPEED"; speed: SpeedSetting; direction: SpeedDirection }
  | { type: "FIRE_DECK_GUN" }
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

/**
 * Compute effective range ticks needed for a ship to traverse one band.
 * Uses the ship's current speed setting. enemyMerchant flag switches to
 * the slower merchant rate.
 */
function rangeTicksNeeded(ship: ShipState, isEnemy: boolean): number {
  if (isEnemy) return MERCHANT_RANGE_TICKS_PER_BAND;
  return PLAYER_RANGE_TICKS[ship.speed] ?? 15;
}

/**
 * Advance the range band by one step in the given direction.
 * Returns the new range clamped to [RAMMING, LONG].
 */
function shiftRange(current: RangeBand, direction: SpeedDirection): RangeBand {
  // direction: CLOSE (+1) reduces range numerically; OPEN (-1) increases it
  const next = current - direction;
  return Math.max(RangeBand.RAMMING, Math.min(RangeBand.LONG, next)) as RangeBand;
}

/**
 * Determine whether a ship can fire its deck gun at the current range.
 * LONG range is out of range for surface deck guns.
 */
function deckGunInRange(range: RangeBand): boolean {
  return range < RangeBand.LONG;
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
        payload: {
          by: proj.firedBy,
          damage: proj.damage,
          targetHP: target.hullHP,
        },
      });
    } else {
      stillInFlight.push(proj);
    }
  }
  s.inFlight = stillInFlight;

  // -------------------------------------------------------------------------
  // Step 2: Apply resource costs — cooldowns tick down
  // -------------------------------------------------------------------------
  if (s.player.deckGunCooldown > 0) s.player.deckGunCooldown -= 1;
  if (s.enemy.deckGunCooldown > 0) s.enemy.deckGunCooldown -= 1;
  if (s.playerFiredTicks > 0) {
    s.playerFiredTicks -= 1;
    if (s.playerFiredTicks === 0) s.player.acousticSigOverride = 0;
  }
  if (s.enemyFiredTicks > 0) {
    s.enemyFiredTicks -= 1;
    if (s.enemyFiredTicks === 0) s.enemy.acousticSigOverride = 0;
  }

  // -------------------------------------------------------------------------
  // Step 3: Process player command
  // Speed/direction is already sticky — SET_SPEED is applied immediately in
  // SimEngine.queueCommand() and persists in s.player across ticks. Nothing
  // to do here for movement. Only fire commands arrive as playerCmd.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Step 4: Process enemy AI
  // -------------------------------------------------------------------------
  const enemyCmd = merchantAi(s.enemy, s.range, s.enemy.maxHullHP);
  if (enemyCmd.type === "SET_SPEED") {
    applyCommand(s.enemy, enemyCmd);
  }

  // -------------------------------------------------------------------------
  // Step 5: Advance range based on net direction of both ships
  // -------------------------------------------------------------------------
  // Net direction: player's direction dominates (they are the active party).
  // Enemy OPEN cancels player CLOSE partially — simplest: sum directions,
  // clamp to [-1, 1]. When enemy flees (OPEN), it opposes player CLOSE.
  const netDirectionRaw = s.player.direction + s.enemy.direction;
  // Clamp net direction to -1, 0, +1
  const netDirection: SpeedDirection =
    netDirectionRaw > 0
      ? SpeedDirection.CLOSE
      : netDirectionRaw < 0
        ? SpeedDirection.OPEN
        : SpeedDirection.HOLD;

  if (netDirection !== SpeedDirection.HOLD) {
    // Accumulate ticks for the faster of the two ships (AHEAD_FULL player drives)
    s.player.rangeTicksAccumulator += 1;
    const needed = rangeTicksNeeded(s.player, false);
    if (s.player.rangeTicksAccumulator >= needed) {
      s.player.rangeTicksAccumulator -= needed;
      const prevRange = s.range;
      s.range = shiftRange(s.range, netDirection);
      if (s.range !== prevRange) {
        events.push({
          type: "range_change",
          payload: { from: prevRange, to: s.range },
        });
      }
    }
  } else {
    s.player.rangeTicksAccumulator = 0;
  }

  // -------------------------------------------------------------------------
  // Step 6: Advance depth transitions (no-op for surface battle)
  // -------------------------------------------------------------------------
  // Both ships remain at SURFACE — nothing to do here for this scenario.
  // Depth transition logic placeholder for future submerged scenarios.
  if (s.player.depthTransitionTicks > 0) s.player.depthTransitionTicks -= 1;
  if (s.enemy.depthTransitionTicks > 0) s.enemy.depthTransitionTicks -= 1;

  // -------------------------------------------------------------------------
  // Step 7: Fire weapons — player then enemy
  // -------------------------------------------------------------------------

  // Player fires — triggered by explicit fire command or auto-fire when in
  // range and cooldown is ready. Auto-fire is the fallback so the game
  // remains functional even without manual input.
  // Crew in DECK_GUN room is required to fire.
  const deckGunCrewed = s.rooms.some((r) => r.type === RoomType.DECK_GUN && r.crewIds.length > 0);
  const playerWantsToFire =
    playerCmd?.type === "FIRE_DECK_GUN" ||
    (s.player.deckGunCooldown === 0 && deckGunInRange(s.range));
  if (
    deckGunCrewed &&
    playerWantsToFire &&
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
        arrivesOnTick: currentTick + PROJECTILE_FLIGHT_TICKS,
      });
    } else {
      events.push({ type: "shot_miss", payload: { by: "player" } });
    }
  }

  // Enemy fires
  if (
    enemyCmd.type === "FIRE_DECK_GUN" &&
    deckGunInRange(s.range) &&
    s.enemy.deckGunCooldown === 0 &&
    contactQuality(s.enemy, s.player, s.range) >= TRACKING_THRESHOLD
  ) {
    const accuracy = DECK_GUN_ACCURACY[s.range] ?? 0;
    const hit = resolveDeckGun(accuracy, s.player.evasion, rng);
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
        damage: DECK_GUN_DAMAGE,
        arrivesOnTick: currentTick + PROJECTILE_FLIGHT_TICKS,
      });
    } else {
      events.push({ type: "shot_miss", payload: { by: "enemy" } });
    }
  }

  // -------------------------------------------------------------------------
  // Step 8: Apply damage — already applied in step 1 when projectiles landed
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Step 9: Check win/lose conditions
  // -------------------------------------------------------------------------
  if (s.player.hullHP <= 0) {
    s.result = "player_lose";
    events.push({
      type: "combat_end",
      payload: { result: "player_lose", atTick: currentTick },
    });
  } else if (s.enemy.hullHP <= 0) {
    s.result = "player_win";
    events.push({
      type: "combat_end",
      payload: { result: "player_win", atTick: currentTick },
    });
  }

  // -------------------------------------------------------------------------
  // Step 10: Return
  // -------------------------------------------------------------------------
  return { newState: s, events };
}

/**
 * Build the initial CombatState for the surface_battle scenario.
 */
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
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 10,
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
    acousticSig: 4,
    acousticSigOverride: 0,
    evasion: 5,
  };

  const crew: CrewMember[] = [{ id: "mate", name: "Mate", roomId: "bridge" }];
  const rooms: Room[] = [
    { id: "bridge", type: RoomType.BRIDGE, crewIds: ["mate"] },
    { id: "deck_gun", type: RoomType.DECK_GUN, crewIds: [] },
  ];

  return {
    range: RangeBand.LONG,
    player,
    enemy,
    inFlight: [],
    result: "ongoing",
    playerFiredTicks: 0,
    enemyFiredTicks: 0,
    crew,
    rooms,
  };
}
