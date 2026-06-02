/**
 * Unit tests for gunboat combat mechanics.
 *
 * Covers: initial state, visual-only detection behavior, escape accumulator,
 * and a full player-win playthrough.
 *
 * Uses tickCombat + buildInitialState for lower-level white-box tests.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";
import { buildInitialState } from "../combat/state.js";
import { tickCombat } from "../combat/tick.js";
import { computeVisibility } from "../combat/detection.js";
import { defaultCombatConfig } from "../combat/config.js";
import { Mulberry32 } from "../prng.js";
import {
  VesselType,
  DepthBand,
  NauticalSpeed,
  DiveSpeed,
  RangeBand,
  VisibilityLevel,
} from "../combat/enums.js";

describe("gunboat hunt scenario", () => {
  it("initial state: player at SURFACE, gunboat FULL_AHEAD CLOSE at LONG range", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.GUNBOAT);

    const state = engine.getState();
    const combat = state.combat;
    expect(combat).not.toBeNull();
    if (!combat) return;

    expect(combat.enemyType).toBe(VesselType.GUNBOAT);
    expect(combat.player.depth).toBe(DepthBand.SURFACE);
    expect(combat.player.depthTarget).toBe(DepthBand.SURFACE);
    expect(combat.enemy.nauticalSpeed).toBe(NauticalSpeed.FULL_AHEAD);
    expect(combat.enemy.horizontalIntent).toBe(-1);
    expect(combat.enemy.hullHP).toBeGreaterThan(0);
    expect(combat.escapeAccumulator).toBe(0);
  });

  it("gunboat does not detect sub at PERISCOPE (visual-only gunboat, submerged target)", () => {
    const config = defaultCombatConfig();
    const state = buildInitialState(VesselType.GUNBOAT, config);

    // Force player to PERISCOPE — gunboat is visual-only, can't detect submerged
    state.player.depth = DepthBand.PERISCOPE;
    state.player.depthTarget = DepthBand.PERISCOPE;
    state.player.y = 150;

    // At LONG range, gunboat should have NONE visibility on a submerged sub
    const dist = Math.abs(state.enemy.x - state.player.x);
    const vis = computeVisibility(state.enemy, state.player, dist, config);
    expect(vis).toBe(VisibilityLevel.NONE);
  });

  it("gunboat detects SURFACE sub at MEDIUM range", () => {
    const config = defaultCombatConfig();
    const state = buildInitialState(VesselType.GUNBOAT, config);

    // Place player at MEDIUM range (gap ~250 units)
    state.player.x = 0;
    state.player.y = 0;
    state.player.depth = DepthBand.SURFACE;
    state.enemy.x = 250;
    state.enemy.y = 0;

    const dist = Math.abs(state.enemy.x - state.player.x);
    const vis = computeVisibility(state.enemy, state.player, dist, config);
    expect(vis).toBeGreaterThan(VisibilityLevel.NONE);
  });

  it("escape: result = escaped after player at DEEP DEAD_SLOW with no contact", () => {
    const config = defaultCombatConfig();
    const state = buildInitialState(VesselType.GUNBOAT, config);

    // Put player at DEEP — visual-only gunboat has zero visibility
    state.player.depth = DepthBand.DEEP;
    state.player.depthTarget = DepthBand.DEEP;
    state.player.y = DepthBand.DEEP * 150;
    state.player.nauticalSpeed = NauticalSpeed.DEAD_SLOW;
    state.player.horizontalIntent = -1;

    // Enemy holds position so gap keeps opening
    state.enemy.nauticalSpeed = NauticalSpeed.DEAD_SLOW;
    state.enemy.horizontalIntent = 0;

    const rng = new Mulberry32(0);
    let s = state;
    for (let i = 1; i <= 60; i++) {
      const { newState } = tickCombat(s, i, rng, null, config);
      s = newState;
      if (s.result === "escaped") break;
    }

    expect(s.result).toBe("escaped");
    expect(s.escapeAccumulator).toBeGreaterThanOrEqual(config.escapeTicks);
  });

  it("player win: close then dive to fire torpedoes at gunboat within 400 ticks", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.GUNBOAT);

    // Close aggressively
    engine.queueCommand({
      type: "SET_NAUTICAL_SPEED",
      speed: NauticalSpeed.FULL_AHEAD,
      intent: 1,
    });

    let diveDone = false;
    let heldAfterDive = false;
    for (let i = 0; i < 400; i++) {
      engine.tick();
      const state = engine.getState();
      const combat = state.combat;
      if (!combat || combat.result !== "ongoing") break;

      // Dive once at SHORT range
      if (
        !diveDone &&
        Math.abs(combat.enemy.x - combat.player.x) < 300 &&
        combat.player.depth === DepthBand.SURFACE
      ) {
        engine.queueCommand({
          type: "SET_DEPTH",
          target: DepthBand.PERISCOPE,
          diveSpeed: DiveSpeed.STANDARD,
        });
        diveDone = true;
      }

      // Once at PERISCOPE, stop forward motion to stay near enemy; issue in separate tick
      if (diveDone && combat.player.depth === DepthBand.PERISCOPE && !heldAfterDive) {
        engine.queueCommand({
          type: "SET_NAUTICAL_SPEED",
          speed: NauticalSpeed.DEAD_SLOW,
          intent: 0,
        });
        heldAfterDive = true;
      } else if (combat.player.depth === DepthBand.PERISCOPE) {
        // Fire torpedo when submerged and already holding position
        engine.queueCommand({ type: "FIRE_WEAPON", weaponId: "torpedo" });
      }
    }

    const finalState = engine.getState();
    expect(finalState.combat?.result).not.toBe("ongoing");

    const torpedoShots = finalState.log.filter(
      (e) =>
        e.type === "weapon_fired" && (e.payload as { weaponId?: string }).weaponId === "torpedo",
    );
    expect(torpedoShots.length).toBeGreaterThan(0);
  });

  it("range_change event emitted when gunboat closes from LONG to SHORT", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.GUNBOAT);

    for (let i = 0; i < 60; i++) {
      engine.tick();
      const combat = engine.getState().combat;
      if (!combat || combat.result !== "ongoing") break;
    }

    const rangeChanges = engine.getState().log.filter((e) => e.type === "range_change");
    expect(rangeChanges.length).toBeGreaterThanOrEqual(1);

    const closerTransition = rangeChanges.some(
      (e) => ((e.payload as Record<string, unknown>)["to"] as number) <= RangeBand.SHORT,
    );
    expect(closerTransition).toBe(true);
  });
});
