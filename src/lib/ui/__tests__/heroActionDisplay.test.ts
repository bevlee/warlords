import { describe, expect, it } from 'vitest';
import { initBattle } from '$lib/engine/battle';
import { GOBLIN, ORC } from '$lib/engine/barbarian';
import type { CombatEffect, Hero } from '$lib/engine/types';
import { activeHeroEffect, heroActionsFor, heroActionViews } from '../heroActionDisplay';

const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 1, defense: 1, statPoints: 0, factionSkills: [] };

const stateWith = (artifacts: string[] = []) => initBattle(
  [{ unit: GOBLIN, count: 10 }],
  [{ unit: ORC, count: 10 }],
  hero,
  7,
  [],
  undefined,
  { artifacts: { player: artifacts } },
);

describe('heroActionViews', () => {
  it('shows artifact-modified Battle Cry values and remaining uses', () => {
    const state = stateWith(['bronze_war_horn', 'skull_trumpet', 'voice_of_the_warchief']);
    const heroUnit = state.units.find(unit => unit.isHero)!;
    const views = heroActionViews({ ...state, heroActionState: { player: { chargeUses: 1 } } }, heroUnit, hero);

    expect(views.find(view => view.id === 'charge')).toMatchObject({
      summary: '+4 Speed · +40% melee damage',
      usesLabel: '1 of 2 uses remaining',
    });
    expect(views.find(view => view.id === 'blood_for_blood')?.summary).toBe('+75% dealt · +50% taken');
  });

  it('uses base values without modifying artifacts', () => {
    const state = stateWith();
    const heroUnit = state.units.find(unit => unit.isHero)!;
    const charge = heroActionViews(state, heroUnit, hero).find(view => view.id === 'charge');

    expect(charge?.summary).toBe('+2 Speed · +25% melee damage');
    expect(charge?.usesLabel).toBe('1 of 1 uses remaining');
  });
});

describe('heroActionsFor', () => {
  it('reads a hero\u2019s kit outside a battle, from owned artifacts alone', () => {
    const plain = heroActionsFor(hero, []);
    const horned = heroActionsFor(hero, ['bronze_war_horn']);

    expect(plain.find(view => view.id === 'charge')?.summary).toBe('+2 Speed · +25% melee damage');
    expect(horned.find(view => view.id === 'charge')?.summary).toBe('+4 Speed · +40% melee damage');
    // No battle means no spent uses: the run screen shows a full allowance.
    expect(plain.find(view => view.id === 'charge')?.usesLabel).toBe('1 of 1 uses remaining');
  });

  it('gives the wizard no actions, and every other class three', () => {
    expect(heroActionsFor({ ...hero, class: 'wizard' }, [])).toEqual([]);
    for (const heroClass of ['knight', 'ranger', 'barbarian', 'demon', 'necromancer'] as const) {
      expect(heroActionsFor({ ...hero, class: heroClass }, [])).toHaveLength(3);
    }
  });
});

describe('activeHeroEffect', () => {
  it('keeps a Battle Cry banner only while at least one unit has the live effect', () => {
    const state = stateWith();
    const heroUnit = state.units.find(unit => unit.isHero)!;
    const goblin = state.units.find(unit => unit.definition.name === 'Goblin')!;
    const cry: CombatEffect = {
      id: 'cry_charge', kind: 'cry_charge', sourceStackId: heroUnit.id, positive: true,
      innate: true, removable: false, stacks: 1, data: { speed: 2, damageMultiplier: 1.25 },
    };
    const active = {
      ...state,
      heroActionState: { player: { lastCry: 'charge' } },
      units: state.units.map(unit => unit.id === goblin.id ? { ...unit, effects: [cry] } : unit),
    };

    expect(activeHeroEffect(active, heroUnit, hero)).toMatchObject({ id: 'charge', affectedLabel: '1 unit affected' });
    expect(activeHeroEffect({ ...active, units: state.units }, heroUnit, hero)).toBeNull();
  });
});
