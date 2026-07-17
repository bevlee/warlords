import type { Hero, UnitDef } from './types';

/** Cumulative XP required to reach a level: 100·L·(L−1). */
export function xpToReach(level: number): number {
  return 100 * level * (level - 1);
}

/** Hero level at which each tier (index 0 = tier 1) becomes recruitable.
 *  Tuned against budgetForLevel: tier 7 (100–180 gold) opens at level 10,
 *  when the 750-gold budget buys a meaningful count rather than one token. */
export const TIER_UNLOCK_LEVELS: readonly number[] = [1, 1, 2, 4, 6, 8, 10];

export function tierUnlockLevel(tier: UnitDef['tier']): number {
  return TIER_UNLOCK_LEVELS[tier - 1];
}

export function isTierUnlocked(level: number, tier: UnitDef['tier']): boolean {
  return level >= tierUnlockLevel(tier);
}

export function maxUnlockedTier(level: number): UnitDef['tier'] {
  let t = 1;
  for (let i = 0; i < TIER_UNLOCK_LEVELS.length; i++) {
    if (level >= TIER_UNLOCK_LEVELS[i]) t = i + 1;
  }
  return t as UnitDef['tier'];
}

/** Recruiting budget for both sides at a given hero level. */
export function budgetForLevel(level: number): number {
  return 300 + 50 * (level - 1);
}

/**
 * Add XP and resolve any level-ups (+1 attack, +1 defense, +1 augment point
 * per level). Returns the updated hero and how many levels were gained.
 */
export function applyXp(hero: Hero, gained: number): { hero: Hero; levels: number } {
  const xp = hero.xp + gained;
  let { level, attack, defense } = hero;
  let levels = 0;

  while (xp >= xpToReach(level + 1)) {
    level += 1;
    attack += 1;
    defense += 1;
    levels += 1;
  }

  return {
    hero: { ...hero, xp, level, attack, defense, augmentPoints: (hero.augmentPoints ?? 0) + levels },
    levels,
  };
}
