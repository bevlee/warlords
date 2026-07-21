import { describe, it, expect } from 'vitest';
import { xpToReach, applyXp, applyVictory, budgetForLevel, maxRecruitTier, recruitBudget } from '../progression';
import type { Hero } from '../types';

const freshHero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [] };

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

  it('recruit tier starts at 2 and unlocks one per level, capped at 7', () => {
    expect(maxRecruitTier(1)).toBe(2);
    expect(maxRecruitTier(2)).toBe(3);
    expect(maxRecruitTier(6)).toBe(7);
    expect(maxRecruitTier(20)).toBe(7);
  });

  it('recruitBudget adds campaign gold to the level budget', () => {
    expect(recruitBudget(freshHero)).toBe(300);
    expect(recruitBudget({ ...freshHero, gold: 180 })).toBe(480);
    expect(recruitBudget({ ...freshHero, level: 3, gold: 50 })).toBe(450);
  });
});

describe('applyVictory', () => {
  it('credits gold on top of XP level-ups (campaign win)', () => {
    const { hero, levels } = applyVictory({ ...freshHero, gold: 20 }, 250, 80);
    expect(hero.gold).toBe(100);
    expect(hero.xp).toBe(250);
    expect(levels).toBeGreaterThanOrEqual(1); // 250 xp crosses level 2
    expect(hero.level).toBe(1 + levels);
  });

  it('free-play (goldReward 0) leaves gold untouched', () => {
    const { hero } = applyVictory({ ...freshHero, gold: 55 }, 40, 0);
    expect(hero.gold).toBe(55);
  });

  it('defaults a missing gold field to 0', () => {
    const { hero } = applyVictory(freshHero, 10, 30);
    expect(hero.gold).toBe(30);
  });
});
