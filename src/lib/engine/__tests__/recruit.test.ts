import { describe, it, expect } from 'vitest';
import { UNIT_COSTS, armyCost, generateEnemyArmy, DEFAULT_BUDGET } from '../recruit';
import { BARBARIAN_UNITS, GOBLIN, OGRE } from '../barbarian';
import { mulberry32 } from '../rng';

describe('recruiting', () => {
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

  it('generateEnemyArmy stays within budget, spends most of it, fields 1–6 stacks', () => {
    for (const seed of [1, 7, 42, 999]) {
      const army = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(seed));
      const cost = armyCost(army);

      expect(cost).toBeLessThanOrEqual(DEFAULT_BUDGET);
      expect(cost).toBeGreaterThanOrEqual(DEFAULT_BUDGET * 0.7);
      expect(army.length).toBeGreaterThanOrEqual(1);
      expect(army.length).toBeLessThanOrEqual(6);
      for (const slot of army) expect(slot.count).toBeGreaterThan(0);
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
