/**
 * Headless scenario tests for the destroyer_dive playthrough.
 *
 * Verifies: initial crew placement, depth/crew commands, and a full
 * playthrough where the player dives and fires torpedoes to win.
 */

import { describe, it, expect } from "vitest";
import { SimEngine } from "../../src/sim/index.js";
import { DepthBand, RoomType } from "../../src/sim/combat/types.js";

describe("destroyer_dive scenario", () => {
  it("initial state: two crew, bridge + engine, torpedo room empty", () => {
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_dive");

    const state = engine.getState();
    const combat = state.combat;
    expect(combat).not.toBeNull();
    if (!combat) return;

    expect(combat.scenario).toBe("destroyer_dive");
    expect(combat.crew).toHaveLength(2);
    expect(combat.crew.find((c) => c.id === "mate")?.roomId).toBe("bridge");
    expect(combat.crew.find((c) => c.id === "engineer")?.roomId).toBe("engine");
    expect(combat.rooms.find((r) => r.type === RoomType.TORPEDO)?.crewIds).toHaveLength(0);
    expect(combat.player.depth).toBe(DepthBand.SURFACE);
    expect(combat.player.depthTarget).toBe(DepthBand.SURFACE);
  });

  it("SET_DEPTH is gated on bridge crew; ASSIGN_CREW moves engineer to torpedo", () => {
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_dive");

    // Bridge is crewed by mate — depth command should work
    engine.queueCommand({ type: "SET_DEPTH", target: DepthBand.PERISCOPE });
    expect(engine.getState().combat?.player.depthTarget).toBe(DepthBand.PERISCOPE);

    // Move engineer to torpedo room
    engine.queueCommand({ type: "ASSIGN_CREW", crewId: "engineer", roomId: "torpedo" });
    const state = engine.getState();
    const combat = state.combat;
    expect(combat?.crew.find((c) => c.id === "engineer")?.roomId).toBe("torpedo");
    expect(combat?.rooms.find((r) => r.type === RoomType.TORPEDO)?.crewIds).toContain("engineer");
    expect(combat?.rooms.find((r) => r.type === RoomType.ENGINE)?.crewIds).not.toContain("engineer");
  });

  it("depth transitions: player reaches PERISCOPE after 6 ticks", () => {
    const engine = new SimEngine(0);
    engine.startCombat("destroyer_dive");
    engine.queueCommand({ type: "SET_DEPTH", target: DepthBand.PERISCOPE });

    for (let i = 0; i < 6; i++) engine.tick();

    const combat = engine.getState().combat;
    expect(combat?.player.depth).toBe(DepthBand.PERISCOPE);
  });

  it("full playthrough: dive + torpedo crew leads to player_win within 300 ticks", () => {
    const engine = new SimEngine(42);
    engine.startCombat("destroyer_dive");

    // Pre-assign for headless: order dive and crew torpedo room immediately
    engine.queueCommand({ type: "SET_DEPTH", target: DepthBand.PERISCOPE });
    engine.queueCommand({ type: "ASSIGN_CREW", crewId: "engineer", roomId: "torpedo" });

    for (let i = 0; i < 300; i++) {
      engine.tick();
      const result = engine.getState().combat?.result;
      if (result === "player_win") break;
    }

    const finalState = engine.getState();
    expect(finalState.combat?.result).toBe("player_win");

    const shotsFired = finalState.log.filter(
      (e) => e.type === "shot_fired" && (e.payload as { weapon?: string }).weapon === "torpedo",
    );
    expect(shotsFired.length).toBeGreaterThan(0);
  });
});
