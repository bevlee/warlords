import { describe, expect, it } from 'vitest';
import { createGrid, placeUnits } from '$lib/engine/grid';
import type { BattleState, Hero, UnitDef, UnitStack } from '$lib/engine/types';
import { turnBarEntries } from '../turnBar';

const GOBLIN: UnitDef = {
  name: 'Goblin', tier: 1, speed: 4, initiative: 10, hp: 5,
  attack: 1, defense: 1, minDamage: 1, maxDamage: 2,
  shots: 0, range: 0, isLarge: false, abilities: [],
};

function unit(id: string, side: 'player' | 'enemy', overrides: Partial<UnitStack> = {}): UnitStack {
  return {
    id,
    definition: GOBLIN,
    count: 10,
    startCount: 10,
    hp: 5,
    pos: { col: side === 'player' ? 1 : 10, row: 1 },
    side,
    hasRetaliated: false,
    shotsLeft: 0,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    ...overrides,
  };
}

/** 'a' is at the act point with 'b' six tenths of a cycle behind it. */
function standoff(): BattleState {
  const units = [
    unit('a', 'player', { atb: 1, tiePriority: 0.1 }),
    unit('b', 'enemy', { atb: 0.4, tiePriority: 0.9 }),
  ];
  return {
    grid: placeUnits(createGrid(12, 10), units),
    units,
    hero: { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] } as Hero,
    round: 1,
    battleTime: 0,
    currentUnitId: 'a',
    log: [],
    result: 'ongoing',
    seed: 7,
    nextId: 1,
  };
}

describe('turnBarEntries', () => {
  it('follows the live schedule and rings the stack acting now', () => {
    const entries = turnBarEntries(standoff()).slice(0, 3);

    expect(entries.map(e => e.unit.id)).toEqual(['a', 'b', 'a']);
    expect(entries.map(e => e.isCurrent)).toEqual([true, false, false]);
    expect(entries.every(e => !e.isProjected)).toBe(true);
  });

  it('breaks into rounds where the schedule crosses one', () => {
    const entries = turnBarEntries(standoff()).slice(0, 3);

    expect(entries.map(e => e.round)).toEqual([1, 1, 2]);
    expect(entries.map(e => e.startsRound)).toEqual([false, false, true]);
  });

  it('re-shapes the strip around the action being hovered', () => {
    const entries = turnBarEntries(standoff(), 'defend').slice(0, 3);

    // Ending its turn outright drops 'a' behind 'b', which the live strip
    // above cannot show because 'a' has not acted yet.
    expect(entries.map(e => e.unit.id)).toEqual(['b', 'a', 'b']);
  });

  it('marks only the landing slot, not every later turn of the same stack', () => {
    const state = standoff();
    // A stack quick enough to come round twice before its opponent moves at
    // all: only the first of those two slots is where it lands.
    state.units = [
      { ...state.units[0], definition: { ...GOBLIN, initiative: 20 } },
      { ...state.units[1], atb: 0 },
    ];

    const entries = turnBarEntries(state, 'wait').slice(0, 3);

    expect(entries.map(e => e.unit.id)).toEqual(['a', 'a', 'b']);
    expect(entries.map(e => e.isProjected)).toEqual([true, false, false]);
  });

  it('marks where the acting stack lands rather than where it stands', () => {
    const entries = turnBarEntries(standoff(), 'defend').slice(0, 3);

    // Nothing is "acting now" in a projection — the amber ring would otherwise
    // promote whichever stack happens to lead the hypothetical order.
    expect(entries.every(e => !e.isCurrent)).toBe(true);
    expect(entries.map(e => e.isProjected)).toEqual([false, true, false]);
  });
});
