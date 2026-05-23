import { describe, it, expect } from "vitest";
import { euclideanDistance, toRangeBand, toDepthBand, depthOffsetBand, BAND_SIZE } from "../geometry.js";
import { RangeBand, DepthBand } from "../enums.js";

describe("euclideanDistance", () => {
  it("returns 0 for zero deltas", () => {
    expect(euclideanDistance(0, 0)).toBe(0);
  });

  it("returns correct distance for 3-4-5 triangle", () => {
    expect(euclideanDistance(3, 4)).toBe(5);
  });

  it("returns dx for dy=0", () => {
    expect(euclideanDistance(100, 0)).toBe(100);
  });
});

describe("toRangeBand", () => {
  it("CONTACT_RANGE for distance 0", () => {
    expect(toRangeBand(0)).toBe(RangeBand.CONTACT_RANGE);
  });

  it("CONTACT_RANGE for distance just under BAND_SIZE", () => {
    expect(toRangeBand(BAND_SIZE - 1)).toBe(RangeBand.CONTACT_RANGE);
  });

  it("SHORT for distance equal to BAND_SIZE", () => {
    expect(toRangeBand(BAND_SIZE)).toBe(RangeBand.SHORT);
  });

  it("MEDIUM for distance 2*BAND_SIZE", () => {
    expect(toRangeBand(2 * BAND_SIZE)).toBe(RangeBand.MEDIUM);
  });

  it("LONG for distance 3*BAND_SIZE", () => {
    expect(toRangeBand(3 * BAND_SIZE)).toBe(RangeBand.LONG);
  });

  it("EXTREME for distance 4*BAND_SIZE", () => {
    expect(toRangeBand(4 * BAND_SIZE)).toBe(RangeBand.EXTREME);
  });

  it("clamps to EXTREME for very large distance", () => {
    expect(toRangeBand(9999)).toBe(RangeBand.EXTREME);
  });
});

describe("toDepthBand", () => {
  it("SURFACE for y=0", () => {
    expect(toDepthBand(0)).toBe(DepthBand.SURFACE);
  });

  it("PERISCOPE for y=BAND_SIZE", () => {
    expect(toDepthBand(BAND_SIZE)).toBe(DepthBand.PERISCOPE);
  });

  it("ABYSSAL for y=4*BAND_SIZE", () => {
    expect(toDepthBand(4 * BAND_SIZE)).toBe(DepthBand.ABYSSAL);
  });

  it("clamps to ABYSSAL for very large y", () => {
    expect(toDepthBand(9999)).toBe(DepthBand.ABYSSAL);
  });
});

describe("depthOffsetBand", () => {
  it("returns 0 for offset 0", () => {
    expect(depthOffsetBand(0)).toBe(0);
  });

  it("returns 0 for offset just under BAND_SIZE", () => {
    expect(depthOffsetBand(BAND_SIZE - 1)).toBe(0);
  });

  it("returns 1 for offset equal to BAND_SIZE", () => {
    expect(depthOffsetBand(BAND_SIZE)).toBe(1);
  });

  it("works with negative values (uses abs)", () => {
    expect(depthOffsetBand(-BAND_SIZE)).toBe(1);
  });

  it("clamps to 4 for large offsets", () => {
    expect(depthOffsetBand(9999)).toBe(4);
  });
});
