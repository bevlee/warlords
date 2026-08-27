import { describe, expect, it } from 'vitest';
import { GOBLIN } from '$lib/engine/barbarian';
import type { Hero, UnitStack } from '$lib/engine/types';
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

  it('does not show an empty section for an unmodified unit', () => {
    expect(activeEffects(makeStack())).toEqual([]);
  });
});
