import { DepthBand, DepthType, RangeBand } from "./enums.js";

export const BAND_SIZE = 150;

export function euclideanDistance(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

export function toRangeBand(distance: number): RangeBand {
  const band = Math.floor(distance / BAND_SIZE);
  return Math.min(band, RangeBand.EXTREME) as RangeBand;
}

export function toDepthBand(y: number): DepthBand {
  const band = Math.floor(y / BAND_SIZE);
  return Math.min(band, DepthBand.ABYSSAL) as DepthBand;
}

export function depthOffsetBand(dy: number): number {
  const band = Math.floor(Math.abs(dy) / BAND_SIZE);
  return Math.min(band, 4);
}

export function toDepthType(depth: DepthBand): DepthType {
  return depth === DepthBand.SURFACE ? DepthType.SURFACE : DepthType.SUBMERGED;
}
