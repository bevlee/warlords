import type { BattleState, Pos, UnitStack } from './types.ts';
import { chebyshevDistance, findPath, pathCost, setOccupant } from './grid.ts';

export type MoveKind = 'voluntary' | 'forced' | 'teleport' | 'return' | 'advance';

export interface MovementRoute {
  path: Pos[];
  distance: number;
  direct: boolean;
}

/** Resolve the route used by both movement mechanics and animation. Walkers
 * follow the shortest legal path around rocks and units; flyers and
 * teleporters travel directly to the destination. */
export function movementRoute(state: BattleState, stack: UnitStack, destination: Pos, kind: MoveKind = 'voluntary'): MovementRoute {
  const direct = kind === 'teleport' || stack.definition.abilities.includes('flying') || stack.definition.abilities.includes('teleport');
  if (direct) {
    return { path: [destination], distance: chebyshevDistance(stack.pos, destination), direct: true };
  }
  const path = findPath(state.grid, stack.pos, destination, stack.id);
  return { path, distance: pathCost(stack.pos, path), direct: false };
}

export function moveStack(state: BattleState, stackId: string, destination: Pos, options: { kind: MoveKind }): BattleState {
  const stack = state.units.find(unit => unit.id === stackId && unit.count > 0 && !unit.isHero);
  const cell = state.grid.cells[destination.row]?.[destination.col];
  if (!stack || !cell || cell.blocked || cell.occupantId) return state;
  if (options.kind === 'forced' && (stack.effects ?? []).some(effect => effect.kind === 'braced')) return state;
  const route = movementRoute(state, stack, destination, options.kind);
  if (!route.direct && route.path.length === 0) return state;
  const tracksMovement = options.kind === 'voluntary' || options.kind === 'teleport';
  const moved = {
    ...stack,
    pos: destination,
    effects: tracksMovement
      ? (stack.effects ?? []).filter(effect => effect.kind !== 'braced')
      : stack.effects,
    ...(tracksMovement ? { lastMovedFrom: stack.pos, lastMovedDistance: route.distance, lastMovePath: route.path } : {}),
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
