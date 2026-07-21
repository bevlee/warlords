import { describe, expect, it } from 'vitest';
import { battleStateHash } from '../protocol';
import type { BattleState } from '../../engine/types';

describe('battleStateHash', () => {
  it('does not depend on object key insertion order', () => {
    const first = { seed: 7, result: 'ongoing', nested: { beta: 2, alpha: 1 } } as unknown as BattleState;
    const second = { nested: { alpha: 1, beta: 2 }, result: 'ongoing', seed: 7 } as unknown as BattleState;

    expect(battleStateHash(first)).toBe(battleStateHash(second));
  });
});
