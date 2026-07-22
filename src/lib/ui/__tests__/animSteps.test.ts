import { describe, it, expect } from 'vitest';
import { stepsFromLogEntry, applyLogEntry, deathIdsIn } from '../animSteps';
import { createGrid, placeUnits } from '$lib/engine/grid';
import { GOBLIN } from '$lib/engine/barbarian';
import type { BattleEvent, BattleState, UnitDef, UnitStack, Pos } from '$lib/engine/types';

function makeStack(def: UnitDef, pos: Pos, side: 'player' | 'enemy', overrides: Partial<UnitStack> = {}): UnitStack {
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
    hero: { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] },
    round: 1,
    battleTime: 0,
    currentUnitId: units[0]?.id ?? null,
    log: [],
    result: 'ongoing',
    seed: 1,
    nextId: 1,
  };
}

describe('stepsFromLogEntry: damage', () => {
  it('maps an attack entry to an attacker strike lunge plus a damage step on the target', () => {
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([
      { unitId: 'a1', kind: 'strike', targetId: 't1' },
      { unitId: 't1', kind: 'recoil', fromId: 'a1' },
      { unitId: 't1', kind: 'damage', value: 7 },
    ]);
  });

  it('carries the kill count on the damage step', () => {
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 3 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toContainEqual({ unitId: 't1', kind: 'damage', value: 7, kills: 3 });
  });

  it('omits kills from the damage step when nothing died', () => {
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toContainEqual({ unitId: 't1', kind: 'damage', value: 7 });
  });

  it('maps a retaliate entry to a strike lunge by the retaliator plus damage', () => {
    const entry: BattleEvent = {
      type: 'retaliate',
      data: { attackerId: 't1', targetId: 'a1', damage: 4, killed: 0 },
    };

    expect(stepsFromLogEntry(entry)).toEqual([
      { unitId: 't1', kind: 'strike', targetId: 'a1' },
      { unitId: 'a1', kind: 'recoil', fromId: 't1' },
      { unitId: 'a1', kind: 'damage', value: 4 },
    ]);
  });

  it('maps a shoot entry to a projectile from the attacker plus delayed damage on the target', () => {
    const entry: BattleEvent = {
      type: 'shoot',
      data: { attackerId: 'a1', targetId: 't1', damage: 5, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([
      { unitId: 'a1', kind: 'projectile', targetId: 't1' },
      { unitId: 't1', kind: 'recoil', fromId: 'a1', delayed: true },
      { unitId: 't1', kind: 'damage', value: 5, delayed: true },
    ]);
  });

  it('maps a shoot entry with splash to a damage step only — no recoil, no second arrow', () => {
    const entry: BattleEvent = {
      type: 'shoot',
      data: { attackerId: 'a1', targetId: 't2', damage: 3, killed: 0, splash: true },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't2', kind: 'damage', value: 3 }]);
  });

  it('maps a lightning cast to a bolt flash plus delayed damage on its target', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'lightning', casterId: 'h1', targetId: 't1', damage: 20, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([
      { unitId: 't1', kind: 'spell_fx', spell: 'lightning' },
      { unitId: 't1', kind: 'damage', value: 20, delayed: true },
    ]);
  });
});

describe('stepsFromLogEntry: buffs', () => {
  it('maps a bloodlust cast to an attack buff step', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'bloodlust', casterId: 'h1', targetId: 't1' },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([
      { unitId: 't1', kind: 'spell_fx', spell: 'bloodlust' },
      { unitId: 't1', kind: 'buff', value: 4, label: 'ATK', delayed: true },
    ]);
  });

  it('maps a stoneskin cast to a defense buff step', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'stoneskin', casterId: 'h1', targetId: 't1' },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([
      { unitId: 't1', kind: 'spell_fx', spell: 'stoneskin' },
      { unitId: 't1', kind: 'buff', value: 4, label: 'DEF', delayed: true },
    ]);
  });
});

