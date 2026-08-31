import type { BattleState, Pos } from './types.ts';
import { setOccupant } from './grid.ts';

export type MoveKind = 'voluntary' | 'forced' | 'teleport' | 'return' | 'advance';

export function moveStack(state: BattleState, stackId: string, destination: Pos, options: { kind: MoveKind }): BattleState {
  const stack = state.units.find(unit => unit.id === stackId && unit.count > 0 && !unit.isHero);
  const cell = state.grid.cells[destination.row]?.[destination.col];
  if (!stack || !cell || cell.blocked || cell.occupantId) return state;
  if (options.kind === 'forced' && (stack.effects ?? []).some(effect => effect.kind === 'braced')) return state;
  const moved = {
    ...stack,
    pos: destination,
    effects: options.kind === 'voluntary' || options.kind === 'teleport'
      ? (stack.effects ?? []).filter(effect => effect.kind !== 'braced')
      : stack.effects,
    ...(options.kind === 'voluntary' || options.kind === 'teleport' ? { lastMovedFrom: stack.pos } : {}),
  };
  // A Dendroid releases only effects sourced by itself when it changes cell.
  const units = state.units.map(unit => {
    if (unit.id === stack.id) return moved;
    if (!stack.definition.abilities.includes('bind')) return unit;
    return { ...unit, effects: (unit.effects ?? []).filter(effect => !(effect.kind === 'bind' && effect.sourceStackId === stack.id)) };
  });
  return {
    ...state,
    units,
    grid: setOccupant(setOccupant(state.grid, stack.pos, null), destination, stack.id),
  };
}
