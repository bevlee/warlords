import { describe, it, expect } from 'vitest';
import {
  getSkillLevel,
  applyOffenseBonus,
  applyArmorerBonus,
  getMoraleBonus,
  getSorceryMultiplier,
  updateFactionSkills,
} from '../factionSkills';
import type { Hero } from '../types';

function makeHero(overrides: Partial<Hero>): Hero {
  return {
    class: 'barbarian',
    level: 1,
    xp: 0,
    attack: 0,
    defense: 0,
    statPoints: 0,
    factionSkills: [],
    ...overrides,
  };
}

describe('updateFactionSkills', () => {
  it('barbarian: only offense unlocked at level 1', () => {
    const hero = updateFactionSkills(makeHero({ level: 1 }));
    expect(hero.factionSkills.map(s => s.id)).toEqual(['offense']);
    expect(hero.factionSkills[0].level).toBe(1);
  });

  it('barbarian: armorer unlocks at level 3, leadership at level 5', () => {
    const l3 = updateFactionSkills(makeHero({ level: 3 }));
    expect(l3.factionSkills.map(s => s.id).sort()).toEqual(['armorer', 'offense']);

    const l5 = updateFactionSkills(makeHero({ level: 5 }));
    expect(l5.factionSkills.map(s => s.id).sort()).toEqual(['armorer', 'leadership', 'offense']);
  });

  it('skill level advances every 3 levels above unlock, capped at 3', () => {
    const atUnlock = updateFactionSkills(makeHero({ level: 1 }));
    expect(atUnlock.factionSkills.find(s => s.id === 'offense')?.level).toBe(1);

    const plus3 = updateFactionSkills(makeHero({ level: 4 }));
    expect(plus3.factionSkills.find(s => s.id === 'offense')?.level).toBe(2);

    const plus6 = updateFactionSkills(makeHero({ level: 7 }));
    expect(plus6.factionSkills.find(s => s.id === 'offense')?.level).toBe(3);

    const plus99 = updateFactionSkills(makeHero({ level: 50 }));
    expect(plus99.factionSkills.find(s => s.id === 'offense')?.level).toBe(3);
  });

  it('knight and wizard have their own skill sets', () => {
    const knight = updateFactionSkills(makeHero({ class: 'knight', level: 1 }));
    expect(knight.factionSkills.map(s => s.id)).toEqual(['tactics']);

    const wizard = updateFactionSkills(makeHero({ class: 'wizard', level: 1 }));
    expect(wizard.factionSkills.map(s => s.id)).toEqual(['sorcery']);
  });
});

describe('getSkillLevel', () => {
  it('returns 0 when the skill has not been unlocked', () => {
    const hero = updateFactionSkills(makeHero({ level: 1 }));
    expect(getSkillLevel(hero, 'armorer')).toBe(0);
  });

  it('returns the unlocked level', () => {
    const hero = updateFactionSkills(makeHero({ level: 4 }));
    expect(getSkillLevel(hero, 'offense')).toBe(2);
  });
});

describe('applyOffenseBonus', () => {
  it('adds no bonus when offense is not unlocked', () => {
    const hero = makeHero({ factionSkills: [] });
    expect(applyOffenseBonus(100, hero)).toBe(100);
  });

  it('adds 3% per skill level for barbarians', () => {
    const hero = updateFactionSkills(makeHero({ level: 1 })); // offense lvl 1
    expect(applyOffenseBonus(100, hero)).toBe(103);
  });
});

describe('applyArmorerBonus', () => {
  it('reduces damage by 3% per level for barbarians', () => {
    const hero = updateFactionSkills(makeHero({ level: 3 })); // armorer lvl 1
    expect(applyArmorerBonus(100, hero)).toBe(97);
  });

  it('reduces damage by 5% per level for knights', () => {
    const hero = updateFactionSkills(makeHero({ class: 'knight', level: 2 })); // armorer lvl 1
    expect(applyArmorerBonus(100, hero)).toBe(95);
  });

  it('never reduces damage below 1', () => {
    const hero = updateFactionSkills(makeHero({ level: 3 }));
    expect(applyArmorerBonus(1, hero)).toBe(1);
  });
});

describe('getMoraleBonus', () => {
  it('is 0 before leadership unlocks', () => {
    const hero = updateFactionSkills(makeHero({ level: 1 }));
    expect(getMoraleBonus(hero)).toBe(0);
  });

  it('matches the leadership skill level once unlocked', () => {
    const hero = updateFactionSkills(makeHero({ level: 5 })); // leadership lvl 1
    expect(getMoraleBonus(hero)).toBe(1);
  });
});

describe('getSorceryMultiplier', () => {
  it('is 1 with no sorcery', () => {
    expect(getSorceryMultiplier(makeHero({ class: 'wizard', factionSkills: [] }))).toBe(1);
  });

  it('adds 5% per level for wizards', () => {
    const hero = updateFactionSkills(makeHero({ class: 'wizard', level: 1 })); // sorcery lvl 1
    expect(getSorceryMultiplier(hero)).toBe(1.05);
  });
});
