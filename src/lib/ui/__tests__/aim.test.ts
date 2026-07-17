import { describe, it, expect } from 'vitest';
import { pickOrigin } from '../aim';
import type { Pos } from '$lib/engine/types';

const TARGET: Pos = { col: 5, row: 5 };
const RIGHT: Pos = { col: 6, row: 5 };  // 0° from target
const BELOW: Pos = { col: 5, row: 6 };  // 90° from target
const ORIGINS = [RIGHT, BELOW];

describe('pickOrigin', () => {
  it('picks the nearest origin by angle when there is no current pick', () => {
    // ~47.7° — just past the 45° midpoint, nearest is BELOW
    expect(pickOrigin(null, ORIGINS, TARGET, { dx: 1, dy: 1.1 })).toEqual(BELOW);
    // ~42.3° — nearest is RIGHT
    expect(pickOrigin(null, ORIGINS, TARGET, { dx: 1.1, dy: 1 })).toEqual(RIGHT);
  });

  it('holds the current pick against jitter just past the boundary', () => {
    // ~47.7°: BELOW is nearer (42.3° vs 47.7°) but only by ~5.4° — inside the margin
    expect(pickOrigin(RIGHT, ORIGINS, TARGET, { dx: 1, dy: 1.1 })).toEqual(RIGHT);
  });

  it('switches when the cursor decisively favors another origin', () => {
    // 70°: BELOW wins by 50° (70° vs 20°) — well past the margin
    expect(pickOrigin(RIGHT, ORIGINS, TARGET, { dx: Math.cos(Math.PI * 70 / 180), dy: Math.sin(Math.PI * 70 / 180) })).toEqual(BELOW);
  });

  it('re-picks fresh when the current pick is no longer a valid origin', () => {
    const stale: Pos = { col: 4, row: 5 }; // left tile — not in ORIGINS
    // ~47.7° with no hysteresis protection → nearest wins
    expect(pickOrigin(stale, ORIGINS, TARGET, { dx: 1, dy: 1.1 })).toEqual(BELOW);
  });

  it('handles the wraparound at ±180°', () => {
    const LEFT: Pos = { col: 4, row: 5 }; // 180°
    // cursor at -170° is only 10° from LEFT across the wrap
    expect(pickOrigin(null, [LEFT, RIGHT], TARGET, { dx: Math.cos(-Math.PI * 170 / 180), dy: Math.sin(-Math.PI * 170 / 180) })).toEqual(LEFT);
  });

  it('returns null for an empty origins list', () => {
    expect(pickOrigin(null, [], TARGET, { dx: 1, dy: 0 })).toBeNull();
  });
});
