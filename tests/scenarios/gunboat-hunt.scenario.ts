/**
 * Headless scenario tests for the gunboat_hunt playthrough.
 *
 * Verifies: initial state, detection behavior at depth, blind shots,
 * escape accumulator, and a full player-win playthrough.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../../src/sim/index.js";
import {
  DepthBand,
  RangeBand,
  RoomType,
  SpeedDirection,
  SpeedSetting,
} from "../../src/sim/combat/types.js";
import { contactQuality } from "../../src/sim/combat/detection.js";
import { buildGunboatHuntState, tickCombat } from "../../src/sim/combat/tick.js";
import { Mulberry32 } from "../../src/sim/prng.js";

describe("gunboat_hunt scenario", () => {
  it("initial state: sub at SURFACE, 2 crew (mate in bridge, engineer in torpedo), gunboat AHEAD_FULL CLOSE", () => {
    const engine = new SimEngine(0);
    engine.startCombat("gunboat_hunt");

    const state = engine.getState();
    const combat = state.combat;
    expect(combat).not.toBeNull();
    if (!combat) return;

    expect(combat.scenario).toBe("gunboat_hunt");
    expect(combat.player.depth).toBe(DepthBand.SURFACE);
    expect(combat.player.depthTarget).toBe(DepthBand.SURFACE);
    expect(combat.crew).toHaveLength(2);
    expect(combat.crew.find((c) => c.id === "mate")?.roomId).toBe("bridge");
    expect(combat.crew.find((c) => c.id === "engineer")?.roomId).toBe("torpedo");
    expect(combat.rooms.find((r) => r.type === RoomType.TORPEDO)?.crewIds).toContain("engineer");
    expect(combat.enemy.speed).toBe(SpeedSetting.AHEAD_FULL);
    expect(combat.enemy.direction).toBe(SpeedDirection.CLOSE);
    expect(combat.enemy.hullHP).toBe(15);
    expect(combat.range).toBe(RangeBand.LONG);
    expect(combat.enemyLastKnownRange).toBe(RangeBand.LONG);
    expect(combat.enemyBlindShotsFired).toBe(0);
    expect(combat.escapeAccumulator).toBe(0);
  });

  it("gunboat does not detect sub at SHALLOW (visual only)", () => {
    const state = buildGunboatHuntState();

    // Force player to SHALLOW so gunboat (visual only) has CQ = 0 at all ranges
    state.player.depth = DepthBand.SHALLOW;
    state.player.depthTarget = DepthBand.SHALLOW;

    for (const range of [
      RangeBand.LONG,
      RangeBand.MEDIUM,
      RangeBand.SHORT,
      RangeBand.POINT_BLANK,
    ]) {
      const cq = contactQuality(state.enemy, state.player, range);
      expect(cq).toBe(0);
    }

    // Run 5 ticks to confirm no shots fired against a SHALLOW target
    const rng = new Mulberry32(42);
    let s = state;
    const allEvents: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const { newState, events } = tickCombat(s, i, rng, null);
      s = newState;
      for (const ev of events) {
        allEvents.push(ev.type);
      }
    }

    const shots = allEvents.filter((t) => t === "shot_fired");
    expect(shots).toHaveLength(0);
  });

  it("blind shots: gunboat fires up to 3 blind shots after sub dives from PERISCOPE to SHALLOW", () => {
    // Set up: sub at PERISCOPE SHORT range so gunboat has contact (CQ = 4), then dive to SHALLOW.
    // SHORT range gap = [300, 450) units; player x=350, enemy x=750 → gap=400 → SHORT.
    const state = buildGunboatHuntState();
    state.player.x = 350;
    state.player.y = 150; // PERISCOPE band
    state.player.depth = DepthBand.PERISCOPE;
    state.player.depthTarget = DepthBand.PERISCOPE;
    // Freeze enemy in place to keep range stable during this unit test.
    state.enemy.direction = SpeedDirection.HOLD;
    // Enemy has had contact — set lastKnownRange = SHORT
    state.enemyLastKnownRange = RangeBand.SHORT;
    state.enemyBlindShotsFired = 0;

    // Verify gunboat has contact at this range/depth
    const cqBefore = contactQuality(state.enemy, state.player, RangeBand.SHORT);
    expect(cqBefore).toBeGreaterThanOrEqual(4);

    // Now dive the player to SHALLOW — gunboat loses contact
    state.player.y = 300; // SHALLOW band
    state.player.depth = DepthBand.SHALLOW;
    state.player.depthTarget = DepthBand.SHALLOW;
    const cqAfter = contactQuality(state.enemy, state.player, RangeBand.SHORT);
    expect(cqAfter).toBe(0);

    // Tick enough to exhaust 3 blind shots — each uses one cooldown period (10 ticks)
    const rng = new Mulberry32(42);
    let s = state;
    for (let i = 1; i <= 35; i++) {
      const { newState } = tickCombat(s, i, rng, null);
      s = newState;
    }

    // AI should have attempted blind shots — counter tracks AI attempts regardless of depth
    expect(s.enemyBlindShotsFired).toBeGreaterThan(0);
    expect(s.enemyBlindShotsFired).toBeLessThanOrEqual(3);
  });

  it("escape: result = escaped after 20 ticks at LONG range with no contact and OPEN net direction", () => {
    // Build a state where gap is opening: player AHEAD_FULL OPEN, enemy HOLD.
    // Player at SHALLOW (y=300) so visual-only gunboat has CQ=0.
    const state = buildGunboatHuntState();
    state.player.y = 300; // SHALLOW band — invisible to visual-only gunboat
    state.player.depth = DepthBand.SHALLOW;
    state.player.depthTarget = DepthBand.SHALLOW;
    state.player.speed = SpeedSetting.AHEAD_FULL;
    state.player.direction = SpeedDirection.OPEN;
    // Enemy holds position so gap keeps opening
    state.enemy.speed = SpeedSetting.SILENT;
    state.enemy.direction = SpeedDirection.HOLD;

    // Verify enemy has no contact at SHALLOW at LONG range (positions: player=0, enemy=750)
    const cq = contactQuality(state.enemy, state.player, RangeBand.LONG);
    expect(cq).toBe(0);

    const rng = new Mulberry32(0);
    let s = state;
    for (let i = 1; i <= 30; i++) {
      const { newState } = tickCombat(s, i, rng, null);
      s = newState;
      if (s.result === "escaped") break;
    }

    expect(s.result).toBe("escaped");
    expect(s.escapeAccumulator).toBeGreaterThanOrEqual(20);
  });

  it("player win: seed 42, close then dive to fire torpedos at gunboat within 400 ticks", () => {
    const engine = new SimEngine(42);
    engine.startCombat("gunboat_hunt");

    // Close aggressively first; dive once SHORT range is reached so torpedos can engage
    engine.queueCommand({
      type: "SET_SPEED",
      speed: SpeedSetting.AHEAD_FULL,
      direction: SpeedDirection.CLOSE,
    });

    let diveDone = false;
    for (let i = 0; i < 400; i++) {
      engine.tick();
      const state = engine.getState();
      const combat = state.combat;
      if (!combat || combat.result !== "ongoing") break;

      if (
        !diveDone &&
        combat.range <= RangeBand.SHORT &&
        combat.player.depth === DepthBand.SURFACE
      ) {
        engine.queueCommand({ type: "SET_DEPTH", target: DepthBand.PERISCOPE });
        diveDone = true;
      }
    }

    const finalState = engine.getState();
    expect(finalState.combat?.result).toBe("player_win");

    const torpedoShots = finalState.log.filter(
      (e) => e.type === "shot_fired" && (e.payload as { weapon?: string }).weapon === "torpedo",
    );
    expect(torpedoShots.length).toBeGreaterThan(0);
  });
});
