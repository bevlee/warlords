import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { maxMana } from '../factionSkills';
import { effectiveAttackInBattle, effectiveDefenseInBattle } from '../combat';
import { GOBLIN } from '../barbarian';
import { CAVALIER } from '../knight';
import type { Hero } from '../types';

function hero(overrides: Partial<Hero> = {}): Hero {
  return { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [], ...overrides };
}

describe('redesigned progression wiring', () => {
  it('does not derive old faction passives from hero level', () => {
    const state = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: GOBLIN, count: 5 }], hero({ level: 50 }), 1);
    const player = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    expect(player.morale).toBe(0);
    expect(player.luck).toBe(0);
    expect(player.speedBonus ?? 0).toBe(0);
  });

  it('keeps mana exclusive to Wizard', () => {
    expect(maxMana(hero({ class: 'barbarian', level: 20 }))).toBe(0);
    const wizard = hero({ class: 'wizard', level: 2 });
    expect(maxMana(wizard)).toBe(11);
    // In a gauntlet the depth drives it, so mana grows as the run does.
    expect(maxMana(wizard, 1)).toBe(8);
    expect(maxMana(wizard, 10)).toBe(35);
    // Campaign and coop pass no depth and keep levelling by XP.
    expect(maxMana({ ...wizard, level: 7 })).toBe(26);
    expect(initBattle([{ unit: GOBLIN, count: 1 }], [{ unit: GOBLIN, count: 1 }], wizard, 1).hero.mana).toBe(11);
  });

  it('applies enemy bonus and controller-scoped completed-battle Training to effective stats', () => {
    const state = initBattle(
      [{ unit: GOBLIN, count: 5 }], [{ unit: GOBLIN, count: 5 }], hero(), 1, [], undefined,
      {
        gauntletRound: 7,
        enemyBonus: 3,
        training: { player: { Goblin: { weapon: true, armour: true } } },
      },
    );
    const player = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const enemy = state.units.find(unit => unit.side === 'enemy' && !unit.isHero)!;
    expect(effectiveAttackInBattle(state, player)).toBe(GOBLIN.attack + 2 + 6);
    expect(effectiveDefenseInBattle(state, player)).toBe(GOBLIN.defense + 1 + 6);
    expect(effectiveAttackInBattle(state, enemy)).toBe(GOBLIN.attack + 3);
    expect(effectiveDefenseInBattle(state, enemy)).toBe(GOBLIN.defense + 3);
  });

  it('records movement origin on a legal move for positional abilities', () => {
    const state = initBattle([{ unit: CAVALIER, count: 1 }], [{ unit: GOBLIN, count: 1 }], hero({ class: 'knight' }), 3);
    const cavalier = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const from = cavalier.pos;
    const to = { col: from.col + 1, row: from.row };
    const next = applyAction({ ...state, phase: 'combat', currentUnitId: cavalier.id }, { type: 'move', to });
    expect(next.units.find(unit => unit.id === cavalier.id)?.lastMovedFrom).toEqual(from);
  });
});
