// Mulberry32 seeded PRNG — deterministic, portable
export function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z ^ (z + Math.imul(z ^ (z >>> 7), 61 | z))) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Stable UTF-16 hash used only to derive independent deterministic streams. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Hash-mixes a run seed with a salt into a well-distributed 32-bit seed.
 *  Unlike a linear combination (seed*a + salt*b), this doesn't collide for
 *  seed/salt pairs a fixed offset apart — important since seeds are commonly
 *  Date.now()-derived and close together across runs. */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed | 0) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return h;
}

/**
 * A gameplay stream belongs to one action/phase/definition/subject. Adding a
 * combat-log line or an unrelated random handler therefore cannot move rolls
 * consumed by an existing mechanic.
 */
export function rngFor(
  seed: number,
  actionSeq: number,
  phase: string,
  definitionId: string,
  subjectId: string,
): Rng {
  const key = `${seed}:${actionSeq}:${phase}:${definitionId}:${subjectId}`;
  return mulberry32(mixSeed(seed, hashString(key)));
}
