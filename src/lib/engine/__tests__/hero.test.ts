import { describe, it, expect } from 'vitest';
import { initBattle, applyAction, checkBattleEnd } from '../battle';
import { aiTakeTurn } from '../ai';
import { predictTurnOrder } from '../turnOrder';
import { getMeleeApproaches } from '../selectors';
import { GOBLIN, WOLF_RIDER } from '../barbarian';
import type { BattleState, Hero } from '../types';

const hero: Hero = { class: 'barbarian', level: 2, xp: 0, attack: 4, defense: 2, statPoints: 0, factionSkills: [] };

function newBattle(seed = 7): BattleState {
  return initBattle(
    [{ unit: GOBLIN, count: 10 }],
    [{ unit: WOLF_RIDER, count: 5 }],
    hero,
    seed
  );
}

function heroStack(state: BattleState) {
  return state.units.find(u => u.isHero)!;
}

describe('hero as a battlefield actor', () => {
  it('joins the battle as an off-grid, ATB-scheduled player stack', () => {
    const state = newBattle();
    const h = heroStack(state);

    expect(h).toBeTruthy();
    expect(h.side).toBe('player');
    expect(h.definition.name).toBe('Hero');
    // never on the grid
    for (const cell of state.grid.cells.flat()) {
      expect(cell.occupantId).not.toBe(h.id);
    }
    // scheduled on the initiative scale
    expect(predictTurnOrder(state.units, 6)).toContain(h.id);
  });

  it('is never targeted by the AI, even when nearest', () => {
    const state = newBattle();
    const h = heroStack(state);
    // move the enemy right next to the hero's flank; hero stays nearest by distance
    const enemy = state.units.find(u => u.side === 'enemy')!;
    const moved: BattleState = {
      ...state,
      units: state.units.map(u => (u.id === enemy.id ? { ...u, pos: { col: 0, row: 4 } } : u)),
    };

    const action = aiTakeTurn(moved, enemy.id);
    if (action.type === 'attack' || action.type === 'shoot') {
      expect(action.targetId).not.toBe(h.id);
    }
  });

  it('is excluded from melee approach maps', () => {
    const state = newBattle();
    const enemy = state.units.find(u => u.side === 'enemy')!;
    const nearFlank: BattleState = {
      ...state,
      units: state.units.map(u => (u.id === enemy.id ? { ...u, pos: { col: 0, row: 4 } } : u)),
    };
    const movedEnemy = nearFlank.units.find(u => u.side === 'enemy')!;

    expect(getMeleeApproaches(nearFlank, movedEnemy).has(heroStack(state).id)).toBe(false);
  });

  it('strikes any enemy with a ranged no-retaliation attack on its turn', () => {
    let state = newBattle();
    const h = heroStack(state);
    // fast-forward to the hero's turn (play waits until it comes up)
    for (let i = 0; i < 20 && state.currentUnitId !== h.id; i++) {
      state = applyAction(state, { type: 'wait' });
    }
    expect(state.currentUnitId).toBe(h.id);

    const enemy = state.units.find(u => u.side === 'enemy' && u.count > 0)!;
    const next = applyAction(state, { type: 'shoot', targetId: enemy.id });

    const hurt = next.units.find(u => u.id === enemy.id)!;
    const hpBefore = enemy.count * enemy.definition.hp;
    const hpAfter = hurt.count > 0 ? (hurt.count - 1) * hurt.definition.hp + hurt.hp : 0;
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(next.log.some(e => e.type === 'shoot' && e.data.attackerId === h.id)).toBe(true);
    expect(next.log.some(e => e.type === 'retaliate')).toBe(false);
  });

  it('does not keep the battle alive: army dead + hero alive = defeat', () => {
    const state = newBattle();
    const armyDead: BattleState = {
      ...state,
      units: state.units.map(u => (u.side === 'player' && !u.isHero ? { ...u, count: 0 } : u)),
    };

    expect(checkBattleEnd(armyDead)).toBe('enemy_wins');
  });
});
