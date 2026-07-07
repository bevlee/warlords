import { describe, it, expect } from 'vitest';
import { modifiedDamage, calculateDamage } from '../combat';
import { CAVALIER } from '../knight';
import { GORGON } from '../wizard';
import { GOBLIN } from '../barbarian';
import type { UnitStack } from '../types';

function makeStack(overrides: Partial<UnitStack>): UnitStack {
  return {
    id: 'test-' + Math.random(),
    definition: GOBLIN,
    count: 10,
    hp: GOBLIN.hp,
    pos: { col: 0, row: 0 },
    side: 'player',
    hasRetaliated: false,
    shotsLeft: 0,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    ...overrides,
  };
}

/** Fake rng that returns a fixed sequence of values, one per call. */
function sequenceRng(values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('Jousting (Cavalier/Champion)', () => {
  // attack === defense cancels out the usual attack/defense modifier, isolating jousting.
  const evenDefender = () => makeStack({ definition: { ...GOBLIN, defense: CAVALIER.attack }, side: 'enemy' });

  it('adds no bonus when the attacker has not moved', () => {
    const attacker = makeStack({ definition: CAVALIER, pos: { col: 5, row: 5 } });
    const base = modifiedDamage(attacker, evenDefender(), 0, 20);
    expect(base).toBe(20 * attacker.count);
  });

  it('adds +5% damage per cell moved before the attack', () => {
    const defender = evenDefender();
    const stationary = makeStack({ definition: CAVALIER, pos: { col: 5, row: 5 } });
    const charged = makeStack({
      definition: CAVALIER,
      pos: { col: 8, row: 5 },
      lastMovedFrom: { col: 5, row: 5 }, // moved 3 cells
    });

    const baseDamage = modifiedDamage(stationary, defender, 0, 20);
    const chargedDamage = modifiedDamage(charged, defender, 0, 20);

    expect(chargedDamage).toBeCloseTo(baseDamage * 1.15, 5); // +5% * 3 cells
  });

  it('does not apply to units without the jousting ability', () => {
    const attacker = makeStack({
      definition: { ...GOBLIN, defense: GOBLIN.attack },
      pos: { col: 8, row: 5 },
      lastMovedFrom: { col: 5, row: 5 },
    });
    const defender = makeStack({ definition: { ...GOBLIN, defense: attacker.definition.attack }, side: 'enemy' });
    expect(modifiedDamage(attacker, defender, 0, 20)).toBe(20 * attacker.count);
  });
});

describe('Death Stare (Gorgon)', () => {
  it('adds a full creature worth of bonus damage on proc', () => {
    const attacker = makeStack({ definition: GORGON, count: 1 });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', count: 10 });
    // first call: damage roll fraction; second call: death-stare proc roll (< 0.1 procs)
    const rng = sequenceRng([0, 0.05]);
    const damage = calculateDamage(attacker, defender, 0, rng);
    const withoutProc = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.5]));
    expect(damage).toBe(withoutProc + GOBLIN.hp);
  });

  it('does not proc when the roll misses', () => {
    const attacker = makeStack({ definition: GORGON, count: 1 });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', count: 10 });
    const rng = sequenceRng([0, 0.5]);
    const damage = calculateDamage(attacker, defender, 0, rng);
    const dmgPerCreature = GORGON.minDamage;
    const expectedBase = Math.max(1, Math.round(modifiedDamage(attacker, defender, 0, dmgPerCreature)));
    expect(damage).toBe(expectedBase);
  });

  it('does not apply to units without death_stare', () => {
    const attacker = makeStack({ definition: GOBLIN, count: 1 });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', count: 10 });
    const damage = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.01]));
    expect(damage).toBeLessThan(GOBLIN.hp); // no death-stare bonus tacked on
  });
});
