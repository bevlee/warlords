import { describe, it, expect } from 'vitest';
import {
  initBattle,
  isInDeployZone,
  deployMove,
  splitStack,
  beginCombat,
  DEPLOY_COLS,
  MAX_FIELD_STACKS,
} from '../battle';
import { GOBLIN, WOLF_RIDER } from '../barbarian';
import type { BattleState, Hero, Pos } from '../types';

const HERO: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [] };

function deployState(): BattleState {
  // Two player stacks (auto-placed at col 1, rows 1 & 2), enemies on the right.
  return initBattle(
    [{ unit: GOBLIN, count: 10 }, { unit: WOLF_RIDER, count: 6 }],
    [{ unit: GOBLIN, count: 8 }],
    HERO,
    42
  );
}

const playerStacks = (s: BattleState) => s.units.filter(u => u.side === 'player' && !u.isHero);
const cellOccupant = (s: BattleState, p: Pos) => s.grid.cells[p.row][p.col].occupantId;

describe('isInDeployZone', () => {
  it('accepts the left columns and rejects beyond them (no Tactics)', () => {
    for (let col = 0; col < DEPLOY_COLS; col++) expect(isInDeployZone({ col, row: 3 }, 0)).toBe(true);
    expect(isInDeployZone({ col: DEPLOY_COLS, row: 3 }, 0)).toBe(false);
  });

  it('Tactics shift extends the zone forward', () => {
    expect(isInDeployZone({ col: DEPLOY_COLS, row: 3 }, 1)).toBe(true);       // col 3 now in
    expect(isInDeployZone({ col: DEPLOY_COLS + 1, row: 3 }, 1)).toBe(false);  // col 4 still out
  });

  it('rejects out-of-bounds rows', () => {
    expect(isInDeployZone({ col: 0, row: -1 }, 0)).toBe(false);
    expect(isInDeployZone({ col: 0, row: 999 }, 0)).toBe(false);
  });
});

describe('initBattle deploy phase', () => {
  it('starts in the deploy phase', () => {
    expect(deployState().phase).toBe('deploy');
  });
});

describe('deployMove', () => {
  it('moves a stack to an empty in-zone cell and updates the grid', () => {
    const s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!;
    const to: Pos = { col: 0, row: 5 };

    const next = deployMove(s, g.id, to);
    const moved = next.units.find(u => u.id === g.id)!;

    expect(moved.pos).toEqual(to);
    expect(cellOccupant(next, to)).toBe(g.id);
    expect(cellOccupant(next, g.pos)).toBeNull();
  });

  it('swaps two of your stacks when the target cell is occupied by another', () => {
    const s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!;
    const w = playerStacks(s).find(u => u.definition.name === 'Wolf Rider')!;

    const next = deployMove(s, g.id, w.pos);

    expect(next.units.find(u => u.id === g.id)!.pos).toEqual(w.pos);
    expect(next.units.find(u => u.id === w.id)!.pos).toEqual(g.pos);
    expect(cellOccupant(next, w.pos)).toBe(g.id);
    expect(cellOccupant(next, g.pos)).toBe(w.id);
  });

  it('rejects a move outside the deploy zone', () => {
    const s = deployState();
    const g = playerStacks(s)[0];
    expect(deployMove(s, g.id, { col: 8, row: 4 })).toBe(s);
  });

  it('rejects moving onto an enemy stack', () => {
    const s = deployState();
    const g = playerStacks(s)[0];
    const enemy = s.units.find(u => u.side === 'enemy')!;
    expect(deployMove(s, g.id, enemy.pos)).toBe(s);
  });

  it('ignores an unknown unit id', () => {
    const s = deployState();
    expect(deployMove(s, 'nope', { col: 0, row: 0 })).toBe(s);
  });
});

describe('splitStack', () => {
  it('peels a smaller stack onto an empty in-zone cell', () => {
    const s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!;
    const to: Pos = { col: 2, row: 7 };

    const next = splitStack(s, g.id, 4, to);
    const src = next.units.find(u => u.id === g.id)!;
    const created = next.units.find(u => u.id !== g.id && u.definition.name === 'Goblin' && u.pos.col === 2 && u.pos.row === 7)!;

    expect(src.count).toBe(6);
    expect(created.count).toBe(4);
    expect(created.hp).toBe(GOBLIN.hp);
    expect(cellOccupant(next, to)).toBe(created.id);
  });

  it('rejects an amount at or above the stack size, or below 1', () => {
    const s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!; // count 10
    expect(splitStack(s, g.id, 10, { col: 2, row: 7 })).toBe(s);
    expect(splitStack(s, g.id, 0, { col: 2, row: 7 })).toBe(s);
  });

  it('rejects splitting onto an occupied cell', () => {
    const s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!;
    const w = playerStacks(s).find(u => u.definition.name === 'Wolf Rider')!;
    expect(splitStack(s, g.id, 3, w.pos)).toBe(s);
  });

  it('refuses to split past the field-stack cap', () => {
    let s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!; // count 10
    // Split off 1-count stacks into fresh cells until at the cap, then one more must fail.
    let col = 0, row = 8;
    for (let i = 0; playerStacks(s).length < MAX_FIELD_STACKS && i < 20; i++) {
      const cur = playerStacks(s).find(u => u.id === g.id)!;
      if (cur.count < 2) break;
      s = splitStack(s, g.id, 1, { col, row });
      col = (col + 1) % DEPLOY_COLS;
      if (col === 0) row = row === 8 ? 9 : 0;
    }
    expect(playerStacks(s).length).toBe(MAX_FIELD_STACKS);
    const over = splitStack(s, g.id, 1, { col: 2, row: 0 });
    expect(over).toBe(s);
  });
});

describe('beginCombat', () => {
  it('flips the phase to combat', () => {
    expect(beginCombat(deployState()).phase).toBe('combat');
  });
});

describe('deployMove sequences', () => {
  it('swaps correctly after the mover already moved once', () => {
    let s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!;
    const w = playerStacks(s).find(u => u.definition.name === 'Wolf Rider')!;

    s = deployMove(s, g.id, { col: 2, row: 0 });
    const s2 = deployMove(s, g.id, w.pos);

    expect(s2.units.find(u => u.id === g.id)!.pos).toEqual(w.pos);
    expect(s2.units.find(u => u.id === w.id)!.pos).toEqual({ col: 2, row: 0 });
    expect(cellOccupant(s2, w.pos)).toBe(g.id);
    expect(cellOccupant(s2, { col: 2, row: 0 })).toBe(w.id);
  });
});
