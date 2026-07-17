import { describe, it, expect } from 'vitest';
import { modifiedDamage, calculateDamage, canRetaliate } from '../combat';
import { CAVALIER, GRIFFIN } from '../knight';
import { GORGON, NAGA } from '../wizard';
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

describe('attack/defense modifier (uncapped)', () => {
  const dmg = 10;

  it('scales +5% per point of attack over defense, past the old 20-point cap', () => {
    // atk − def = 40 → ×(1 + 0.05·40) = ×3.0 (the old cap held this at ×2.0).
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 45 } });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 5 }, side: 'enemy' });
    expect(modifiedDamage(attacker, defender, 0, dmg)).toBeCloseTo(dmg * 10 * 3.0, 5);
  });

  it('scales damage down past the old 20-point cap when out-defended', () => {
    // def − atk = 40 → ÷(1 + 0.05·40) = ÷3.0 (the old cap held this at ÷2.0).
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 5 } });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 45 }, side: 'enemy' });
    expect(modifiedDamage(attacker, defender, 0, dmg)).toBeCloseTo((dmg * 10) / 3.0, 5);
  });
});

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

describe('Unlimited Retaliation (Griffin)', () => {
  it('can retaliate again even after already retaliating this turn', () => {
    const griffin = makeStack({ definition: GRIFFIN, hasRetaliated: true });
    expect(canRetaliate(griffin)).toBe(true);
  });

  it('a normal unit cannot retaliate twice', () => {
    const goblin = makeStack({ definition: GOBLIN, hasRetaliated: true });
    expect(canRetaliate(goblin)).toBe(false);
  });
});

describe('No Enemy Retaliation (Monk/Naga/Titan) blocks the defender, not just itself', () => {
  it('the defender cannot retaliate when the attacker has no_retaliation', () => {
    const attacker = makeStack({ definition: NAGA });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', hasRetaliated: false });
    expect(canRetaliate(defender, attacker)).toBe(false);
  });

  it('the defender can still retaliate against an attacker without the ability', () => {
    const attacker = makeStack({ definition: GOBLIN });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', hasRetaliated: false });
    expect(canRetaliate(defender, attacker)).toBe(true);
  });

  it('a defender with its own no_retaliation still cannot retaliate, attacker ability aside', () => {
    const attacker = makeStack({ definition: GOBLIN });
    const defender = makeStack({ definition: NAGA, side: 'enemy', hasRetaliated: false });
    expect(canRetaliate(defender, attacker)).toBe(false);
  });
});

describe('luck reporting', () => {
  // rng order: damage roll, then the luck roll (0.125 * luck to fire).
  it('reports a good-luck double and doubles the damage', () => {
    const attacker = makeStack({ luck: 3 });
    const defender = makeStack({ side: 'enemy' });
    const sink: { luck: 'good' | 'bad' | null } = { luck: null };

    const lucky = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.01]), sink);
    const plain = calculateDamage(makeStack({ luck: 0 }), defender, 0, sequenceRng([0, 0.01]));

    expect(sink.luck).toBe('good');
    // Doubling happens pre-rounding, so this is 2x within a rounding step.
    expect(lucky).toBeCloseTo(plain * 2, -0.5);
    expect(lucky).toBeGreaterThan(plain);
  });

  it('reports a bad-luck halving', () => {
    const attacker = makeStack({ luck: -3 });
    const defender = makeStack({ side: 'enemy' });
    const sink: { luck: 'good' | 'bad' | null } = { luck: null };

    calculateDamage(attacker, defender, 0, sequenceRng([0, 0.01]), sink);

    expect(sink.luck).toBe('bad');
  });

  it('reports nothing when the roll misses', () => {
    const attacker = makeStack({ luck: 3 });
    const defender = makeStack({ side: 'enemy' });
    const sink: { luck: 'good' | 'bad' | null } = { luck: null };

    calculateDamage(attacker, defender, 0, sequenceRng([0, 0.99]), sink);

    expect(sink.luck).toBeNull();
  });

  it('leaves the rng sequence untouched for a zero-luck stack', () => {
    // The sink must not perturb existing seeded expectations: no luck, no roll.
    const defender = makeStack({ side: 'enemy' });
    const withSink = calculateDamage(makeStack({ luck: 0 }), defender, 0, sequenceRng([0, 0.01]), { luck: null });
    const withoutSink = calculateDamage(makeStack({ luck: 0 }), defender, 0, sequenceRng([0, 0.01]));

    expect(withSink).toBe(withoutSink);
  });
});
