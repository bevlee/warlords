import { describe, it, expect } from 'vitest';
import { modifiedDamage, calculateDamage, canRetaliate } from '../combat';
import { initBattle, applyAction } from '../battle';
import { CHAMPION, GRIFFIN } from '../knight';
import { BILEHORN, NAGA } from '../wizard';
import { GOBLIN } from '../barbarian';
import { setOccupant } from '../grid';
import type { Hero, UnitDef, UnitStack } from '../types';

function makeStack(overrides: Partial<UnitStack>): UnitStack {
  return {
    id: 'test-' + Math.random(),
    definition: GOBLIN,
    count: 10,
    startCount: 10,
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

function placeAdjacent(state: ReturnType<typeof initBattle>, attackerId: string, targetId: string) {
  const attacker = state.units.find(unit => unit.id === attackerId)!;
  const target = state.units.find(unit => unit.id === targetId)!;
  const to = [[-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    .map(([dc, dr]) => ({ col: target.pos.col + dc, row: target.pos.row + dr }))
    .find(pos => state.grid.cells[pos.row]?.[pos.col] && !state.grid.cells[pos.row][pos.col].blocked && !state.grid.cells[pos.row][pos.col].occupantId)!;
  return {
    ...state,
    phase: 'combat' as const,
    grid: setOccupant(setOccupant(state.grid, attacker.pos, null), to, attacker.id),
    units: state.units.map(unit => unit.id === attacker.id ? { ...unit, pos: to } : unit),
  };
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

describe('Grand Joust (Champion)', () => {
  // attack === defense cancels out the usual attack/defense modifier, isolating jousting.
  const evenDefender = () => makeStack({ definition: { ...GOBLIN, defense: CHAMPION.attack }, side: 'enemy' });

  it('adds no bonus when the attacker has not moved', () => {
    const attacker = makeStack({ definition: CHAMPION, pos: { col: 5, row: 5 } });
    const base = modifiedDamage(attacker, evenDefender(), 0, 20);
    expect(base).toBe(20 * attacker.count);
  });

  it('leaves positional Grand Joust scaling to battle action context', () => {
    const defender = evenDefender();
    const stationary = makeStack({ definition: CHAMPION, pos: { col: 5, row: 5 } });
    const charged = makeStack({
      definition: CHAMPION,
      pos: { col: 8, row: 5 },
      lastMovedFrom: { col: 5, row: 5 }, // moved 3 cells
    });

    const baseDamage = modifiedDamage(stationary, defender, 0, 20);
    const chargedDamage = modifiedDamage(charged, defender, 0, 20);

    expect(chargedDamage).toBe(baseDamage);
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

describe('Bilehorn replacement', () => {
  it('has deterministic ordinary attack damage rather than Death Stare executions', () => {
    const attacker = makeStack({ definition: BILEHORN, count: 1 });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', count: 10 });
    const lowSecondaryRoll = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.01]));
    const highSecondaryRoll = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.99]));
    expect(lowSecondaryRoll).toBe(highSecondaryRoll);
    expect(BILEHORN.abilities).not.toContain('death_stare');
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

  it('a defender with its own no_retaliation still retaliates when it is hit', () => {
    const attacker = makeStack({ definition: GOBLIN });
    const defender = makeStack({ definition: NAGA, side: 'enemy', hasRetaliated: false });
    expect(canRetaliate(defender, attacker)).toBe(true);
  });

  it('a no_retaliation defender still only retaliates once per turn', () => {
    const attacker = makeStack({ definition: GOBLIN });
    const defender = makeStack({ definition: NAGA, side: 'enemy', hasRetaliated: true });
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

describe('Double strike', () => {
  const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] };
  const DOUBLER: UnitDef = { ...GOBLIN, name: 'Doubler', attack: 5, minDamage: 2, maxDamage: 2, hp: 50, abilities: ['double_strike'] };

  /** Wait until the named unit is current, then melee the lone enemy from an adjacent cell. */
  function driveMeleeHit(attackerDef: UnitDef, enemyDef: UnitDef, seed = 7) {
    let s = initBattle([{ unit: attackerDef, count: 5 }], [{ unit: enemyDef, count: 1 }], hero, seed);
    for (let i = 0; i < 40 && s.units.find(u => u.id === s.currentUnitId)?.definition.name !== attackerDef.name; i++) {
      s = applyAction(s, { type: 'wait' });
    }
    const enemy = s.units.find(u => u.side === 'enemy')!;
    const attacker = s.units.find(u => u.definition.name === attackerDef.name)!;
    s = placeAdjacent(s, attacker.id, enemy.id);
    const next = applyAction(s, { type: 'attack', targetId: enemy.id });
    return { next, before: s, attackerId: s.units.find(u => u.definition.name === attackerDef.name)!.id };
  }

  it('logs two attack entries for one melee action', () => {
    const tanky: UnitDef = { ...GOBLIN, name: 'Tank', hp: 500, defense: 0, minDamage: 1, maxDamage: 1 };
    const { next, before, attackerId } = driveMeleeHit(DOUBLER, tanky);
    const newAttacks = next.log.slice(before.log.length).filter(e => e.type === 'attack' && e.data.attackerId === attackerId);
    expect(newAttacks).toHaveLength(2);
  });

  it('retaliation happens once, between the two hits', () => {
    const tanky: UnitDef = { ...GOBLIN, name: 'Tank', hp: 500, defense: 0, minDamage: 1, maxDamage: 1 };
    const { next, before } = driveMeleeHit(DOUBLER, tanky);
    const types = next.log.slice(before.log.length).filter(e => ['attack', 'retaliate'].includes(e.type)).map(e => e.type);
    expect(types).toEqual(['attack', 'retaliate', 'attack']);
  });

  it('second hit is skipped when the target dies to the first', () => {
    const frail: UnitDef = { ...GOBLIN, name: 'Frail', hp: 1, defense: 0 };
    const { next, before, attackerId } = driveMeleeHit(DOUBLER, frail);
    const entries = next.log.slice(before.log.length);
    expect(entries.filter(e => e.type === 'attack' && e.data.attackerId === attackerId)).toHaveLength(1);
    expect(entries.some(e => e.type === 'death')).toBe(true);
  });

  it('units without the ability strike once', () => {
    const single: UnitDef = { ...DOUBLER, name: 'Single', abilities: [] };
    const tanky: UnitDef = { ...GOBLIN, name: 'Tank', hp: 500, defense: 0, minDamage: 1, maxDamage: 1 };
    const { next, before, attackerId } = driveMeleeHit(single, tanky);
    expect(next.log.slice(before.log.length).filter(e => e.type === 'attack' && e.data.attackerId === attackerId)).toHaveLength(1);
  });
});

describe('leveled defense reduction', () => {
  it('reduces target defense by 5% per level', () => {
    // level 4 → ×0.8 (was a flat ×0.6 pre-catalog)
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 10, abilities: ['defense_reduction'], abilityLevels: { defense_reduction: 4 } } });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 10 }, side: 'enemy' });
    const plain = makeStack({ definition: { ...GOBLIN, attack: 10 } });
    // atk 10 vs def 8 (10×0.8) → ×1.10; plain attacker: atk 10 vs def 10 → ×1
    expect(modifiedDamage(attacker, defender, 0, 10)).toBeCloseTo(10 * attacker.count * 1.10, 5);
    expect(modifiedDamage(plain, defender, 0, 10)).toBe(10 * plain.count);
  });

  it('legacy defs without a level keep the old 40% (level 8)', () => {
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 10, abilities: ['defense_reduction'] } });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 10 }, side: 'enemy' });
    // def 10 × 0.6 = 6 → atk 10 vs def 6 → ×1.20
    expect(modifiedDamage(attacker, defender, 0, 10)).toBeCloseTo(10 * attacker.count * 1.20, 5);
  });
});

