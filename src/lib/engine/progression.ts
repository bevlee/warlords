import type { Hero } from './types';

/** Cumulative XP required to reach a level: 100·L·(L−1). */
export function xpToReach(level: number): number {
  return 100 * level * (level - 1);
}

/** Recruiting budget for both sides at a given hero level. */
export function budgetForLevel(level: number): number {
  return 300 + 50 * (level - 1);
}

/**
 * Add XP and resolve any level-ups (+1 attack, +1 defense per level).
 * Returns the updated hero and how many levels were gained.
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

  return { hero: { ...hero, xp, level, attack, defense }, levels };
}
