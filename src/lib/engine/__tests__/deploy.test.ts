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
import { ENGINE_VERSION } from '../version';
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

describe('large-army placement', () => {
  it('places ten stacks per side on distinct in-bounds cells', () => {
    const army = Array.from({ length: MAX_FIELD_STACKS }, (_, index) => ({
      unit: index % 2 === 0 ? GOBLIN : WOLF_RIDER,
      count: 1,
    }));
    const state = initBattle(army, army, HERO, 42);

    for (const side of ['player', 'enemy'] as const) {
      const stacks = state.units.filter(unit => unit.side === side && !unit.isHero);
      expect(stacks).toHaveLength(10);
      expect(new Set(stacks.map(unit => `${unit.pos.col},${unit.pos.row}`)).size).toBe(10);
      for (const stack of stacks) {
        expect(stack.pos.row).toBeGreaterThanOrEqual(0);
        expect(stack.pos.row).toBeLessThan(state.grid.height);
        expect(state.grid.cells[stack.pos.row][stack.pos.col].occupantId).toBe(stack.id);
      }
    }
  });
});

describe('initBattle deploy phase', () => {
  it('starts in the deploy phase', () => {
    expect(deployState().phase).toBe('deploy');
  });

  it('uses deterministic battle-scoped stack ids', () => {
    const first = deployState();
    const second = deployState();

    expect(first).toEqual(second);
    expect(first.units.map(u => u.id)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(first.nextId).toBe(5);
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
  it('rejects every legacy split request and preserves the whole strategic stack', () => {
    const s = deployState();
    const g = playerStacks(s).find(u => u.definition.name === 'Goblin')!;
    expect(splitStack(s, g.id, 4, { col: 2, row: 7 })).toBe(s);
    expect(playerStacks(s).find(u => u.id === g.id)?.count).toBe(10);
    expect(playerStacks(s)).toHaveLength(2);
  });
});

describe('beginCombat', () => {
  it('flips the phase and starts the replay journal from an empty log', () => {
    const combat = beginCombat(deployState());
    expect(combat.phase).toBe('combat');
    expect(combat.log).toEqual([]);
  });
});

describe('engine version', () => {
  it('exports a stable non-empty replay compatibility stamp', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
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
