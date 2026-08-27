import { describe, it, expect } from 'vitest';
import { UNIT_COSTS, armyCost, generateEnemyArmy, mergeArmySlots, recruitLimit, DEFAULT_BUDGET, MAX_STACKS } from '../recruit';
import { BARBARIAN_UNITS, GOBLIN, OGRE } from '../barbarian';
import { mulberry32 } from '../rng';

describe('recruiting', () => {
  it('merges same-unit loadout entries without changing first-seen order', () => {
    expect(mergeArmySlots([
      { unit: GOBLIN, count: 4 },
      { unit: OGRE, count: 2 },
      { unit: GOBLIN, count: 6 },
    ])).toEqual([
      { unit: GOBLIN, count: 10 },
      { unit: OGRE, count: 2 },
    ]);
  });

  it('prices every barbarian unit', () => {
    for (const u of BARBARIAN_UNITS) {
      expect(UNIT_COSTS[u.name]).toBeGreaterThan(0);
    }
  });

  it('armyCost sums count × price', () => {
    const cost = armyCost([
      { unit: GOBLIN, count: 10 }, // 10 × 3
      { unit: OGRE, count: 2 },    // 2 × 25
    ]);
    expect(cost).toBe(10 * UNIT_COSTS.Goblin + 2 * UNIT_COSTS.Ogre);
  });

  it('generateEnemyArmy stays within budget, spends most of it, and respects the stack cap', () => {
    for (const seed of [1, 7, 42, 999]) {
      const army = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(seed));
      const cost = armyCost(army);

      expect(cost).toBeLessThanOrEqual(DEFAULT_BUDGET);
      expect(cost).toBeGreaterThanOrEqual(DEFAULT_BUDGET * 0.7);
      expect(army.length).toBeGreaterThanOrEqual(1);
      expect(army.length).toBeLessThanOrEqual(MAX_STACKS);
      for (const slot of army) expect(slot.count).toBeGreaterThan(0);
    }
  });

  it('never fields units above maxTier, keeping the budget invariants', () => {
    for (const seed of [1, 7, 42, 999]) {
      const army = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(seed), 2);
      const cost = armyCost(army);

      for (const slot of army) expect(slot.unit.tier).toBeLessThanOrEqual(2);
      expect(cost).toBeLessThanOrEqual(DEFAULT_BUDGET);
      expect(cost).toBeGreaterThanOrEqual(DEFAULT_BUDGET * 0.7);
    }
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    const a = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(5));
    const b = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(5));
    const c = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(6));

    const shape = (army: typeof a) => army.map(s => `${s.unit.name}x${s.count}`).join(',');
    expect(shape(a)).toBe(shape(b));
    expect(shape(a)).not.toBe(shape(c));
  });
});

describe('recruitLimit', () => {
  const open = { cost: 10, count: 0, goldLeft: 100, locked: false, atStackCap: false };

  it('reaches as far as the unspent gold affords', () => {
    expect(recruitLimit(open)).toEqual({ max: 10, blocked: null });
  });

  it("counts the row's own troops on top of what the rest of the gold buys", () => {
    // 300 budget, 12 already recruited at 10 each → 180 left, so 12 + 18.
    expect(recruitLimit({ ...open, count: 12, goldLeft: 180 }).max).toBe(30);
  });

  it('stops where the gold does', () => {
    expect(recruitLimit({ ...open, count: 30, goldLeft: 0 }).max).toBe(30);
    expect(recruitLimit({ ...open, count: 30, goldLeft: 9 }).max).toBe(30);
  });

  it('raises a row ceiling when gold is freed elsewhere', () => {
    const tight = recruitLimit({ ...open, count: 5, goldLeft: 0 });
    const freed = recruitLimit({ ...open, count: 5, goldLeft: 250 });
    expect(tight.max).toBe(5);
    expect(freed.max).toBe(30);
  });

  it('refuses a locked tier outright', () => {
    expect(recruitLimit({ ...open, locked: true, goldLeft: 999 })).toEqual({ max: 0, blocked: 'locked' });
  });

  it('refuses a new stack at the cap but still resizes the existing ones', () => {
    expect(recruitLimit({ ...open, atStackCap: true })).toEqual({ max: 0, blocked: 'stacks' });
    expect(recruitLimit({ ...open, atStackCap: true, count: 4 })).toEqual({ max: 14, blocked: null });
  });

  it('holds a priceless unit at its current count rather than an infinite one', () => {
    expect(recruitLimit({ ...open, cost: 0, count: 3 })).toEqual({ max: 3, blocked: null });
  });
});
