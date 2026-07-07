import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { updateFactionSkills, necromancyBonusSkeletons } from '../factionSkills';
import { effectiveSpeed } from '../selectors';
import { GOBLIN } from '../barbarian';
import { WOOD_ELF } from '../ranger';
import { LICH } from '../necromancer';
import { EFREET } from '../demon';
import type { ArmySlot, Hero } from '../types';

function baseHero(overrides: Partial<Hero> = {}): Hero {
  return updateFactionSkills({
    class: 'ranger', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [],
    ...overrides,
  });
}

describe('Ranger Archery', () => {
  it('increases ranged damage for shooting stacks', () => {
    const plain = baseHero({ level: 1, class: 'necromancer' }); // no archery
    const withArchery = baseHero({ level: 1, class: 'ranger' }); // archery lvl1 unlocks at level 1

    function shotDamage(hero: Hero): number {
      const state = initBattle([{ unit: WOOD_ELF, count: 20 }], [{ unit: GOBLIN, count: 20 }], hero, 5);
      const elf = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: elf.id }, { type: 'shoot', targetId: goblin.id });
      return next.log.find(e => e.type === 'shoot')!.data.damage as number;
    }

    expect(shotDamage(withArchery)).toBeGreaterThan(shotDamage(plain));
  });
});

describe('Ranger Logistics', () => {
  it('adds movement speed to all player units at battle start', () => {
    const withLogistics = baseHero({ class: 'ranger', level: 3 }); // logistics lvl1 unlocks at level 3
    const plain = baseHero({ class: 'necromancer', level: 3 });

    const withState = initBattle([{ unit: GOBLIN, count: 1 }], [{ unit: GOBLIN, count: 1 }], withLogistics, 1);
    const plainState = initBattle([{ unit: GOBLIN, count: 1 }], [{ unit: GOBLIN, count: 1 }], plain, 1);
    const withUnit = withState.units.find(u => u.side === 'player' && !u.isHero)!;
    const plainUnit = plainState.units.find(u => u.side === 'player' && !u.isHero)!;
    expect(effectiveSpeed(withUnit)).toBe(effectiveSpeed(plainUnit) + 1);
  });
});

describe("Ranger Nature's Luck", () => {
  it('adds luck to all player units at battle start', () => {
    const hero = baseHero({ class: 'ranger', level: 5 }); // natures_luck lvl1 unlocks at level 5
    const state = initBattle([{ unit: GOBLIN, count: 1 }], [{ unit: GOBLIN, count: 1 }], hero, 1);
    const unit = state.units.find(u => u.side === 'player' && !u.isHero)!;
    expect(unit.luck).toBe(1);
  });
});

describe('Necromancer Death Magic', () => {
  it("increases the Lich's shot damage", () => {
    const plain = baseHero({ class: 'wizard', level: 3 });
    const withSkill = baseHero({ class: 'necromancer', level: 3 }); // death_magic lvl1 unlocks at level 3

    function lichDamage(hero: Hero): number {
      const state = initBattle([{ unit: LICH, count: 10 }], [{ unit: GOBLIN, count: 100 }], hero, 5);
      const lich = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: lich.id }, { type: 'shoot', targetId: goblin.id });
      return next.log.find(e => e.type === 'shoot')!.data.damage as number;
    }

    expect(lichDamage(withSkill)).toBeGreaterThan(lichDamage(plain));
  });
});

describe('Demon Fire Magic', () => {
  it("boosts the Efreet's melee damage and its burn tick damage", () => {
    const plain = baseHero({ class: 'wizard', level: 3 });
    const withSkill = baseHero({ class: 'demon', level: 9 }); // fire_magic lvl3 (30%) by level 9

    function efreetHit(hero: Hero): { damage: number; burnDamage: number } {
      const state = initBattle([{ unit: EFREET, count: 5 }], [{ unit: GOBLIN, count: 100 }], hero, 7);
      const efreet = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: efreet.id }, { type: 'attack', targetId: goblin.id });
      const damage = next.log.find(e => e.type === 'attack')!.data.damage as number;
      const burnDamage = next.units.find(u => u.id === goblin.id)!.burnDamage ?? 0;
      return { damage, burnDamage };
    }

    const base = efreetHit(plain);
    const boosted = efreetHit(withSkill);
    expect(boosted.damage).toBeGreaterThan(base.damage);
    expect(boosted.burnDamage).toBeGreaterThan(base.burnDamage);
  });
});

describe('Necromancer Necromancy bonus skeletons', () => {
  it("converts a percentage of the defeated enemy army's HP into free Skeletons", () => {
    const hero = baseHero({ class: 'necromancer', level: 1 }); // necromancy lvl1 unlocks at level 1
    const enemyArmy: ArmySlot[] = [{ unit: GOBLIN, count: 100 }];
    expect(necromancyBonusSkeletons(hero, enemyArmy)).toBeGreaterThan(0);
  });

  it('grants nothing for classes without the Necromancy skill', () => {
    const hero = baseHero({ class: 'wizard', level: 10 });
    const enemyArmy: ArmySlot[] = [{ unit: GOBLIN, count: 100 }];
    expect(necromancyBonusSkeletons(hero, enemyArmy)).toBe(0);
  });
});
