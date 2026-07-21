import type { Hero } from './types.ts';

/** Cumulative XP required to reach a level: 100·L·(L−1). */
export function xpToReach(level: number): number {
  return 100 * level * (level - 1);
}

/** Recruiting budget for both sides at a given hero level. */
export function budgetForLevel(level: number): number {
  return 300 + 50 * (level - 1);
}

/** Highest unit tier the hero may recruit: tier 2 at level 1, +1 per level, capped at 7. */
export function maxRecruitTier(level: number): number {
  return Math.min(7, level + 1);
}

/** Full recruiting budget: the level budget plus gold won in the campaign. */
export function recruitBudget(hero: Hero): number {
  return budgetForLevel(hero.level) + (hero.gold ?? 0);
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

/** Victory rewards in one step: XP (with level-ups) plus gold credited to the
 *  campaign wallet. Free-play passes goldReward 0 — XP only. */
export function applyVictory(hero: Hero, xp: number, goldReward: number): { hero: Hero; levels: number } {
  const { hero: next, levels } = applyXp(hero, xp);
  return { hero: { ...next, gold: (hero.gold ?? 0) + goldReward }, levels };
}
