import { describe, it, expect } from 'vitest';
import { createGrid, placeUnits } from '../grid';
import { getReachableCells, getMeleeTargets, getAttackOrigins, canShoot, damagePreview } from '../selectors';
import { GOBLIN, ORC, THUNDERBIRD, WOLF_RIDER } from '../barbarian';
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
    isDefending: false,
    ...overrides,
  };
}

function makeState(units: UnitStack[]): BattleState {
  let grid = createGrid(12, 10);
  grid = placeUnits(grid, units);
  return {
    grid,
    units,
    hero: { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] },
    round: 1,
    battleTime: 0,
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

describe('getAttackOrigins', () => {
  it('returns every reachable cell adjacent to the target, plus own cell when already adjacent', () => {
    const rider = makeStack(WOLF_RIDER, { col: 4, row: 4 }, 'player'); // speed 7
    const enemy = makeStack(ORC, { col: 5, row: 4 }, 'enemy');
    const state = makeState([rider, enemy]);

    const origins = getAttackOrigins(state, rider, enemy);

    // own cell first: already adjacent, can attack in place
    expect(has(origins, 4, 4)).toBe(true);
    // all 7 other cells ringing the enemy are empty and within speed
    expect(has(origins, 6, 4)).toBe(true);
    expect(has(origins, 5, 3)).toBe(true);
    expect(has(origins, 5, 5)).toBe(true);
    expect(has(origins, 4, 3)).toBe(true);
    expect(has(origins, 4, 5)).toBe(true);
    expect(has(origins, 6, 3)).toBe(true);
    expect(has(origins, 6, 5)).toBe(true);
    expect(origins).toHaveLength(8);
    // enemy's own cell is never an origin
    expect(has(origins, 5, 4)).toBe(false);
  });

  it('excludes occupied ring cells and cells beyond speed', () => {
    const goblin = makeStack(GOBLIN, { col: 2, row: 4 }, 'player'); // speed 5
    const enemy = makeStack(ORC, { col: 6, row: 4 }, 'enemy');
    const blocker = makeStack(ORC, { col: 5, row: 4 }, 'enemy'); // occupies a ring cell
    const state = makeState([goblin, enemy, blocker]);

    const origins = getAttackOrigins(state, goblin, enemy);

    expect(has(origins, 5, 4)).toBe(false); // occupied
    expect(has(origins, 5, 3)).toBe(true);  // 4 steps
    expect(has(origins, 7, 4)).toBe(false); // 5+ steps behind the enemy, path around > speed
    expect(origins.length).toBeGreaterThan(0);
  });

  it('is empty when the target is out of reach', () => {
    const goblin = makeStack(GOBLIN, { col: 0, row: 0 }, 'player'); // speed 5
    const enemy = makeStack(ORC, { col: 11, row: 9 }, 'enemy');
    const state = makeState([goblin, enemy]);

    expect(getAttackOrigins(state, goblin, enemy)).toHaveLength(0);
  });
});

describe('damagePreview', () => {
  it('reports the min/max roll through the attack/defense modifier, with kill ranges', () => {
    // 5 wolf riders (atk 5, dmg 2–5) vs goblins (def 1, hp 5): atk−def = 4 → ×1.2
    const riders = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'player');
    const goblins = makeStack(GOBLIN, { col: 2, row: 1 }, 'enemy', { count: 10 });

    const p = damagePreview(riders, goblins, 0);

    expect(p.min).toBe(12); // 2×5×1.2
    expect(p.max).toBe(30); // 5×5×1.2
    expect(p.killsMin).toBe(2); // 12 dmg vs 5 hp
    expect(p.killsMax).toBe(6); // 30 dmg vs 5 hp
  });

  it('caps kills at the stack size and applies buffs', () => {
    const riders = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'player', { attackBuff: 4 }); // atk 9 vs def 1 → ×1.4
    const goblins = makeStack(GOBLIN, { col: 2, row: 1 }, 'enemy', { count: 3 });

    const p = damagePreview(riders, goblins, 0);

    expect(p.min).toBe(14); // 2×5×1.4
    expect(p.killsMax).toBe(3); // only 3 goblins to kill
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
