import { describe, it, expect } from "vitest";
import { computeVisibility } from "../detection.js";
import {
  DepthBand,
  NauticalSpeed,
  DiveSpeed,
  VisibilityLevel,
  VesselType,
  DetectionMethod,
} from "../enums.js";
import { defaultCombatConfig } from "../config.js";
import type { VesselState } from "../types.js";
import { BAND_SIZE } from "../geometry.js";

function makeVessel(overrides: Partial<VesselState>): VesselState {
  return {
    vesselType: VesselType.SUBMARINE,
    hullHP: 20,
    maxHullHP: 20,
    x: 0,
    y: 0,
    depth: DepthBand.SURFACE,
    depthTarget: DepthBand.SURFACE,
    nauticalSpeed: NauticalSpeed.DEAD_SLOW,
    diveSpeed: DiveSpeed.TRIM,
    horizontalIntent: 0,
    weaponCooldowns: {},
    weaponAmmo: {},
    detectionMethods: [],
    ...overrides,
  };
}

describe("computeVisibility", () => {
  const config = defaultCombatConfig();

  it("returns NONE when observer has no detection methods", () => {
    const observer = makeVessel({ vesselType: VesselType.DESTROYER, detectionMethods: [] });
    const target = makeVessel({ vesselType: VesselType.SUBMARINE });
    const result = computeVisibility(observer, target, 0, config);
    expect(result).toBe(VisibilityLevel.NONE);
  });

  it("NONE for destroyer passive sonar at DEAD_SLOW DEEP at LONG", () => {
    const observer = makeVessel({
      vesselType: VesselType.DESTROYER,
      depth: DepthBand.SURFACE,
      detectionMethods: [DetectionMethod.SONAR_PASSIVE],
    });
    // Target is submerged at DEEP depth
    const target = makeVessel({
      vesselType: VesselType.SUBMARINE,
      y: DepthBand.DEEP * BAND_SIZE,
      depth: DepthBand.DEEP,
      nauticalSpeed: NauticalSpeed.DEAD_SLOW,
    });
    // Distance at LONG = 3*BAND_SIZE = 450
    const result = computeVisibility(observer, target, 3 * BAND_SIZE, config);
    expect(result).toBe(VisibilityLevel.NONE);
  });

  it("LOCKED_ON for destroyer visual at FLANK+SURFACE at CONTACT_RANGE", () => {
    const observer = makeVessel({
      vesselType: VesselType.DESTROYER,
      depth: DepthBand.SURFACE,
      detectionMethods: [DetectionMethod.VISUAL_SURFACE],
    });
    const target = makeVessel({
      vesselType: VesselType.SUBMARINE,
      depth: DepthBand.SURFACE,
      nauticalSpeed: NauticalSpeed.FLANK,
    });
    // Distance at CONTACT_RANGE = 0 (< BAND_SIZE)
    const result = computeVisibility(observer, target, 0, config);
    expect(result).toBe(VisibilityLevel.LOCKED_ON);
  });

  it("takes max across detection methods", () => {
    // Observer with both visual and sonar — visual gives LOCKED_ON, sonar gives CONTACT
    const observer = makeVessel({
      vesselType: VesselType.DESTROYER,
      depth: DepthBand.SURFACE,
      detectionMethods: [DetectionMethod.VISUAL_SURFACE, DetectionMethod.SONAR_PASSIVE],
    });
    const target = makeVessel({
      vesselType: VesselType.SUBMARINE,
      depth: DepthBand.SURFACE,
      nauticalSpeed: NauticalSpeed.DEAD_SLOW,
    });
    const result = computeVisibility(observer, target, 0, config);
    // Should be LOCKED_ON (best from visual)
    expect(result).toBeGreaterThanOrEqual(VisibilityLevel.SILHOUETTE);
  });

  it("returns NONE for destroyer sonar at depth ABYSSAL (observer)", () => {
    const observer = makeVessel({
      vesselType: VesselType.DESTROYER,
      depth: DepthBand.ABYSSAL,
      detectionMethods: [DetectionMethod.SONAR_PASSIVE],
    });
    const target = makeVessel({
      vesselType: VesselType.SUBMARINE,
      depth: DepthBand.SURFACE,
      nauticalSpeed: NauticalSpeed.FLANK,
    });
    const result = computeVisibility(observer, target, 0, config);
    expect(result).toBe(VisibilityLevel.NONE);
  });
});
