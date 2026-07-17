import { describe, it, expect } from 'vitest';
import { UNIT_COSTS, armyCost, generateEnemyArmy, filterToUnlockedTiers, DEFAULT_BUDGET } from '../recruit';
import { maxUnlockedTier, tierUnlockLevel, isTierUnlocked, TIER_UNLOCK_LEVELS } from '../progression';
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

describe('tier unlocks', () => {
  it('follows the unlock schedule at its boundaries', () => {
    expect(maxUnlockedTier(1)).toBe(2);
    expect(maxUnlockedTier(2)).toBe(3);
    expect(maxUnlockedTier(3)).toBe(3);
    expect(maxUnlockedTier(4)).toBe(4);
    expect(maxUnlockedTier(6)).toBe(5);
    expect(maxUnlockedTier(8)).toBe(6);
    expect(maxUnlockedTier(9)).toBe(6);
    expect(maxUnlockedTier(10)).toBe(7);
    expect(maxUnlockedTier(99)).toBe(7);
  });

  it('tierUnlockLevel and isTierUnlocked agree with the schedule table', () => {
    for (let tier = 1 as const; tier <= 7; tier++) {
      const t = tier as 1 | 2 | 3 | 4 | 5 | 6 | 7;
      const lvl = tierUnlockLevel(t);
      expect(lvl).toBe(TIER_UNLOCK_LEVELS[t - 1]);
      expect(isTierUnlocked(lvl, t)).toBe(true);
      if (lvl > 1) expect(isTierUnlocked(lvl - 1, t)).toBe(false);
    }
  });

  it('filterToUnlockedTiers drops locked slots and keeps unlocked ones', () => {
    const behemoth = BARBARIAN_UNITS.find(u => u.tier === 7)!;
    const army = [
      { unit: GOBLIN, count: 10 },
      { unit: behemoth, count: 2 },
    ];
    expect(filterToUnlockedTiers(army, 1)).toEqual([{ unit: GOBLIN, count: 10 }]);
    expect(filterToUnlockedTiers(army, 10)).toEqual(army);
  });

  it('generateEnemyArmy respects maxTier across many seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const army = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(seed), 2);
      for (const slot of army) expect(slot.unit.tier).toBeLessThanOrEqual(2);
    }
  });

  it('goblin top-up still fires when only tier 1 is available', () => {
    const army = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(3), 1);
    expect(army).toHaveLength(1);
    expect(army[0].unit.name).toBe('Goblin');
    expect(armyCost(army)).toBeGreaterThanOrEqual(DEFAULT_BUDGET * 0.9);
  });
});
