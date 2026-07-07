import { describe, it, expect } from 'vitest';
import { stepsFromLogEntry } from '../animSteps';
import type { BattleEvent } from '$lib/engine/types';

describe('stepsFromLogEntry: damage', () => {
  it('maps an attack entry to a single damage step on the target', () => {
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'damage', value: 7 }]);
  });

  it('maps a shoot entry with splash to a damage step keyed on its own target', () => {
    const entry: BattleEvent = {
      type: 'shoot',
      data: { attackerId: 'a1', targetId: 't2', damage: 3, killed: 0, splash: true },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't2', kind: 'damage', value: 3 }]);
  });

  it('maps a lightning cast to a damage step on its target', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'lightning', casterId: 'h1', targetId: 't1', damage: 20, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'damage', value: 20 }]);
  });
});

describe('stepsFromLogEntry: buffs', () => {
  it('maps a bloodlust cast to an attack buff step', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'bloodlust', casterId: 'h1', targetId: 't1' },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'buff', value: 4, label: 'ATK' }]);
  });

  it('maps a stoneskin cast to a defense buff step', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'stoneskin', casterId: 'h1', targetId: 't1' },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'buff', value: 4, label: 'DEF' }]);
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

  it('maps round_start, move, defend, morale_freeze, battle_end to no steps', () => {
    const noop: BattleEvent[] = [
      { type: 'round_start', data: { round: 2 } },
      { type: 'move', data: { unitId: 't1', to: { col: 1, row: 1 } } },
      { type: 'defend', data: { unitId: 't1' } },
      { type: 'morale_freeze', data: { unitId: 't1' } },
      { type: 'battle_end', data: { result: 'player_wins' } },
    ];

    for (const entry of noop) expect(stepsFromLogEntry(entry)).toEqual([]);
  });
});
