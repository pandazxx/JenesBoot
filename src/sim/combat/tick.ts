import { DepthBand, VisibilityLevel } from "./enums.js";
import {
  euclideanDistance,
  toRangeBand,
  toDepthBand,
  depthOffsetBand,
  BAND_SIZE,
} from "./geometry.js";
import type { CombatState, CombatEvent, PlayerCommand } from "./types.js";
import type { CombatConfig } from "./config.js";
import { computeVisibility } from "./detection.js";
import { resolveWeaponFire } from "./weapons.js";
import { tickEnemyAi } from "./ai.js";
import { cloneState } from "./state.js";
import type { Mulberry32 } from "../prng.js";

export function tickCombat(
  state: CombatState,
  currentTick: number,
  rng: Mulberry32,
  playerCmd: PlayerCommand | null | undefined,
  config: CombatConfig,
): { newState: CombatState; events: CombatEvent[] } {
  // Step 1: bail early if combat is over
  if (state.result !== "ongoing") {
    return { newState: cloneState(state), events: [] };
  }

  // Step 2: clone state, initialize events
  const s = cloneState(state);
  const events: CombatEvent[] = [];

  // Step 3: tick down all weapon cooldowns
  for (const key of Object.keys(s.player.weaponCooldowns)) {
    const cd = s.player.weaponCooldowns[key] ?? 0;
    if (cd > 0) s.player.weaponCooldowns[key] = cd - 1;
  }
  for (const key of Object.keys(s.enemy.weaponCooldowns)) {
    const cd = s.enemy.weaponCooldowns[key] ?? 0;
    if (cd > 0) s.enemy.weaponCooldowns[key] = cd - 1;
  }

  // Step 4: resolve arriving projectiles
  const stillInFlight = s.inFlight.filter((proj) => {
    if (proj.arrivesOnTick === currentTick) {
      const target = proj.firedBy === "player" ? s.enemy : s.player;
      target.hullHP = Math.max(0, target.hullHP - proj.damage);
      events.push({
        type: "weapon_hit",
        payload: {
          firedBy: proj.firedBy,
          weaponId: proj.weaponId,
          damage: proj.damage,
          targetHP: target.hullHP,
        },
      });
      return false;
    }
    return true;
  });
  s.inFlight = stillInFlight;

  // Step 5: compute geometry and update depth bands
  const dx = s.enemy.x - s.player.x;
  const dy = s.enemy.y - s.player.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const dist = euclideanDistance(absDx, absDy);
  const rangeBand = toRangeBand(dist);
  const depthOffset = depthOffsetBand(absDy);

  s.player.depth = toDepthBand(s.player.y);
  s.enemy.depth = toDepthBand(s.enemy.y);

  if (rangeBand !== s.prevRangeBand) {
    events.push({ type: "range_change", payload: { from: s.prevRangeBand, to: rangeBand } });
    s.prevRangeBand = rangeBand;
  }
  if (s.player.depth !== s.prevPlayerDepth) {
    events.push({ type: "depth_change", payload: { who: "player", depth: s.player.depth } });
    s.prevPlayerDepth = s.player.depth;
  }
  if (s.enemy.depth !== s.prevEnemyDepth) {
    events.push({ type: "depth_change", payload: { who: "enemy", depth: s.enemy.depth } });
    s.prevEnemyDepth = s.enemy.depth;
  }

  // Step 6: compute visibility
  const playerVis = computeVisibility(s.player, s.enemy, dist, config);
  const enemyVis = computeVisibility(s.enemy, s.player, dist, config);

  s.enemyAi.currentVisibility = enemyVis;
  if (enemyVis > VisibilityLevel.NONE) {
    s.enemyAi.lastKnownX = s.player.x;
    s.enemyAi.lastKnownY = s.player.y;
    s.enemyAi.holdingAtLastKnown = false;
  }

  if (enemyVis !== s.prevEnemyVisibility) {
    events.push({ type: "visibility_change", payload: { who: "enemy", visibility: enemyVis } });
    s.prevEnemyVisibility = enemyVis;
  }

  // Step 7: apply player command
  let playerFireWeaponId: string | null = null;
  if (playerCmd != null) {
    if (playerCmd.type === "SET_NAUTICAL_SPEED") {
      s.player.nauticalSpeed = playerCmd.speed;
      s.player.horizontalIntent = playerCmd.intent;
    } else if (playerCmd.type === "SET_DEPTH") {
      s.player.depthTarget = playerCmd.target;
      s.player.diveSpeed = playerCmd.diveSpeed;
    } else if (playerCmd.type === "FIRE_WEAPON") {
      playerFireWeaponId = playerCmd.weaponId;
    }
  }

  // Step 8: enemy AI
  const aiCommands = tickEnemyAi(
    s.enemy,
    s.enemyAi,
    s.player,
    enemyVis,
    rangeBand,
    depthOffset,
    config,
  );
  const enemyFireWeaponIds: string[] = [];

  for (const cmd of aiCommands) {
    if (cmd.type === "SET_SPEED") {
      s.enemy.nauticalSpeed = cmd.speed;
      s.enemy.horizontalIntent = cmd.intent;
    } else if (cmd.type === "SET_DEPTH") {
      s.enemy.depthTarget = cmd.target;
      s.enemy.diveSpeed = cmd.diveSpeed;
    } else if (cmd.type === "FIRE_WEAPON") {
      enemyFireWeaponIds.push(cmd.weaponId);
    } else if (cmd.type === "HOLD") {
      s.enemy.horizontalIntent = 0;
    }
  }

  // Check if enemy is at last known position
  if (enemyVis === VisibilityLevel.NONE) {
    const gapToLast = Math.abs(s.enemy.x - s.enemyAi.lastKnownX);
    if (gapToLast < BAND_SIZE) {
      s.enemyAi.holdingAtLastKnown = true;
    }
  } else {
    s.enemyAi.holdingAtLastKnown = false;
  }

  // Step 9: move vessels
  const playerCfg = config.player;
  const enemyCfg = config.vessels[s.enemyType] ?? config.player;

  const playerHSpeed =
    playerCfg.speedConfig.horizontalTable[s.player.nauticalSpeed]?.[s.player.depth] ?? 0;
  s.player.x += playerHSpeed * s.player.horizontalIntent;

  const playerVSpeed = playerCfg.speedConfig.verticalTable[s.player.diveSpeed] ?? 0;
  const playerYTarget = s.player.depthTarget * BAND_SIZE;
  if (s.player.y !== playerYTarget) {
    const ydiff = playerYTarget - s.player.y;
    s.player.y =
      Math.abs(ydiff) <= playerVSpeed
        ? playerYTarget
        : s.player.y + Math.sign(ydiff) * playerVSpeed;
  }

  const enemyHSpeed =
    enemyCfg.speedConfig.horizontalTable[s.enemy.nauticalSpeed]?.[s.enemy.depth] ?? 0;
  s.enemy.x += enemyHSpeed * s.enemy.horizontalIntent;

  const enemyVSpeed = enemyCfg.speedConfig.verticalTable[s.enemy.diveSpeed] ?? 0;
  const enemyYTarget = s.enemy.depthTarget * BAND_SIZE;
  if (s.enemy.y !== enemyYTarget) {
    const ydiff = enemyYTarget - s.enemy.y;
    s.enemy.y =
      Math.abs(ydiff) <= enemyVSpeed ? enemyYTarget : s.enemy.y + Math.sign(ydiff) * enemyVSpeed;
  }

  // Step 10: resolve weapon fire
  if (playerFireWeaponId !== null) {
    const weaponId = playerFireWeaponId;
    const cooldown = s.player.weaponCooldowns[weaponId] ?? 0;
    const weaponCfg = playerCfg.weapons.find((w) => w.id === weaponId);
    const ammoOk =
      weaponCfg?.maxAmmo !== undefined ? (s.player.weaponAmmo[weaponId] ?? 0) > 0 : true;

    if (cooldown === 0 && weaponCfg !== undefined && ammoOk) {
      const result = resolveWeaponFire(
        weaponId,
        playerVis,
        rangeBand,
        depthOffset,
        rng,
        config,
        s.player.vesselType,
      );
      if (result.fired) {
        events.push({
          type: "weapon_fired",
          payload: { firedBy: "player", weaponId, rangeBand, depthOffset },
        });
        s.player.weaponCooldowns[weaponId] = weaponCfg.cooldownTicks;
        if (weaponCfg.maxAmmo !== undefined) {
          s.player.weaponAmmo[weaponId] = Math.max(0, (s.player.weaponAmmo[weaponId] ?? 0) - 1);
        }
        if (result.hit) {
          s.inFlight.push({
            firedBy: "player",
            weaponId,
            damage: result.damage,
            arrivesOnTick: currentTick + weaponCfg.flightTicks,
          });
        } else {
          events.push({ type: "weapon_miss", payload: { firedBy: "player", weaponId } });
        }
      }
    }
  }

  for (const weaponId of enemyFireWeaponIds) {
    const cooldown = s.enemy.weaponCooldowns[weaponId] ?? 0;
    const weaponCfg = enemyCfg.weapons.find((w) => w.id === weaponId);
    const ammoOk =
      weaponCfg?.maxAmmo !== undefined ? (s.enemy.weaponAmmo[weaponId] ?? 0) > 0 : true;

    if (cooldown === 0 && weaponCfg !== undefined && ammoOk) {
      const result = resolveWeaponFire(
        weaponId,
        enemyVis,
        rangeBand,
        depthOffset,
        rng,
        config,
        s.enemy.vesselType,
      );
      if (result.fired) {
        events.push({
          type: "weapon_fired",
          payload: { firedBy: "enemy", weaponId, rangeBand, depthOffset },
        });
        s.enemy.weaponCooldowns[weaponId] = weaponCfg.cooldownTicks;
        if (weaponCfg.maxAmmo !== undefined) {
          s.enemy.weaponAmmo[weaponId] = Math.max(0, (s.enemy.weaponAmmo[weaponId] ?? 0) - 1);
        }
        if (result.hit) {
          s.inFlight.push({
            firedBy: "enemy",
            weaponId,
            damage: result.damage,
            arrivesOnTick: currentTick + weaponCfg.flightTicks,
          });
        } else {
          events.push({ type: "weapon_miss", payload: { firedBy: "enemy", weaponId } });
        }
      }
    }
  }

  // Step 11: win/lose/escape
  if (s.player.hullHP <= 0) {
    s.result = "player_lose";
    events.push({ type: "combat_end", payload: { result: "player_lose", atTick: currentTick } });
  } else if (s.enemy.hullHP <= 0) {
    s.result = "player_win";
    events.push({ type: "combat_end", payload: { result: "player_win", atTick: currentTick } });
  }

  if (s.result === "ongoing") {
    if (enemyVis === VisibilityLevel.NONE && s.player.depth >= DepthBand.DEEP) {
      s.escapeAccumulator += 1;
    } else {
      s.escapeAccumulator = 0;
    }
    if (s.escapeAccumulator >= config.escapeTicks) {
      s.result = "escaped";
      events.push({ type: "combat_end", payload: { result: "escaped", atTick: currentTick } });
    }
  }

  // Step 12: position report
  if (currentTick % config.positionReportInterval === 0) {
    events.push({
      type: "position_report",
      payload: {
        playerX: Math.round(s.player.x),
        playerY: Math.round(s.player.y),
        enemyX: Math.round(s.enemy.x),
        enemyY: Math.round(s.enemy.y),
        rangeBand,
      },
    });
  }

  s.prevRangeBand = rangeBand;
  s.prevPlayerDepth = s.player.depth;
  s.prevEnemyDepth = s.enemy.depth;
  s.prevEnemyVisibility = enemyVis;

  return { newState: s, events };
}
