import { describe, it, expect } from 'vitest';
import { createGrid, placeUnits } from '../grid';
import { advanceTurn, predictTurnOrder, predictTurnSchedule, previewTurnSchedule } from '../turnOrder';
import { calculateDamage } from '../combat';
import { initBattle, applyAction } from '../battle';
import { GOBLIN, WOLF_RIDER, THUNDERBIRD, OGRE } from '../barbarian';
import type { ArmySlot, BattleState, Hero, UnitDef, UnitStack, Pos } from '../types';

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
    startCount: 5,
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
    hero: { ...mockHero },
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [],
    result: 'ongoing',
    seed: 7,
    nextId: 1,
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

describe('defend', () => {
  it('reduces incoming damage while defending', () => {
    const attacker = makeStack(WOLF_RIDER, { col: 1, row: 1 }, 'player');
    const defender = makeStack(OGRE, { col: 2, row: 1 }, 'enemy');
    const defending = { ...defender, isDefending: true };

    const rngA = () => 0.5;
    const rngB = () => 0.5;
    const normal = calculateDamage(attacker, defender, 0, rngA);
    const reduced = calculateDamage(attacker, defending, 0, rngB);

    expect(reduced).toBeLessThan(normal);
  });

  it('applyAction defend sets the stance and logs it; the stance holds through enemy turns', () => {
    // Enemy initiative 10 < goblin's 11, so the enemy acts next after the defend.
    const goblin = makeStack(GOBLIN, { col: 1, row: 1 }, 'player');
    const enemy = makeStack({ ...GOBLIN, name: 'Slowbin', initiative: 10 }, { col: 10, row: 8 }, 'enemy');
    const state = advanceTurn(makeState([goblin, enemy]));
    expect(state.currentUnitId).toBe(goblin.id);

    const next = applyAction(state, { type: 'defend' });

    expect(next.log.some(e => e.type === 'defend' && e.data.unitId === goblin.id)).toBe(true);
    expect(next.currentUnitId).toBe(enemy.id); // enemy's turn now
    expect(next.units.find(u => u.id === goblin.id)!.isDefending).toBe(true); // stance held
  });

  it('the stance clears at the start of the stack\'s own next turn', () => {
    const goblin = makeStack(GOBLIN, { col: 1, row: 1 }, 'player', { isDefending: true });
    const next = advanceTurn(makeState([goblin]));

    expect(next.currentUnitId).toBe(goblin.id);
    expect(next.units.find(u => u.id === goblin.id)!.isDefending).toBe(false);
  });
});

