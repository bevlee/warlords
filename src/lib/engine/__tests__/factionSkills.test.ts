import { describe, it, expect } from 'vitest';
import {
  getSkillLevel,
  applyOffenseBonus,
  applyArmorerBonus,
  getMoraleBonus,
  getSorceryMultiplier,
  maxMana,
  updateFactionSkills,
} from '../factionSkills';
import type { Hero } from '../types';

const skill = (id: string, level: 1 | 2 | 3) => ({ id, level, name: id, description: id });

function makeHero(overrides: Partial<Hero> = {}): Hero {
  return {
    class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1,
    statPoints: 0, factionSkills: [], ...overrides,
  };
}

describe('explicit faction-skill compatibility', () => {
  it('does not manufacture silent combat bonuses as the hero levels', () => {
    for (const heroClass of ['barbarian', 'knight', 'wizard', 'ranger', 'demon', 'necromancer'] as const) {
      expect(updateFactionSkills(makeHero({ class: heroClass, level: 50 })).factionSkills).toEqual([]);
    }
  });

  it('preserves an explicitly persisted legacy skill without levelling it', () => {
    const hero = makeHero({ factionSkills: [skill('offense', 2)] });
    expect(updateFactionSkills({ ...hero, level: 20 }).factionSkills).toEqual([skill('offense', 2)]);
    expect(getSkillLevel(hero, 'offense')).toBe(2);
  });

  it('keeps compatibility helpers scoped to explicit skills', () => {
    const plain = makeHero();
    expect(applyOffenseBonus(100, plain)).toBe(100);
    expect(applyArmorerBonus(100, plain)).toBe(100);
    expect(getMoraleBonus(plain)).toBe(0);
    expect(getSorceryMultiplier(plain)).toBe(1);

    const skilled = makeHero({ factionSkills: [
      skill('offense', 2), skill('armorer', 1), skill('leadership', 3), skill('sorcery', 1),
    ] });
    expect(applyOffenseBonus(100, skilled)).toBe(106);
    expect(applyArmorerBonus(100, skilled)).toBe(97);
    expect(getMoraleBonus(skilled)).toBe(3);
    expect(getSorceryMultiplier(skilled)).toBe(1.05);
  });

  it('only gives mana to Wizard heroes', () => {
    expect(maxMana(makeHero({ class: 'barbarian', level: 20 }))).toBe(0);
    expect(maxMana(makeHero({ class: 'wizard', level: 2 }))).toBe(11);
  });
});
