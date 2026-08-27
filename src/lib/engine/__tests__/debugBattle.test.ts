import { describe, expect, it } from 'vitest';
import { applyAction, beginCombat, initBattle } from '../battle';
import { createDebugStackTemplate, debugSnapshot, templateFromStack } from '../debugBattle';
import { GOBLIN, ORC } from '../barbarian';
import type { BattleAction, BattleState, Hero, Pos } from '../types';

const hero: Hero = {
  class: 'barbarian',
  level: 2,
  xp: 0,
  attack: 3,
  defense: 2,
  statPoints: 0,
  factionSkills: [],
};

function battle(): BattleState {
  return beginCombat(initBattle([{ unit: GOBLIN, count: 10 }], [{ unit: ORC, count: 8 }], hero, 42));
}

function emptyCell(state: BattleState): Pos {
  for (const row of state.grid.cells) {
    for (const cell of row) {
      if (!cell.blocked && !cell.occupantId) return { col: cell.col, row: cell.row };
    }
  }
  throw new Error('fixture has no empty cell');
}

function debug(operation: Extract<BattleAction, { type: 'debug' }>['operation']): BattleAction {
  return { type: 'debug', operation };
}

describe('battle debug actions', () => {
  it('adds a deterministic stack without consuming the active turn', () => {
    const state = battle();
    const to = emptyCell(state);
    const stack = createDebugStackTemplate(ORC, 'player', 25, hero);
    const next = applyAction(state, debug({ kind: 'add', stack, to, label: 'added Orcs' }));

    expect(next.currentUnitId).toBe(state.currentUnitId);
    expect(next.nextId).toBe(state.nextId + 1);
    expect(next.grid.cells[to.row][to.col].occupantId).toBe(`u${state.nextId}`);
    expect(next.units.find(unit => unit.id === `u${state.nextId}`)).toMatchObject({ count: 25, side: 'player', pos: to });
    expect(next.log.at(-1)).toMatchObject({ type: 'debug', data: { label: 'added Orcs' } });
  });

  it('updates only the selected stack, including abilities and their levels', () => {
    const state = battle();
    const player = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const enemy = state.units.find(unit => unit.side === 'enemy')!;
    const edited = templateFromStack(player);
    edited.definition = {
      ...edited.definition,
      attack: 99,
      abilities: ['life_drain'],
      abilityLevels: { life_drain: 3 },
    };
    edited.count = 17;
    edited.startCount = 17;

    const next = applyAction(state, debug({ kind: 'update', unitId: player.id, stack: edited, label: 'changed Goblins' }));
    const changed = next.units.find(unit => unit.id === player.id)!;
    expect(changed).toMatchObject({ count: 17, startCount: 17 });
    expect(changed.definition).toMatchObject({ attack: 99, abilities: ['life_drain'], abilityLevels: { life_drain: 3 } });
    expect(next.units.find(unit => unit.id === enemy.id)).toEqual(enemy);
  });

  it('deleting the last enemy immediately ends the battle', () => {
    const state = battle();
    const enemy = state.units.find(unit => unit.side === 'enemy')!;
    const next = applyAction(state, debug({ kind: 'delete', unitId: enemy.id, label: 'deleted Orcs' }));

    expect(next.result).toBe('player_wins');
    expect(next.grid.cells[enemy.pos.row][enemy.pos.col].occupantId).toBeNull();
    expect(next.units.find(unit => unit.id === enemy.id)?.count).toBe(0);
    expect(next.log.at(-1)).toMatchObject({ type: 'battle_end', data: { debug: true } });
  });

  it('switches only ownership and preserves custom state', () => {
    const state = battle();
    const player = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const buffed = { ...state, units: state.units.map(unit => unit.id === player.id ? { ...unit, attackBuff: 12 } : unit) };
    const next = applyAction(buffed, debug({ kind: 'switch_side', unitId: player.id, label: 'switched Goblins' }));
    const switched = next.units.find(unit => unit.id === player.id)!;

    expect(switched.side).toBe('enemy');
    expect(switched.attackBuff).toBe(12);
    expect(switched.definition).toBe(player.definition);
  });

  it('restores a checkpoint while retaining a truthful debug journal', () => {
    const state = battle();
    const player = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const edited = templateFromStack(player);
    edited.definition = { ...edited.definition, defense: 77 };
    const changed = applyAction(state, debug({ kind: 'update', unitId: player.id, stack: edited, label: 'changed defense' }));
    const restored = applyAction(changed, debug({ kind: 'restore', snapshot: debugSnapshot(state), label: 'undid changed defense' }));

    expect(restored.units.find(unit => unit.id === player.id)?.definition.defense).toBe(player.definition.defense);
    expect(restored.log.slice(-2).map(event => event.data.label)).toEqual(['changed defense', 'undid changed defense']);
  });

  it('rejects occupied placement cells', () => {
    const state = battle();
    const occupied = state.units.find(unit => !unit.isHero)!.pos;
    const stack = createDebugStackTemplate(ORC, 'player', 2, hero);
    expect(applyAction(state, debug({ kind: 'add', stack, to: occupied, label: 'bad add' }))).toBe(state);
  });
});
