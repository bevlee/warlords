import { describe, it, expect } from 'vitest';
import { initBattle } from '../battle';
import { effectiveAttackInBattle, effectiveDefenseInBattle } from '../combat';
import { newRun, generateGauntletEnemy } from '../../gauntlet/run';
import { GOBLIN } from '../barbarian';
import type { Hero } from '../types';

const hero = (className: Hero['class']): Hero => ({
  class: className, level: 20, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
});

describe('faction redesign foundations', () => {
  it('removes automatic level-derived faction skills from every faction', () => {
    for (const className of ['barbarian', 'knight', 'wizard', 'ranger', 'demon', 'necromancer'] as const) {
      const state = initBattle([{ unit: GOBLIN, count: 3 }], [{ unit: GOBLIN, count: 3 }], hero(className), 1);
      const unit = state.units.find(candidate => candidate.side === 'player' && !candidate.isHero)!;
      expect(unit.modifierSources?.filter(source => ['leadership', 'logistics', 'natures_luck'].includes(source.id)) ?? []).toEqual([]);
      expect(state.hero.mana).toBe(className === 'wizard' ? 65 : 0);
    }
  });

  it('scales Training by completed battles and keeps it specific to controller and unit type', () => {
    const state = initBattle(
      [{ unit: GOBLIN, count: 3 }], [{ unit: GOBLIN, count: 3 }], hero('barbarian'), 1, [], undefined,
      { gauntletRound: 8, training: { player: { Goblin: { weapon: true, armour: true } } } },
    );
    const player = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const enemy = state.units.find(unit => unit.side === 'enemy' && !unit.isHero)!;
    expect(effectiveAttackInBattle(state, player) - effectiveAttackInBattle(state, enemy)).toBe(2 + 7);
    expect(effectiveDefenseInBattle(state, player) - effectiveDefenseInBattle(state, enemy)).toBe(1 + 7);
  });

  it('uses Rank to increase enemy bonus while limiting distinct stacks', () => {
    const run = { ...newRun('barbarian', 9), encounterIndex: 9, battlesWon: 8 };
    const encounter = generateGauntletEnemy(run);
    expect(encounter.enemyBonus).toBe(4);
    expect(encounter.army.length).toBeLessThanOrEqual(4);
  });

  it('grants each faction its redesigned starter artifact', () => {
    expect(newRun('barbarian', 1).items).toContain('banner_of_the_first_raid');
    expect(newRun('ranger', 1).items).toContain('wayfarers_compass');
    expect(newRun('necromancer', 1).items).toContain('gravewrights_grimoire');
  });
});
