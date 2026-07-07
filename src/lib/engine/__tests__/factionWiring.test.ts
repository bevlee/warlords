import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { GOBLIN } from '../barbarian';
import { CAVALIER } from '../knight';
import { updateFactionSkills } from '../factionSkills';
import type { Hero } from '../types';

function baseHero(overrides: Partial<Hero> = {}): Hero {
  return updateFactionSkills({
    class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [],
    ...overrides,
  });
}

describe('faction skills wiring into battle', () => {
  it('Leadership boosts starting morale for player units only, not enemies', () => {
    const withLeadership = baseHero({ level: 5 }); // barbarian leadership unlocks at level 5
    const state = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: GOBLIN, count: 5 }], withLeadership, 1);
    const player = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const enemy = state.units.find(u => u.side === 'enemy')!;

    expect(player.morale).toBe(1); // leadership skill level 1
    expect(enemy.morale).toBe(0);
  });

  it('no morale bonus before leadership unlocks', () => {
    const noLeadership = baseHero({ level: 1 });
    const state = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: GOBLIN, count: 5 }], noLeadership, 1);
    const player = state.units.find(u => u.side === 'player' && !u.isHero)!;
    expect(player.morale).toBe(0);
  });

  it('Offense increases outgoing player attack damage', () => {
    const plain = baseHero({ level: 1, class: 'wizard' }); // no offense skill on this class
    const withOffense = baseHero({ level: 1, class: 'barbarian' }); // offense unlocks at level 1

    function firstAttackDamage(hero: Hero): number {
      const state = initBattle([{ unit: GOBLIN, count: 20 }], [{ unit: GOBLIN, count: 20 }], hero, 5);
      const attacker = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const enemy = state.units.find(u => u.side === 'enemy')!;
      const acting = { ...state, currentUnitId: attacker.id };
      const next = applyAction(acting, { type: 'attack', targetId: enemy.id });
      const attackEvent = next.log.find(e => e.type === 'attack')!;
      return attackEvent.data.damage as number;
    }

    expect(firstAttackDamage(withOffense)).toBeGreaterThan(firstAttackDamage(plain));
  });

  it('Armorer reduces incoming damage to player-side stacks', () => {
    const plain = baseHero({ level: 1, class: 'wizard' }); // no armorer skill on this class
    const withArmorer = baseHero({ level: 3, class: 'barbarian' }); // barbarian armorer unlocks at level 3

    function incomingDamage(hero: Hero): number {
      const state = initBattle([{ unit: GOBLIN, count: 20 }], [{ unit: GOBLIN, count: 20 }], hero, 5);
      const defender = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const attacker = state.units.find(u => u.side === 'enemy')!;
      const acting = { ...state, currentUnitId: attacker.id };
      const next = applyAction(acting, { type: 'attack', targetId: defender.id });
      const attackEvent = next.log.find(e => e.type === 'attack')!;
      return attackEvent.data.damage as number;
    }

    expect(incomingDamage(withArmorer)).toBeLessThan(incomingDamage(plain));
  });

  it('records lastMovedFrom on a plain move', () => {
    const hero = baseHero({ level: 1 });
    const state = initBattle([{ unit: CAVALIER, count: 1 }], [{ unit: GOBLIN, count: 1 }], hero, 3);
    const cavalier = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const from = cavalier.pos;
    const acting = { ...state, currentUnitId: cavalier.id };
    const to = { col: from.col + 1, row: from.row };

    const next = applyAction(acting, { type: 'move', to });
    const moved = next.units.find(u => u.id === cavalier.id)!;
    expect(moved.lastMovedFrom).toEqual(from);
    expect(moved.pos).toEqual(to);
  });

  it('records lastMovedFrom on a combined move+attack, enabling jousting', () => {
    const hero = baseHero({ level: 1 });
    const state = initBattle([{ unit: CAVALIER, count: 1 }], [{ unit: GOBLIN, count: 1 }], hero, 3);
    const cavalier = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const enemy = state.units.find(u => u.side === 'enemy')!;
    const from = cavalier.pos;
    // stand a couple of cells away and attack-with-move so a jousting bonus is measurable
    const moveTo = { col: enemy.pos.col + (enemy.pos.col > from.col ? -1 : 1), row: enemy.pos.row };
    const acting = { ...state, currentUnitId: cavalier.id };

    const next = applyAction(acting, { type: 'attack', targetId: enemy.id, moveTo });
    const moved = next.units.find(u => u.id === cavalier.id)!;
    expect(moved.lastMovedFrom).toEqual(from);
  });
});
