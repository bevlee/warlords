import type { BattleState, Grid, Pos, UnitStack } from './types';
import { getNeighbours, chebyshevDistance } from './grid';

/**
 * Empty cells the unit can move to this turn: BFS from its position,
 * at most `speed` steps. Walkers cannot path through occupants; flyers
 * pass over them but cannot land on them. The start cell is excluded.
 */
export function getReachableCells(grid: Grid, unit: UnitStack): Pos[] {
  const flying = unit.definition.abilities.includes('flying');
  const key = (p: Pos) => `${p.col},${p.row}`;
  const visited = new Set<string>([key(unit.pos)]);
  const reachable: Pos[] = [];
  let frontier: Pos[] = [unit.pos];

  for (let step = 0; step < unit.definition.speed; step++) {
    const next: Pos[] = [];
    for (const pos of frontier) {
      for (const nb of getNeighbours(grid, pos.col, pos.row)) {
        const k = key(nb);
        if (visited.has(k) || nb.blocked) continue;
        const occupied = nb.occupantId !== null;
        if (occupied && !flying) continue;
        visited.add(k);
        next.push({ col: nb.col, row: nb.row });
        if (!occupied) reachable.push({ col: nb.col, row: nb.row });
      }
    }
    frontier = next;
  }
  return reachable;
}

/** Living enemy stacks adjacent to the unit (Chebyshev distance 1). */
export function getMeleeTargets(state: BattleState, unit: UnitStack): UnitStack[] {
  return state.units.filter(
    u => u.side !== unit.side && u.count > 0 && chebyshevDistance(unit.pos, u.pos) === 1
  );
}

/** Whether the unit can fire a ranged shot this turn. */
export function canShoot(unit: UnitStack): boolean {
  return unit.definition.shots > 0 && unit.shotsLeft > 0;
}
