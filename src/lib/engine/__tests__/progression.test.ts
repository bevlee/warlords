import { describe, it, expect } from 'vitest';
import { xpToReach, applyXp, budgetForLevel } from '../progression';
import type { Hero } from '../types';

const freshHero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0 };

describe('progression', () => {
  it('xp curve: level 2 at 200, level 3 at 600, level 4 at 1200', () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(200);
    expect(xpToReach(3)).toBe(600);
    expect(xpToReach(4)).toBe(1200);
  });

  it('applyXp levels up once with +1 attack/defense', () => {
    const { hero, levels } = applyXp(freshHero, 250);

    expect(levels).toBe(1);
    expect(hero.level).toBe(2);
    expect(hero.xp).toBe(250);
    expect(hero.attack).toBe(3);
    expect(hero.defense).toBe(2);
  });

  it('applyXp handles multi-level jumps', () => {
    const { hero, levels } = applyXp(freshHero, 700); // past level 3 (600)

    expect(levels).toBe(2);
    expect(hero.level).toBe(3);
    expect(hero.attack).toBe(4);
    expect(hero.defense).toBe(3);
  });

  it('applyXp below the threshold changes nothing but xp', () => {
    const { hero, levels } = applyXp(freshHero, 150);

    expect(levels).toBe(0);
    expect(hero).toEqual({ ...freshHero, xp: 150 });
  });

  it('budget grows 50 gold per level', () => {
    expect(budgetForLevel(1)).toBe(300);
    expect(budgetForLevel(3)).toBe(400);
  });
});