describe('stepsFromLogEntry: death and status', () => {
  it('maps a death entry to a death step', () => {
    const entry: BattleEvent = { type: 'death', data: { unitId: 't1' } };

    expect(stepsFromLogEntry(entry)).toEqual([{ unitId: 't1', kind: 'death' }]);
  });

  it('maps a burn status entry to a status step with the fire icon', () => {
    const entry: BattleEvent = {
      type: 'status',
      data: { effect: 'burn_apply', unitId: 't1' },
    };

    expect(stepsFromLogEntry(entry)).toEqual([{ unitId: 't1', kind: 'status', icon: '🔥' }]);
  });

  it('maps an unrecognized status effect to no steps rather than throwing', () => {
    const entry: BattleEvent = {
      type: 'status',
      data: { effect: 'some_future_effect', unitId: 't1' },
    };

    expect(stepsFromLogEntry(entry)).toEqual([]);
  });

  it('maps round_start, defend, battle_end to no steps', () => {
    const noop: BattleEvent[] = [
      { type: 'round_start', data: { round: 2 } },
      { type: 'defend', data: { unitId: 't1' } },
      { type: 'battle_end', data: { result: 'player_wins' } },
    ];

    for (const entry of noop) expect(stepsFromLogEntry(entry)).toEqual([]);
  });

  it('floats an icon for a morale roll firing either way', () => {
    expect(stepsFromLogEntry({ type: 'morale_boost', data: { unitId: 't1' } }))
      .toEqual([{ unitId: 't1', kind: 'status', icon: '🎺' }]);
    expect(stepsFromLogEntry({ type: 'morale_freeze', data: { unitId: 't1' } }))
      .toEqual([{ unitId: 't1', kind: 'status', icon: '❄️' }]);
  });

  it('distinguishes good and bad luck', () => {
    expect(stepsFromLogEntry({ type: 'luck', data: { unitId: 't1', kind: 'good' } }))
      .toEqual([{ unitId: 't1', kind: 'status', icon: '🍀' }]);
    expect(stepsFromLogEntry({ type: 'luck', data: { unitId: 't1', kind: 'bad' } }))
      .toEqual([{ unitId: 't1', kind: 'status', icon: '💢' }]);
  });
});

describe('stepsFromLogEntry: movement', () => {
  it('maps a move entry to a slide step carrying from and to', () => {
    const entry: BattleEvent = {
      type: 'move',
      data: { unitId: 't1', from: { col: 1, row: 1 }, to: { col: 4, row: 2 } },
    };

    expect(stepsFromLogEntry(entry)).toEqual([
      { unitId: 't1', kind: 'move', from: { col: 1, row: 1 }, to: { col: 4, row: 2 } },
    ]);
  });
});

describe('applyLogEntry', () => {
  it('reduces the target stack toward 0 count by damage, one creature at a time', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'enemy', { count: 5, hp: GOBLIN.hp });
    const state = makeState([target]);
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'x', targetId: target.id, damage: GOBLIN.hp + 1, killed: 1 },
    };

    const next = applyLogEntry(state, entry);

    const patched = next.units.find(u => u.id === target.id)!;
    expect(patched.count).toBe(4);
  });

  it('zeroes the stack on a death entry', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'enemy', { count: 1 });
    const state = makeState([target]);
    const entry: BattleEvent = { type: 'death', data: { unitId: target.id } };

    const next = applyLogEntry(state, entry);

    expect(next.units.find(u => u.id === target.id)!.count).toBe(0);
  });

  it('applies an attack buff on a bloodlust cast', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'player');
    const state = makeState([target]);
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'bloodlust', casterId: 'h1', targetId: target.id },
    };

    const next = applyLogEntry(state, entry);

    expect(next.units.find(u => u.id === target.id)!.attackBuff).toBe(4);
  });

  it('relocates the unit and its grid occupancy on a move entry', () => {
    const mover = makeStack(GOBLIN, { col: 2, row: 3 }, 'player');
    const state = makeState([mover]);
    const entry: BattleEvent = {
      type: 'move',
      data: { unitId: mover.id, from: { col: 2, row: 3 }, to: { col: 5, row: 4 } },
    };

    const next = applyLogEntry(state, entry);

    expect(next.units.find(u => u.id === mover.id)!.pos).toEqual({ col: 5, row: 4 });
    expect(next.grid.cells[3][2].occupantId).toBeNull();
    expect(next.grid.cells[4][5].occupantId).toBe(mover.id);
  });

  it('is a no-op for entry types it does not need to patch', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'player');
    const state = makeState([target]);
    const entry: BattleEvent = { type: 'defend', data: { unitId: target.id } };

    const next = applyLogEntry(state, entry);

    expect(next.units).toEqual(state.units);
  });
});

describe('deathIdsIn', () => {
  it('collects every death entry unit id from a batch', () => {
    const entries: BattleEvent[] = [
      { type: 'attack', data: { attackerId: 'a1', targetId: 't1', damage: 9, killed: 3 } },
      { type: 'death', data: { unitId: 't1' } },
      { type: 'retaliate', data: { attackerId: 't2', targetId: 'a1', damage: 4, killed: 1 } },
      { type: 'death', data: { unitId: 'a1' } },
    ];
    expect(deathIdsIn(entries)).toEqual(new Set(['t1', 'a1']));
  });

  it('returns an empty set when nothing dies', () => {
    expect(deathIdsIn([{ type: 'move', data: { unitId: 'u1', to: { col: 1, row: 1 } } }])).toEqual(new Set());
  });
});
