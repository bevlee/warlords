import { describe, it, expect } from 'vitest';
import { createGrid, placeUnits } from '../grid';
import { getReachableCells, getMeleeTargets, canShoot } from '../selectors';
import { GOBLIN, ORC, THUNDERBIRD } from '../barbarian';
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
    turnQueue: [],
    currentUnitId: units[0]?.id ?? null,
    log: [],
    result: 'ongoing',
    seed: 1,
  };
}

const has = (cells: Pos[], col: number, row: number) =>
  cells.some(c => c.col === col && c.row === row);

describe('getReachableCells', () => {
  it('returns all empty cells within speed steps, excluding the start cell', () => {
    const goblin = makeStack(GOBLIN, { col: 5, row: 5 }, 'player'); // speed 5
    const state = makeState([goblin]);
    const cells = getReachableCells(state.grid, goblin);

    expect(has(cells, 5, 5)).toBe(false); // own cell excluded
    expect(has(cells, 5, 0)).toBe(true);  // 5 steps up
    expect(has(cells, 0, 5)).toBe(true);  // 5 steps left
    expect(has(cells, 8, 8)).toBe(false); // 6 steps (3+3 manhattan)
    expect(has(cells, 7, 7)).toBe(true);  // 4 steps manhattan
  });

  it('does not include or path through occupied cells for walkers', () => {
    const goblin = makeStack(GOBLIN, { col: 0, row: 0 }, 'player');
    // wall of units sealing the corner: (1,0) and (0,1) and (1,1)
    const wall1 = makeStack(ORC, { col: 1, row: 0 }, 'enemy');
    const wall2 = makeStack(ORC, { col: 0, row: 1 }, 'enemy');
    const wall3 = makeStack(ORC, { col: 1, row: 1 }, 'enemy');
    const state = makeState([goblin, wall1, wall2, wall3]);
    const cells = getReachableCells(state.grid, goblin);

    expect(cells).toHaveLength(0); // fully sealed in
  });

  it('lets flyers pass over occupants but not land on them', () => {
    const bird = makeStack(THUNDERBIRD, { col: 0, row: 0 }, 'player'); // flying, speed 9
    const wall1 = makeStack(ORC, { col: 1, row: 0 }, 'enemy');
    const wall2 = makeStack(ORC, { col: 0, row: 1 }, 'enemy');
    const wall3 = makeStack(ORC, { col: 1, row: 1 }, 'enemy');
    const state = makeState([bird, wall1, wall2, wall3]);
    const cells = getReachableCells(state.grid, bird);

    expect(has(cells, 2, 0)).toBe(true);  // beyond the wall
    expect(has(cells, 1, 0)).toBe(false); // can't land on occupant
    expect(cells.length).toBeGreaterThan(0);
  });

  it('stays within board bounds', () => {
    const goblin = makeStack(GOBLIN, { col: 0, row: 0 }, 'player');
    const state = makeState([goblin]);
    const cells = getReachableCells(state.grid, goblin);

    expect(cells.every(c => c.col >= 0 && c.col < 12 && c.row >= 0 && c.row < 10)).toBe(true);
  });
});

describe('getMeleeTargets', () => {
  it('returns living adjacent enemies (including diagonals), not friends or distant enemies', () => {
    const goblin = makeStack(GOBLIN, { col: 5, row: 5 }, 'player');
    const adjacentEnemy = makeStack(ORC, { col: 6, row: 5 }, 'enemy');
    const diagonalEnemy = makeStack(ORC, { col: 4, row: 4 }, 'enemy');
    const farEnemy = makeStack(ORC, { col: 9, row: 5 }, 'enemy');
    const adjacentFriend = makeStack(ORC, { col: 5, row: 6 }, 'player');
    const state = makeState([goblin, adjacentEnemy, diagonalEnemy, farEnemy, adjacentFriend]);

    const targets = getMeleeTargets(state, goblin);
    const ids = targets.map(t => t.id);

    expect(ids).toContain(adjacentEnemy.id);
    expect(ids).toContain(diagonalEnemy.id);
    expect(ids).not.toContain(farEnemy.id);
    expect(ids).not.toContain(adjacentFriend.id);
  });

  it('excludes dead stacks', () => {
    const goblin = makeStack(GOBLIN, { col: 5, row: 5 }, 'player');
    const deadEnemy = makeStack(ORC, { col: 6, row: 5 }, 'enemy', { count: 0 });
    const state = makeState([goblin, deadEnemy]);

    expect(getMeleeTargets(state, goblin)).toHaveLength(0);
  });
});

describe('canShoot', () => {
  it('is true only for units with shots remaining', () => {
    const orc = makeStack(ORC, { col: 1, row: 1 }, 'player'); // shots 4
    const spentOrc = makeStack(ORC, { col: 1, row: 2 }, 'player', { shotsLeft: 0 });
    const goblin = makeStack(GOBLIN, { col: 1, row: 3 }, 'player'); // melee only

    expect(canShoot(orc)).toBe(true);
    expect(canShoot(spentOrc)).toBe(false);
    expect(canShoot(goblin)).toBe(false);
  });
});
