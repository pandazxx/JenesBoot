/**
 * Seedable PRNG — mulberry32 algorithm.
 *
 * Returns floats in [0, 1). Fully deterministic given the same seed.
 * Never calls Math.random().
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    // Ensure a non-zero 32-bit unsigned integer.
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  /** Advance state and return next float in [0, 1). */
  next(): number {
    let z = (this.state += 0x6d2b79f5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /** Expose current state for snapshot / reproducibility checks. */
  getState(): number {
    return this.state >>> 0;
  }
}
