import { describe, it, expect } from 'vitest';
import { createGrid, placeUnits } from '../grid';
import { advanceTurn, predictTurnOrder } from '../turnOrder';
import { initBattle, applyAction } from '../battle';
import { GOBLIN, WOLF_RIDER, THUNDERBIRD, OGRE } from '../barbarian';
import type { BattleState, UnitDef, UnitStack, Pos } from '../types';

const mockHero = { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0 } as const;

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
    hero: { ...mockHero },
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [],
    result: 'ongoing',
    seed: 7,
  };
}

describe('advanceTurn (ATB)', () => {
  it('picks the highest-initiative stack first from a level start', () => {
    const bird = makeStack(THUNDERBIRD, { col: 1, row: 1 }, 'player'); // initiative 14
    const ogre = makeStack(OGRE, { col: 1, row: 3 }, 'enemy'); // initiative 9
    const next = advanceTurn(makeState([bird, ogre]));

    expect(next.currentUnitId).toBe(bird.id);
    expect(next.battleTime).toBeCloseTo(10 / 14);
  });

  it('lets a fast stack act twice before a much slower one acts once', () => {
    const fastDef: UnitDef = { ...GOBLIN, name: 'Fast', initiative: 20 };
    const slowDef: UnitDef = { ...GOBLIN, name: 'Slow', initiative: 9 };
    const fast = makeStack(fastDef, { col: 1, row: 1 }, 'player');
    const slow = makeStack(slowDef, { col: 1, row: 3 }, 'enemy');

    let s = advanceTurn(makeState([fast, slow]));
    const order: string[] = [s.currentUnitId!];
    for (let i = 0; i < 2; i++) {
      // simulate the actor finishing a normal action: re-enter at 0
      s = { ...s, units: s.units.map(u => (u.id === s.currentUnitId ? { ...u, atb: 0 } : u)) };
      s = advanceTurn(s);
      order.push(s.currentUnitId!);
    }
    expect(order).toEqual([fast.id, fast.id, slow.id]);
  });

  it('resets the incoming actor\'s retaliation at the start of its own turn', () => {
    const goblin = makeStack(GOBLIN, { col: 1, row: 1 }, 'player', { hasRetaliated: true });
    const next = advanceTurn(makeState([goblin]));

    expect(next.currentUnitId).toBe(goblin.id);
    expect(next.units.find(u => u.id === goblin.id)!.hasRetaliated).toBe(false);
  });

  it('bumps the round and logs round_start when battleTime crosses an integer', () => {
    const ogre = makeStack(OGRE, { col: 1, row: 1 }, 'player'); // init 9 → dt 10/9 > 1
    const next = advanceTurn(makeState([ogre]));

    expect(next.round).toBe(2);
    expect(next.log.some(e => e.type === 'round_start' && e.data.round === 2)).toBe(true);
  });
});

describe('wait and re-entry', () => {
  it('waiting delays the next turn by half a cycle; a normal action costs a full one', () => {
    // Goblin plus a near-inert enemy (initiative 1) so the battle stays ongoing:
    // the goblin's next turn comes purely from its own re-entry position.
    const goblin = makeStack(GOBLIN, { col: 1, row: 1 }, 'player');
    const slug = makeStack({ ...GOBLIN, name: 'Slug', initiative: 1 }, { col: 10, row: 8 }, 'enemy');
    const state = advanceTurn(makeState([goblin, slug])); // goblin is now mid-turn at atb 1

    const afterWait = applyAction(state, { type: 'wait' });
    const afterMove = applyAction(state, { type: 'move', to: { col: 2, row: 1 } });

    const waitCost = afterWait.battleTime - state.battleTime;
    const moveCost = afterMove.battleTime - state.battleTime;

    expect(afterWait.currentUnitId).toBe(goblin.id); // acts again either way
    expect(waitCost).toBeCloseTo(moveCost / 2);
    expect(moveCost).toBeCloseTo(10 / GOBLIN.initiative / 10 * 10); // one full cycle
  });
});

describe('initBattle deviation', () => {
  it('gives every stack a seeded 0–10% head start, deterministic per seed', () => {
    const a = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: WOLF_RIDER, count: 5 }], { ...mockHero }, 42);
    const b = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: WOLF_RIDER, count: 5 }], { ...mockHero }, 42);

    // deterministic: same seed → same first actor and same atb values
    expect(a.currentUnitId).not.toBeNull();
    expect(b.units.map(u => u.atb)).toEqual(a.units.map(u => u.atb));

    // everyone below one full cycle; the current actor sits at the act point (1.0)
    for (const u of a.units) {
      expect(u.atb).toBeGreaterThanOrEqual(0);
      expect(u.atb).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('predictTurnOrder', () => {
  it('repeats fast stacks and returns n entries', () => {
    const fastDef: UnitDef = { ...GOBLIN, name: 'Fast', initiative: 20 };
    const slowDef: UnitDef = { ...GOBLIN, name: 'Slow', initiative: 9 };
    const fast = makeStack(fastDef, { col: 1, row: 1 }, 'player');
    const slow = makeStack(slowDef, { col: 1, row: 3 }, 'enemy');

    const order = predictTurnOrder([fast, slow], 5);

    expect(order).toHaveLength(5);
    expect(order.slice(0, 3)).toEqual([fast.id, fast.id, slow.id]);
  });

  it('ignores dead stacks', () => {
    const alive = makeStack(GOBLIN, { col: 1, row: 1 }, 'player');
    const dead = makeStack(GOBLIN, { col: 1, row: 3 }, 'enemy', { count: 0 });

    const order = predictTurnOrder([alive, dead], 3);
    expect(order).toEqual([alive.id, alive.id, alive.id]);
  });
});
