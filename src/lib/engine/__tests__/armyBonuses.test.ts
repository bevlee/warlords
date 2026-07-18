import { describe, it, expect } from 'vitest';
import { predictTurnOrder } from '../turnOrder';
import { initBattle } from '../battle';
import { GOBLIN, OGRE } from '../barbarian';
import { PEASANT } from '../knight';
import type { ArmyBonuses, Hero, Pos, UnitDef, UnitStack } from '../types';

const mockHero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] };

function makeStack(
  def: UnitDef,
  pos: Pos,
  side: 'player' | 'enemy',
  overrides: Partial<UnitStack> = {}
): UnitStack {
  return {
    id: `${side}-${def.name}-${pos.col}-${pos.row}`,
    definition: def,
    count: 5,
    hp: def.hp,
    pos,
    side,
    hasRetaliated: false,
    shotsLeft: def.shots,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    ...overrides,
  };
}

const bonuses = (partial: Partial<ArmyBonuses>): ArmyBonuses => ({
  attack: 0, defense: 0, initiative: 0, luck: 0, morale: 0, ...partial,
});

describe('initiativeBonus in turn order', () => {
  it('a stack with initiativeBonus acts before an identical stack without it', () => {
    const fast = makeStack(GOBLIN, { col: 1, row: 1 }, 'player', { initiativeBonus: 2 });
    const slow = makeStack(GOBLIN, { col: 10, row: 1 }, 'enemy');

    const order = predictTurnOrder([fast, slow], 24);

    expect(order[0]).toBe(fast.id);
    // Effective init 13 vs 11: over 24 turns the bonused stack banks ~13 of
    // them. Without the bonus the two goblins tie and alternate 12/12.
    const fastTurns = order.filter(id => id === fast.id).length;
    expect(fastTurns).toBeGreaterThanOrEqual(13);
  });
});

describe('initBattle armyBonuses', () => {
  const playerArmy = [{ unit: GOBLIN, count: 10 }];
  const enemyArmy = [{ unit: PEASANT, count: 10 }];
  const allyArmy = [{ unit: OGRE, count: 2 }];

  it('applies attack/defense/initiative/luck/morale to player stacks only', () => {
    const state = initBattle(playerArmy, enemyArmy, mockHero, 7, allyArmy,
      bonuses({ attack: 4, defense: 8, initiative: 1, luck: 1, morale: 2 }));

    const player = state.units.find(u => u.side === 'player' && !u.isHero && !u.isAlly)!;
    expect(player.attackBuff).toBe(4);
    expect(player.defenseBuff).toBe(8);
    expect(player.initiativeBonus).toBe(1);
    expect(player.luck).toBe(1);
    expect(player.morale).toBe(2);

    const enemy = state.units.find(u => u.side === 'enemy')!;
    const ally = state.units.find(u => u.isAlly)!;
    const hero = state.units.find(u => u.isHero)!;
    for (const bystander of [enemy, ally, hero]) {
      expect(bystander.attackBuff ?? 0).toBe(0);
      expect(bystander.initiativeBonus ?? 0).toBe(0);
      expect(bystander.luck).toBe(0);
      expect(bystander.morale).toBe(0);
    }
  });

  it('clamps luck and morale to the engine cap of ±3', () => {
    const state = initBattle(playerArmy, enemyArmy, mockHero, 7, [],
      bonuses({ luck: 5, morale: -9 }));

    const player = state.units.find(u => u.side === 'player' && !u.isHero)!;
    expect(player.luck).toBe(3);
    expect(player.morale).toBe(-3);
  });

  it('omitting armyBonuses leaves stacks untouched', () => {
    const state = initBattle(playerArmy, enemyArmy, mockHero, 7);
    const player = state.units.find(u => u.side === 'player' && !u.isHero)!;
    expect(player.attackBuff).toBeUndefined();
    expect(player.initiativeBonus).toBeUndefined();
  });
});

describe('bravery ability', () => {
  it('grants +1 morale at battle init', () => {
    const BRAVE: UnitDef = { ...GOBLIN, abilities: ['bravery'] };
    const state = initBattle([{ unit: BRAVE, count: 5 }], [{ unit: GOBLIN, count: 5 }], mockHero, 7);
    const brave = state.units.find(u => u.side === 'player' && !u.isHero)!;
    expect(brave.morale).toBe(1);
  });

  it('applies to enemy stacks carrying it too, and clamps with other sources', () => {
    const BRAVE: UnitDef = { ...GOBLIN, abilities: ['bravery'] };
    const state = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: BRAVE, count: 5 }], mockHero, 7);
    expect(state.units.find(u => u.side === 'enemy')!.morale).toBe(1);
  });
});

describe('leveled bravery', () => {
  it('grants +level morale at battle init, clamped at 3', () => {
    const BRAVE3: UnitDef = { ...GOBLIN, abilities: ['bravery'], abilityLevels: { bravery: 3 } };
    const state = initBattle([{ unit: BRAVE3, count: 5 }], [{ unit: GOBLIN, count: 5 }], mockHero, 7);
    expect(state.units.find(u => u.side === 'player' && !u.isHero)!.morale).toBe(3);
  });
});
