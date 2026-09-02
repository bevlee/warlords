import { describe, expect, it } from 'vitest';
import { GOBLIN } from '$lib/engine/barbarian';
import type { BattleState, Hero, UnitStack } from '$lib/engine/types';
import { activeEffects, signedModifier } from '../unitEffects';

function makeStack(overrides: Partial<UnitStack> = {}): UnitStack {
  return {
    id: 'goblin',
    definition: GOBLIN,
    count: 10,
    startCount: 10,
    hp: GOBLIN.hp,
    pos: { col: 1, row: 1 },
    side: 'enemy',
    hasRetaliated: false,
    shotsLeft: 0,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    ...overrides,
  };
}

const hero: Hero = {
  class: 'barbarian',
  level: 1,
  xp: 0,
  attack: 3,
  defense: 0,
  statPoints: 0,
  factionSkills: [],
};

describe('signedModifier', () => {
  it('formats buffs with plus and debuffs with a single minus', () => {
    expect(signedModifier(5)).toBe('+5');
    expect(signedModifier(-5)).toBe('−5');
  });
});

describe('activeEffects', () => {
  it('shows controller-wide enemy Veterancy with the values combat uses', () => {
    const unit = makeStack({ controllerId: 'enemy' });
    const battle = {
      controllerStats: {
        enemy: { attack: 5, defense: 5, label: 'Enemy Veterancy' },
      },
    } as unknown as BattleState;

    expect(activeEffects(unit, null, battle)).toContainEqual({
      id: 'controller-stats:enemy',
      label: 'Enemy Veterancy',
      value: 'ATK +5 · DEF +5',
      detail: 'Encounter-wide bonus included in this stack’s effective Attack and Defence.',
      tone: 'buff',
    });
  });

  it('lists each named cause separately and combines only repeated applications', () => {
    const unit = makeStack({
      side: 'player',
      attackBuff: -1,
      defenseBuff: 4,
      modifierSources: [
        { id: 'bloodlust', label: 'Bloodlust', stats: { attack: 4 }, stacks: 1 },
        { id: 'curse_shot', label: 'Lich — Curse Shot', stats: { attack: -5 }, stacks: 1 },
        { id: 'stoneskin', label: 'Stoneskin', stats: { defense: 4 }, stacks: 1 },
      ],
    });

    expect(activeEffects(unit, hero).map(effect => [effect.label, effect.value, effect.tone])).toEqual([
      ['Hero — Attack bonus', 'ATK +3', 'buff'],
      ['Bloodlust', 'ATK +4', 'buff'],
      ['Lich — Curse Shot', 'ATK −5', 'debuff'],
      ['Stoneskin', 'DEF +4', 'buff'],
    ]);
  });

  it('shows stack counts and every stat caused by a repeated effect on one line', () => {
    const unit = makeStack({
      attackBuff: -10,
      defenseBuff: -10,
      modifierSources: [{
        id: 'infecting_strike',
        label: 'Zombie — Infecting Strike',
        stats: { attack: -10, defense: -10 },
        stacks: 2,
      }],
    });

    expect(activeEffects(unit)).toContainEqual({
      id: 'source:infecting_strike',
      label: 'Zombie — Infecting Strike ×2',
      value: 'ATK −10 · DEF −10',
      tone: 'debuff',
    });
  });

  it('lists temporary combat states with useful remaining details', () => {
    const unit = makeStack({
      isDefending: true,
      blindedUntilRound: 2,
      burnDamage: 3,
      burnRoundsLeft: 2,
      boundUntilRound: 2,
    });

    const effects = activeEffects(unit);
    expect(effects.map(effect => effect.label)).toEqual([
      'Defending',
      'Unicorn — Blind on Hit',
      'Efreet — Burn',
      'Dendroid — Bind',
    ]);
    expect(effects.find(effect => effect.label === 'Efreet — Burn')).toMatchObject({
      value: '−3 HP',
      detail: 'Damage at turn start; 2 turns remaining.',
      tone: 'debuff',
    });
  });

  it('shows marks with their actual artifact-upgraded values and descriptions', () => {
    const unit = makeStack({
      marks: [
        {
          kind: 'ranged_mark',
          ownerTeamId: 'player',
          sourceControllerId: 'ranger',
          sourceId: 'orc',
        },
        {
          kind: 'marked_for_death',
          ownerTeamId: 'player',
          sourceControllerId: 'barbarian',
          sourceId: 'hero',
        },
      ],
    });
    const battle = { artifacts: { ranger: ['red_fletched_arrows'] } } as unknown as BattleState;

    expect(activeEffects(unit, null, battle)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Ranged Mark',
        value: 'RANGED TAKEN +45%',
        detail: expect.stringContaining('every unit allied with the marking unit'),
        tone: 'debuff',
      }),
      expect.objectContaining({
        label: 'Marked for Death',
        value: 'DMG TAKEN +20%',
        detail: expect.stringContaining('every unit allied with the marking unit'),
        tone: 'debuff',
      }),
    ]));
  });

  it('explains the full opening Banner effect instead of showing an anonymous speed modifier', () => {
    const unit = makeStack({
      side: 'player',
      controllerId: 'player',
      empoweredTurnsRemaining: 2,
      speedBonus: 4,
      abilityState: { bannerSpeed: 4 },
    });
    const battle = {
      artifacts: {
        player: ['banner_of_the_first_raid', 'map_of_the_first_raid', 'banner_of_no_return', 'red_sunrise'],
      },
    } as unknown as BattleState;

    const effects = activeEffects(unit, null, battle);
    expect(effects).toContainEqual({
      id: 'banner-of-the-first-raid',
      label: 'Banner of the First Raid',
      value: 'SPEED +4 · DMG +50%',
      detail: 'Active during this unit’s opening 2 turns; 2 turns remaining.',
      tone: 'buff',
    });
    expect(effects.some(effect => effect.label === 'Other speed modifier')).toBe(false);
  });

  it('removes the opening Banner from the unit panel after its effect expires', () => {
    const unit = makeStack({
      side: 'player',
      controllerId: 'player',
      empoweredTurnsRemaining: 0,
      abilityState: { bannerSpeed: 0 },
    });
    const battle = { artifacts: { player: ['banner_of_the_first_raid'] } } as unknown as BattleState;

    expect(activeEffects(unit, null, battle).some(effect => effect.id === 'banner-of-the-first-raid')).toBe(false);
  });

  it('adds descriptions to combat effects without duplicating their named stat source', () => {
    const unit = makeStack({
      initiativeBonus: 1,
      damageBonus: 1,
      modifierSources: [{ id: 'focus', label: 'Focus', stats: { initiative: 1, damage: 1 }, stacks: 1 }],
      effects: [{
        id: 'focus',
        kind: 'focus',
        sourceStackId: 'goblin',
        positive: true,
        innate: false,
        removable: true,
        stacks: 1,
        stats: { initiative: 1, damage: 1 },
      }],
    });

    const focus = activeEffects(unit).filter(effect => effect.label === 'Focus');
    expect(focus).toHaveLength(1);
    expect(focus[0]).toMatchObject({
      value: 'DMG +1 · INIT +1',
      detail: expect.stringContaining('spending this unit’s turn'),
      tone: 'buff',
    });
  });

  it('does not show an empty section for an unmodified unit', () => {
    expect(activeEffects(makeStack())).toEqual([]);
  });
});
