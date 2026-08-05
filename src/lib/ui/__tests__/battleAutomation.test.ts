import { describe, expect, it } from 'vitest';
import type { UnitStack } from '$lib/engine/types';
import { shouldAutomateTurn } from '../battleAutomation';

function unit(overrides: Partial<UnitStack> = {}): UnitStack {
  return {
    id: 'unit-1',
    definition: {
      name: 'Goblin',
      tier: 1,
      speed: 4,
      initiative: 10,
      hp: 5,
      attack: 1,
      defense: 1,
      minDamage: 1,
      maxDamage: 2,
      shots: 0,
      range: 0,
      isLarge: false,
      abilities: [],
    },
    count: 10,
    startCount: 10,
    hp: 5,
    pos: { col: 0, row: 0 },
    side: 'player',
    hasRetaliated: false,
    shotsLeft: 0,
    morale: 0,
    luck: 0,
    atb: 1,
    isDefending: false,
    ...overrides,
  };
}

describe('shouldAutomateTurn', () => {
  it('keeps the existing offline AI turns when auto battle is off', () => {
    expect(shouldAutomateTurn(unit({ side: 'enemy' }), false, false)).toBe(true);
    expect(shouldAutomateTurn(unit({ isAlly: true }), false, false)).toBe(true);
    expect(shouldAutomateTurn(unit(), false, false)).toBe(false);
  });

  it('drives player stacks in offline modes when auto battle is on', () => {
    expect(shouldAutomateTurn(unit(), true, false)).toBe(true);
  });

  it('only drives this client\'s stacks in an online battle', () => {
    expect(shouldAutomateTurn(unit({ controllerId: 'host' }), true, true, 'host')).toBe(true);
    expect(shouldAutomateTurn(unit({ controllerId: 'guest' }), true, true, 'host')).toBe(false);
    expect(shouldAutomateTurn(unit({ side: 'enemy', controllerId: 'ai' }), true, true, 'host')).toBe(false);
    expect(shouldAutomateTurn(unit({ controllerId: 'host' }), false, true, 'host')).toBe(false);
  });
});
