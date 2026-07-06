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

/** Whether the unit can shoot this specific target: shots left and within range. */
export function canShootTarget(unit: UnitStack, target: UnitStack): boolean {
  return canShoot(unit) && chebyshevDistance(unit.pos, target.pos) <= unit.definition.range;
}

/** LordsWM rule: a living enemy directly adjacent disables shooting. */
export function isShootingBlocked(state: BattleState, unit: UnitStack): boolean {
  return state.units.some(
    u => u.side !== unit.side && u.count > 0 && chebyshevDistance(unit.pos, u.pos) === 1
  );
}

/**
 * Every cell the unit could attack this target from during this turn:
 * its own cell when already adjacent, plus each reachable cell adjacent
 * to the target. Empty when the target is out of reach.
 */
export function getAttackOrigins(state: BattleState, unit: UnitStack, target: UnitStack): Pos[] {
  const origins: Pos[] = [];
  if (chebyshevDistance(unit.pos, target.pos) === 1) {
    origins.push({ col: unit.pos.col, row: unit.pos.row });
  }
  for (const cell of getReachableCells(state.grid, unit)) {
    if (chebyshevDistance(cell, target.pos) === 1) origins.push(cell);
  }
  return origins;
}

/**
 * Melee options this turn: enemy id → where to stand to hit them.
 * `null` means already adjacent (attack in place); otherwise the first
 * reachable cell (BFS order, so near-minimal walking) adjacent to that enemy.
 * Enemies no reachable cell touches are absent.
 */
export function getMeleeApproaches(state: BattleState, unit: UnitStack): Map<string, Pos | null> {
  const approaches = new Map<string, Pos | null>();
  const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0);
  const reachable = getReachableCells(state.grid, unit);

  for (const enemy of enemies) {
    if (chebyshevDistance(unit.pos, enemy.pos) === 1) {
      approaches.set(enemy.id, null);
      continue;
    }
    const dest = reachable.find(cell => chebyshevDistance(cell, enemy.pos) === 1);
    if (dest) approaches.set(enemy.id, dest);
  }
  return approaches;
}
