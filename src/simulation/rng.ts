/**
 * Deterministic pseudo-random number generation.
 *
 * The simulation must be repeatable: the same scenario id and seed must always
 * produce the same inflow sequence, the same forecast band and the same
 * "detected first" incident. `Math.random` is therefore never used anywhere in
 * the engine.
 */
export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** mulberry32 — small, fast, and stable across engines. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Symmetric noise in [-1, 1]. */
  signed(): number {
    return this.next() * 2 - 1;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/** Stable 32-bit hash of a string — used to derive per-entity streams. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Derive a stable child seed from a parent seed and an entity key. */
export function deriveSeed(parentSeed: number, key: string): number {
  return (Math.imul(parentSeed >>> 0, 2654435761) ^ hashString(key)) >>> 0;
}