describe('leveled lifesteal', () => {
  const hero2: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] };

  function driveHit(attackerDef: UnitDef) {
    let s = initBattle([{ unit: attackerDef, count: 2 }], [{ unit: { ...GOBLIN, name: 'Tank', hp: 500, defense: 0, minDamage: 0, maxDamage: 0 }, count: 1 }], hero2, 7);
    for (let i = 0; i < 40 && s.units.find(u => u.id === s.currentUnitId)?.definition.name !== attackerDef.name; i++) {
      s = applyAction(s, { type: 'wait' });
    }
    const enemy = s.units.find(u => u.side === 'enemy')!;
    // Wound the striker first — the heal only logs when hp actually rises.
    s = { ...s, units: s.units.map(u => (u.definition.name === attackerDef.name ? { ...u, hp: 1 } : u)) };
    const attacker = s.units.find(u => u.definition.name === attackerDef.name)!;
    s = placeAdjacent(s, attacker.id, enemy.id);
    return applyAction(s, { type: 'attack', targetId: enemy.id });
  }

  it('heals 10% per level of damage dealt', () => {
    const LEECH: UnitDef = { ...GOBLIN, name: 'Leech', hp: 100, attack: 0, minDamage: 10, maxDamage: 10, abilities: ['life_drain'], abilityLevels: { life_drain: 5 } };
    const next = driveHit(LEECH);
    const ev = next.log.find(e => e.type === 'status' && e.data.effect === 'life_drain');
    const atk = next.log.find(e => e.type === 'attack');
    expect(ev).toBeTruthy();
    // heal = round(damage × 0.5) for the whole stack (not divided by count)
    expect(ev!.data.heal).toBe(Math.round((atk!.data.damage as number) * 0.5));
  });

  it('revives fallen creatures up to the starting stack count', () => {
    // 100% lifesteal, big single-hit damage. Starts at 2 creatures; knock it
    // down to 1 wounded creature, then a hit that heals more than one
    // creature's worth revives the fallen one.
    const VAMP: UnitDef = { ...GOBLIN, name: 'Vamp', hp: 30, attack: 0, minDamage: 60, maxDamage: 60, abilities: ['life_drain'], abilityLevels: { life_drain: 10 } };
    let s = initBattle([{ unit: VAMP, count: 2 }], [{ unit: { ...GOBLIN, name: 'Tank', hp: 500, defense: 0, minDamage: 0, maxDamage: 0 }, count: 1 }], hero2, 7);
    for (let i = 0; i < 40 && s.units.find(u => u.id === s.currentUnitId)?.definition.name !== 'Vamp'; i++) {
      s = applyAction(s, { type: 'wait' });
    }
    const enemy = s.units.find(u => u.side === 'enemy')!;
    // Knock the vamp down to a single wounded creature (count 1, hp 5).
    s = { ...s, units: s.units.map(u => (u.definition.name === 'Vamp' ? { ...u, count: 1, hp: 5 } : u)) };
    const vampBefore = s.units.find(u => u.definition.name === 'Vamp')!;
    s = placeAdjacent(s, vampBefore.id, enemy.id);
    const next = applyAction(s, { type: 'attack', targetId: enemy.id });
    const vamp = next.units.find(u => u.definition.name === 'Vamp')!;
    // Damage 60 at 100% lifesteal fills the wounded creature (5->30) and
    // revives the second, but never past startCount = 2.
    expect(vamp.count).toBe(2);
    const ev = next.log.find(e => e.type === 'status' && e.data.effect === 'life_drain');
    expect(ev!.data.revived).toBe(1);
  });
});
