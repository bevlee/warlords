import { describe, it, expect } from 'vitest';
import { AUGMENTS, augmentedDef, applyAugmentsToArmy, availableAugments, MAX_AUGMENTS_PER_UNIT } from '../augments';
import { applyXp, xpToReach } from '../progression';
import { initBattle } from '../battle';
import { GOBLIN, BARBARIAN_UNITS } from '../barbarian';
import { updateFactionSkills } from '../factionSkills';
import type { Hero, UnitDef } from '../types';

const HERO: Hero = updateFactionSkills({
  class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
});

const ORC = BARBARIAN_UNITS.find(u => u.name === 'Orc')!; // shooter, tier 3

describe('augmentedDef', () => {
  it('applies flat stat deltas', () => {
    const def = augmentedDef(GOBLIN, ['veterancy', 'keen_edge']);
    expect(def.attack).toBe(GOBLIN.attack + 2);
    expect(def.minDamage).toBe(GOBLIN.minDamage + 1);
    expect(def.maxDamage).toBe(GOBLIN.maxDamage + 1);
    expect(def.augmented).toBe(true);
  });

  it('resolves percentage HP against the base definition, rounded', () => {
    const def = augmentedDef(GOBLIN, ['plating']);
    expect(def.hp).toBe(GOBLIN.hp + Math.round(GOBLIN.hp * 0.15));
    expect(def.defense).toBe(GOBLIN.defense + 2);
  });

  it('grants abilities without duplicating existing ones', () => {
    const def = augmentedDef(GOBLIN, ['savagery']);
    expect(def.abilities).toContain('no_retaliation');
    const again = augmentedDef(def, ['savagery']);
    expect(again.abilities.filter(a => a === 'no_retaliation')).toHaveLength(1);
  });

  it('ignores unknown ids and returns the base def untouched for empty ids', () => {
    expect(augmentedDef(GOBLIN, ['nonsense'])).toEqual({ ...GOBLIN, abilities: [...GOBLIN.abilities], augmented: true });
    expect(augmentedDef(GOBLIN, [])).toBe(GOBLIN);
    expect(GOBLIN.augmented).toBeUndefined(); // base roster never mutated
  });
});

describe('availableAugments', () => {
  it('gates shooter/melee/tier requirements', () => {
    const ids = (u: UnitDef, owned: string[] = []) => availableAugments(u, owned).map(a => a.id);
    expect(ids(GOBLIN)).not.toContain('deep_quiver'); // melee
    expect(ids(ORC)).toContain('deep_quiver');         // shooter
    expect(ids(ORC)).not.toContain('war_pinions');     // shooters can't take wings
    const behemoth = BARBARIAN_UNITS.find(u => u.tier === 7)!;
    expect(ids(behemoth)).not.toContain('savagery');   // tier cap 3
  });

  it('returns nothing once the per-unit cap is reached', () => {
    expect(availableAugments(GOBLIN, ['veterancy', 'plating'])).toHaveLength(0);
    expect(MAX_AUGMENTS_PER_UNIT).toBe(2);
  });

  it('excludes already-owned augments', () => {
    const ids = availableAugments(GOBLIN, ['veterancy']).map(a => a.id);
    expect(ids).not.toContain('veterancy');
  });
});

describe('applyAugmentsToArmy', () => {
  it('transforms only slots with recorded augments', () => {
    const hero: Hero = { ...HERO, unitAugments: { Goblin: ['plating'] } };
    const army = [
      { unit: GOBLIN, count: 5 },
      { unit: ORC, count: 3 },
    ];
    const out = applyAugmentsToArmy(army, hero);
    expect(out[0].unit.hp).toBeGreaterThan(GOBLIN.hp);
    expect(out[1]).toBe(army[1]); // untouched slot keeps its reference
  });

  it('feeds augmented hp and shots into initBattle stacks', () => {
    const hero: Hero = { ...HERO, unitAugments: { Orc: ['deep_quiver', 'plating'] } };
    const army = applyAugmentsToArmy([{ unit: ORC, count: 2 }], hero);
    const state = initBattle(army, [{ unit: GOBLIN, count: 1 }], hero, 42);
    const orcStack = state.units.find(u => u.definition.name === 'Orc')!;
    expect(orcStack.hp).toBe(ORC.hp + Math.round(ORC.hp * 0.15));
    expect(orcStack.shotsLeft).toBe(ORC.shots + 4);
    expect(orcStack.definition.defense).toBe(ORC.defense + 2);
  });
});

describe('augment points', () => {
  it('applyXp grants one point per level gained', () => {
    const { hero: after, levels } = applyXp(HERO, xpToReach(3)); // jumps to level 3
    expect(levels).toBe(2);
    expect(after.augmentPoints).toBe(2);
  });

  it('preserves existing unspent points', () => {
    const { hero: after } = applyXp({ ...HERO, augmentPoints: 3 }, xpToReach(2));
    expect(after.augmentPoints).toBe(4);
  });

  it('grants nothing without a level-up', () => {
    const { hero: after } = applyXp(HERO, 10);
    expect(after.augmentPoints).toBe(0);
  });
});

describe('catalogue sanity', () => {
  it('every augment id matches its key and has an effect', () => {
    for (const [key, a] of Object.entries(AUGMENTS)) {
      expect(a.id).toBe(key);
      expect(a.stats || a.hpPct || a.grantsAbility).toBeTruthy();
    }
  });
});
