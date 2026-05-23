import { describe, it, expect } from "vitest";
import { resolveWeaponFire } from "../weapons.js";
import { VisibilityLevel, VesselType, RangeBand } from "../enums.js";
import { Mulberry32 } from "../../prng.js";
import { defaultCombatConfig } from "../config.js";

describe("resolveWeaponFire", () => {
  const config = defaultCombatConfig();

  it("returns fired=false when visibility is NONE", () => {
    const rng = new Mulberry32(42);
    const stateBefore = rng.getState();
    const result = resolveWeaponFire(
      "deck_gun",
      VisibilityLevel.NONE,
      RangeBand.SHORT,
      0,
      rng,
      config,
      VesselType.DESTROYER,
    );
    expect(result.fired).toBe(false);
    // RNG must not be consumed when gated out
    expect(rng.getState()).toBe(stateBefore);
  });

  it("returns fired=false when hitRate is 0 (out of range)", () => {
    const rng = new Mulberry32(42);
    const stateBefore = rng.getState();
    const result = resolveWeaponFire(
      "deck_gun",
      VisibilityLevel.LOCKED_ON,
      RangeBand.EXTREME, // zero hitRate at EXTREME
      0,
      rng,
      config,
      VesselType.DESTROYER,
    );
    expect(result.fired).toBe(false);
    expect(rng.getState()).toBe(stateBefore);
  });

  it("fires when visibility > NONE and hitRate > 0", () => {
    const rng = new Mulberry32(42);
    const result = resolveWeaponFire(
      "deck_gun",
      VisibilityLevel.LOCKED_ON,
      RangeBand.SHORT,
      0,
      rng,
      config,
      VesselType.DESTROYER,
    );
    expect(result.fired).toBe(true);
  });

  it("damage matches config matrix when fired and hit", () => {
    // Use a deterministic seed that ensures a hit
    // deck_gun at SHORT depthOffset 0 has hitRate=0.65 damage=3
    // We'll try seeds until we get a hit (or check damage directly)
    const rng = new Mulberry32(1);
    let hitResult = { fired: false, hit: false, damage: 0 };
    // Try up to 10 seeds to find one that hits
    for (let seed = 1; seed <= 100; seed++) {
      const r = new Mulberry32(seed);
      const res = resolveWeaponFire(
        "deck_gun",
        VisibilityLevel.LOCKED_ON,
        RangeBand.SHORT,
        0,
        r,
        config,
        VesselType.DESTROYER,
      );
      if (res.fired && res.hit) {
        hitResult = res;
        break;
      }
    }
    expect(hitResult.hit).toBe(true);
    expect(hitResult.damage).toBe(3);
    void rng;
  });

  it("returns fired=false for unknown weapon id", () => {
    const rng = new Mulberry32(42);
    const result = resolveWeaponFire(
      "unknown_weapon",
      VisibilityLevel.LOCKED_ON,
      RangeBand.SHORT,
      0,
      rng,
      config,
      VesselType.DESTROYER,
    );
    expect(result.fired).toBe(false);
  });
});