describe('initBattle scale start', () => {
  const armies = (): [ArmySlot[], ArmySlot[]] => [
    [{ unit: GOBLIN, count: 5 }],
    [{ unit: WOLF_RIDER, count: 5 }],
  ];

  it('starts every stack level, so initiative alone picks the opening actor', () => {
    const [player, enemy] = armies();
    const state = initBattle(player, enemy, { ...mockHero }, 42);

    // Wolf Rider 13 beats Goblin 11 and the hero's 10 — no head start to muddy it.
    const first = state.units.find(u => u.id === state.currentUnitId)!;
    expect(first.definition.name).toBe('Wolf Rider');

    // The actor is at the act point; everyone else is partway, never past it.
    for (const u of state.units) {
      expect(u.atb).toBeGreaterThanOrEqual(0);
      expect(u.atb).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('draws a distinct seeded tiePriority per stack, reproducible per seed', () => {
    const [player, enemy] = armies();
    const a = initBattle(player, enemy, { ...mockHero }, 42);
    const b = initBattle(player, enemy, { ...mockHero }, 42);
    const c = initBattle(player, enemy, { ...mockHero }, 43);

    const priorities = a.units.map(u => u.tiePriority);
    expect(priorities.every(p => typeof p === 'number')).toBe(true);
    expect(new Set(priorities).size).toBe(priorities.length); // no two alike

    expect(b.units.map(u => u.tiePriority)).toEqual(priorities); // replay-safe
    expect(c.units.map(u => u.tiePriority)).not.toEqual(priorities); // seed matters
  });

  it('breaks an exact tie by tiePriority rather than by side', () => {
    const def: UnitDef = { ...GOBLIN, name: 'Even', initiative: 10 };
    // The enemy draws the lower priority, so it acts first despite the side.
    const player = makeStack(def, { col: 1, row: 1 }, 'player', { id: 'p', tiePriority: 0.9 });
    const enemy = makeStack(def, { col: 1, row: 3 }, 'enemy', { id: 'e', tiePriority: 0.1 });

    expect(predictTurnOrder([player, enemy], 4)).toEqual(['e', 'p', 'e', 'p']);
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

describe('predictTurnSchedule', () => {
  it('tags each turn with the round it falls in', () => {
    // Initiative 10 is exactly one turn per round. From a cold scale (atb 0)
    // the first turn costs a full cycle, so it already lands in round 2 —
    // the same reason advanceTurn bumps an Ogre to round 2 on its first turn.
    const evenDef: UnitDef = { ...GOBLIN, name: 'Even', initiative: 10 };
    const cold = makeStack(evenDef, { col: 1, row: 1 }, 'player');
    expect(predictTurnSchedule([cold], 3).map(s => s.round)).toEqual([2, 3, 4]);

    // A stack already at the act point, as the current actor always is, acts
    // now — in the round the battle is already in.
    const acting = makeStack(evenDef, { col: 1, row: 1 }, 'player', { atb: 1 });
    expect(predictTurnSchedule([acting], 3).map(s => s.round)).toEqual([1, 2, 3]);
  });

  it('agrees with advanceTurn about which round a turn lands in', () => {
    const fastDef: UnitDef = { ...GOBLIN, name: 'Fast', initiative: 20 };
    const slowDef: UnitDef = { ...GOBLIN, name: 'Slow', initiative: 7 };
    let state = makeState([
      makeStack(fastDef, { col: 1, row: 1 }, 'player'),
      makeStack(slowDef, { col: 1, row: 3 }, 'enemy'),
    ]);

    const predicted = predictTurnSchedule(state.units, 6, state.battleTime);

    for (const slot of predicted) {
      state = advanceTurn(state);
      expect(state.currentUnitId).toBe(slot.unitId);
      expect(state.round).toBe(slot.round);
      // Re-enter at 0, which is what the prediction assumes.
      state = {
        ...state,
        units: state.units.map(u => (u.id === state.currentUnitId ? { ...u, atb: 0 } : u)),
      };
    }
  });

  it('re-shapes the whole prediction when a stack gains initiative mid-battle', () => {
    const def: UnitDef = { ...GOBLIN, name: 'Even', initiative: 10 };
    const a = makeStack(def, { col: 1, row: 1 }, 'player', { id: 'a' });
    const b = makeStack(def, { col: 1, row: 3 }, 'enemy', { id: 'b' });

    // Identical stacks alternate, player first on ties.
    expect(predictTurnSchedule([a, b], 4).map(s => s.unitId)).toEqual(['a', 'b', 'a', 'b']);

    // Doubling b's fill rate rewrites the order from the very next turn — no
    // turn has to elapse first for the change to show up. b takes 3 of the 4
    // slots instead of 2, and now leads.
    const hasted = { ...b, initiativeBonus: 10 };
    expect(predictTurnSchedule([a, hasted], 4).map(s => s.unitId)).toEqual(['b', 'a', 'b', 'b']);
  });
});

describe('previewTurnSchedule', () => {
  const evenDef: UnitDef = { ...GOBLIN, name: 'Even', initiative: 10 };

  /** Two identical stacks with the player already at the act point. */
  function standoff(): BattleState {
    const a = makeStack(evenDef, { col: 1, row: 1 }, 'player', { id: 'a', atb: 1, tiePriority: 0.1 });
    const b = makeStack(evenDef, { col: 1, row: 3 }, 'enemy', { id: 'b', atb: 0.4, tiePriority: 0.9 });
    return { ...makeState([a, b]), currentUnitId: 'a' };
  }

  it('shows a waiting stack acting sooner than a finished turn would', () => {
    const state = standoff();

    // Re-entering at 0, 'a' needs a full cycle and 'b' beats it to the punch.
    expect(previewTurnSchedule(state, 'defend', 3).map(s => s.unitId)).toEqual(['b', 'a', 'b']);
    // Re-entering at 0.5, 'a' only needs half a cycle and goes first instead.
    expect(previewTurnSchedule(state, 'wait', 3).map(s => s.unitId)).toEqual(['a', 'b', 'a']);
  });

  it('predicts the order the engine actually produces after the action', () => {
    let state = standoff();
    const predicted = previewTurnSchedule(state, 'wait', 5);

    state = applyAction(state, { type: 'wait' });

    for (const [i, slot] of predicted.entries()) {
      if (i > 0) state = advanceTurn(state);
      expect(state.currentUnitId).toBe(slot.unitId);
      expect(state.round).toBe(slot.round);
      // Every stack after the previewed one re-enters at 0, as the prediction assumes.
      state = {
        ...state,
        units: state.units.map(u => (u.id === state.currentUnitId ? { ...u, atb: 0 } : u)),
      };
    }
  });

  it('leaves the battle state untouched', () => {
    const state = standoff();
    const before = JSON.stringify(state);

    previewTurnSchedule(state, 'wait', 8);

    expect(JSON.stringify(state)).toBe(before);
  });

  it('falls back to the plain schedule when no stack is acting', () => {
    const state = { ...standoff(), currentUnitId: null };

    expect(previewTurnSchedule(state, 'wait', 3)).toEqual(
      predictTurnSchedule(state.units, 3, state.battleTime)
    );
  });
});
