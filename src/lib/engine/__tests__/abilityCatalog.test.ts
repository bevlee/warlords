import { describe, it, expect } from 'vitest';
import { ABILITY_CATALOG, abilityLevel, addAbilityLevels, isUnique } from '../abilityCatalog';
import { GOBLIN } from '../barbarian';
import type { UnitDef } from '../types';

describe('abilityLevel', () => {
  it('reads the explicit level from abilityLevels', () => {
    const def: UnitDef = { ...GOBLIN, abilities: ['life_drain'], abilityLevels: { life_drain: 3 } };
    expect(abilityLevel(def, 'life_drain')).toBe(3);
  });

  it('falls back to the catalog default for legacy defs (Vampire = 100% lifesteal)', () => {
    const def: UnitDef = { ...GOBLIN, abilities: ['life_drain'] };
    expect(abilityLevel(def, 'life_drain')).toBe(10);
  });

  it('returns 0 when the unit lacks the ability', () => {
    expect(abilityLevel(GOBLIN, 'life_drain')).toBe(0);
  });

  it('unknown-but-present abilities default to level 1', () => {
    const def: UnitDef = { ...GOBLIN, abilities: ['flying'] };
    expect(abilityLevel(def, 'flying')).toBe(1);
  });
});

describe('addAbilityLevels', () => {
  it('adds levels additively, capped at maxLevel', () => {
    expect(addAbilityLevels('life_drain', 14, 3)).toBe(15); // cap 15
    expect(addAbilityLevels('life_drain', 2, 3)).toBe(5);
    expect(addAbilityLevels('bravery', 1, 1)).toBe(2);
    expect(addAbilityLevels('bravery', 3, 1)).toBe(3); // cap 3
  });

  it('unique abilities never exceed 1', () => {
    expect(addAbilityLevels('double_strike', 1, 1)).toBe(1);
    expect(addAbilityLevels('no_retaliation', 0, 1)).toBe(1);
  });
});

describe('catalog shape', () => {
  it('classifies the launch leveled set and defaults everything else to unique', () => {
    for (const id of ['life_drain', 'defense_reduction', 'bravery', 'fleet_footwork']) {
      expect(ABILITY_CATALOG[id]?.kind).toBe('leveled');
    }
    expect(isUnique('double_strike')).toBe(true);
    expect(isUnique('some_future_ability')).toBe(true); // unknown ⇒ unique (safe)
    expect(isUnique('life_drain')).toBe(false);
  });
});
