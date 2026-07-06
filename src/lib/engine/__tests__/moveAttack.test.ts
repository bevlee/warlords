import { describe, it, expect } from 'vitest';
import { createGrid, placeUnits, getCell, chebyshevDistance } from '../grid';
import { applyAction } from '../battle';
import { aiTakeTurn } from '../ai';
import { canShootTarget, getMeleeApproaches } from '../selectors';
import { GOBLIN, ORC, WOLF_RIDER } from '../barbarian';
import type { BattleState, UnitDef, UnitStack, Pos } from '../types';

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
    ...overrides,
  };
}

function makeState(units: UnitStack[]): BattleState {
  let grid = createGrid(12, 10);
  grid = placeUnits(grid, units);
  return {
    grid,
    units,
    hero: { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0 },
    round: 1,
    battleTime: 0,
    currentUnitId: units[0]?.id ?? null,
    log: [],
    result: 'ongoing',
    seed: 42,
  };
}

describe('attack with moveTo (move+attack)', () => {
  it('relocates the actor, then resolves the melee with retaliation', () => {
    const rider = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'player');
    const goblins = makeStack(GOBLIN, { col: 6, row: 1 }, 'enemy', { count: 30 });
    const state = makeState([rider, goblins]);

    const next = applyAction(state, { type: 'attack', targetId: goblins.id, moveTo: { col: 5, row: 1 } });

    const movedRider = next.units.find(u => u.id === rider.id)!;
    expect(movedRider.pos).toEqual({ col: 5, row: 1 });
    expect(getCell(next.grid, 1, 1)?.occupantId).toBeNull();
    expect(getCell(next.grid, 5, 1)?.occupantId).toBe(rider.id);

    const hurtGoblins = next.units.find(u => u.id === goblins.id)!;
    expect(hurtGoblins.count).toBeLessThan(30);
    expect(next.log.some(e => e.type === 'attack')).toBe(true);
    expect(next.log.some(e => e.type === 'retaliate')).toBe(true);
  });
});

describe('canShootTarget', () => {
  it('requires shots left and the target within range', () => {
    const orc = makeStack(ORC, { col: 0, row: 0 }, 'player'); // range 7
    const inRange = makeStack(GOBLIN, { col: 7, row: 0 }, 'enemy');
    const outOfRange = makeStack(GOBLIN, { col: 8, row: 0 }, 'enemy');
    const spentOrc = makeStack(ORC, { col: 0, row: 1 }, 'player', { shotsLeft: 0 });
    const goblin = makeStack(GOBLIN, { col: 0, row: 2 }, 'player'); // melee only

    expect(canShootTarget(orc, inRange)).toBe(true);
    expect(canShootTarget(orc, outOfRange)).toBe(false);
    expect(canShootTarget(spentOrc, inRange)).toBe(false);
    expect(canShootTarget(goblin, inRange)).toBe(false);
  });
});

describe('getMeleeApproaches', () => {
  it('maps adjacent enemies to null and reachable enemies to an adjacent destination', () => {
    const rider = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'player'); // speed 7
    const adjacent = makeStack(GOBLIN, { col: 2, row: 1 }, 'enemy');
    const nearby = makeStack(GOBLIN, { col: 7, row: 5 }, 'enemy'); // manhattan 10 > speed, unreachable
    const reachableEnemy = makeStack(GOBLIN, { col: 6, row: 3 }, 'enemy'); // manhattan 7 = speed
    const state = makeState([rider, adjacent, nearby, reachableEnemy]);

    const approaches = getMeleeApproaches(state, rider);

    expect(approaches.get(adjacent.id)).toBeNull();

    const dest = approaches.get(reachableEnemy.id);
    expect(dest).toBeTruthy();
    expect(chebyshevDistance(dest!, reachableEnemy.pos)).toBe(1);

    expect(approaches.has(nearby.id)).toBe(false);
  });

  it('ignores dead enemies', () => {
    const rider = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'player');
    const dead = makeStack(GOBLIN, { col: 2, row: 1 }, 'enemy', { count: 0 });
    const state = makeState([rider, dead]);

    expect(getMeleeApproaches(state, rider).size).toBe(0);
  });
});

describe('AI with range and move+attack', () => {
  it('does not shoot beyond range; walks toward the target instead', () => {
    const orc = makeStack(ORC, { col: 1, row: 1 }, 'enemy'); // range 7, speed 4
    const target = makeStack(GOBLIN, { col: 10, row: 1 }, 'player'); // dist 9
    const state = makeState([orc, target]);

    const action = aiTakeTurn(state, orc.id);
    expect(action.type).toBe('move');
  });

  it('shoots when the target is within range', () => {
    const orc = makeStack(ORC, { col: 1, row: 1 }, 'enemy');
    const target = makeStack(GOBLIN, { col: 8, row: 1 }, 'player'); // dist 7
    const state = makeState([orc, target]);

    const action = aiTakeTurn(state, orc.id);
    expect(action).toEqual({ type: 'shoot', targetId: target.id });
  });

  it('uses move+attack when a melee approach exists', () => {
    const rider = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'enemy'); // speed 7
    const target = makeStack(GOBLIN, { col: 6, row: 1 }, 'player'); // dist 5
    const state = makeState([rider, target]);

    const action = aiTakeTurn(state, rider.id);
    expect(action.type).toBe('attack');
    if (action.type === 'attack') {
      expect(action.targetId).toBe(target.id);
      expect(action.moveTo).toBeTruthy();
      expect(chebyshevDistance(action.moveTo!, target.pos)).toBe(1);
    }
  });

  it('attacks in place when already adjacent', () => {
    const rider = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'enemy');
    const target = makeStack(GOBLIN, { col: 2, row: 1 }, 'player');
    const state = makeState([rider, target]);

    const action = aiTakeTurn(state, rider.id);
    expect(action.type).toBe('attack');
    if (action.type === 'attack') {
      expect(action.moveTo).toBeFalsy();
    }
  });
});
