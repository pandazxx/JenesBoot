/**
 * Unit tests for destroyer combat mechanics — diving and torpedo engagement.
 *
 * Covers: initial state, depth commands, depth transitions, and a full
 * playthrough where the player dives and fires torpedoes to win.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";
import { VesselType, DepthBand, DiveSpeed, NauticalSpeed } from "../combat/enums.js";

describe("destroyer dive scenario", () => {
  it("initial state: player at SURFACE, enemy DESTROYER at default starting x", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);

    const state = engine.getState();
    const combat = state.combat;
    expect(combat).not.toBeNull();
    if (!combat) return;

    expect(combat.enemyType).toBe(VesselType.DESTROYER);
    expect(combat.player.depth).toBe(DepthBand.SURFACE);
    expect(combat.player.depthTarget).toBe(DepthBand.SURFACE);
    expect(combat.enemy.x).toBeGreaterThan(0);
    expect(combat.enemy.hullHP).toBeGreaterThan(0);
  });

  it("SET_DEPTH command updates depthTarget immediately", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);

    engine.queueCommand({
      type: "SET_DEPTH",
      target: DepthBand.PERISCOPE,
      diveSpeed: DiveSpeed.STANDARD,
    });
    engine.tick();
    expect(engine.getState().combat?.player.depthTarget).toBe(DepthBand.PERISCOPE);
  });

  it("depth transitions: player reaches PERISCOPE after enough ticks", () => {
    const engine = SimEngine(0);
    engine.startCombat(VesselType.DESTROYER);
    engine.queueCommand({
      type: "SET_DEPTH",
      target: DepthBand.PERISCOPE,
      diveSpeed: DiveSpeed.STANDARD,
    });

    // Standard dive speed = 15 units/tick. PERISCOPE band starts at y=150.
    // Should reach it within 15 ticks.
    for (let i = 0; i < 15; i++) engine.tick();

    const combat = engine.getState().combat;
    expect(combat?.player.depth).toBe(DepthBand.PERISCOPE);
  });

  it("full playthrough: dive + DEAD_SLOW stealth + torpedo wins within 200 ticks", () => {
    const engine = SimEngine(42);
    engine.startCombat(VesselType.DESTROYER);

    // Dive to PERISCOPE and go silent — DEAD_SLOW makes sub undetectable by destroyer sonar
    engine.queueCommand({
      type: "SET_DEPTH",
      target: DepthBand.PERISCOPE,
      diveSpeed: DiveSpeed.STANDARD,
    });

    let wentSilent = false;
    for (let i = 0; i < 200; i++) {
      engine.tick();
      const combat = engine.getState().combat;
      if (!combat || combat.result !== "ongoing") break;

      // Go DEAD_SLOW once submerged to avoid sonar detection
      if (!wentSilent && combat.player.depth === DepthBand.PERISCOPE) {
        engine.queueCommand({
          type: "SET_NAUTICAL_SPEED",
          speed: NauticalSpeed.DEAD_SLOW,
          intent: 0,
        });
        wentSilent = true;
      } else if (wentSilent && combat.player.depth === DepthBand.PERISCOPE) {
        // Fire torpedo when submerged and silent
        engine.queueCommand({ type: "FIRE_WEAPON", weaponId: "torpedo" });
      }
    }

    const finalState = engine.getState();
    expect(finalState.combat?.result).toBe("player_win");

    const weaponFiredEvents = finalState.log.filter(
      (e) =>
        e.type === "weapon_fired" && (e.payload as { weaponId?: string }).weaponId === "torpedo",
    );
    expect(weaponFiredEvents.length).toBeGreaterThan(0);
  });
});
