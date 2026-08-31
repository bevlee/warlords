import type { BattleState, Grid, Pos, UnitStack } from './types.ts';
import { chebyshevDistance, setOccupant } from './grid.ts';

export interface SavedFormation {
  version: 1;
  units: Record<string, Pos>;
}

const keyFor = (unit: UnitStack): string =>
  unit.origin?.type === 'deployed' ? unit.origin.armySlotKey : unit.definition.name;

function legalCells(grid: Grid, maxCol: number): Pos[] {
  const result: Pos[] = [];
  for (const row of grid.cells) for (const cell of row) {
    if (cell.col <= maxCol && !cell.blocked) result.push({ col: cell.col, row: cell.row });
  }
  return result.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Reconcile intent against the current whole-stack army; no battle IDs persist. */
export function applySavedFormation(
  state: BattleState,
  formation: SavedFormation | undefined,
  controllerId: string | undefined,
  maxCol: number,
): { state: BattleState; fallbackKeys: string[] } {
  if (!formation) return { state, fallbackKeys: [] };
  const candidates = legalCells(state.grid, maxCol);
  const movable = state.units.filter(unit => unit.side === 'player' && !unit.isHero && (controllerId ? unit.controllerId === controllerId : !unit.isAlly));
  const movingIds = new Set(movable.map(unit => unit.id));
  const occupied = new Set(state.units.filter(unit => unit.count > 0 && !movingIds.has(unit.id) && !unit.isHero).map(unit => `${unit.pos.col},${unit.pos.row}`));
  const fallbackKeys: string[] = [];
  const positions = new Map<string, Pos>();
  for (const unit of movable.sort((a, b) => keyFor(a).localeCompare(keyFor(b)))) {
    const key = keyFor(unit);
    const wanted = formation.units[key];
    const validWanted = wanted && wanted.col >= 0 && wanted.col <= maxCol && wanted.row >= 0 && wanted.row < state.grid.height &&
      !state.grid.cells[wanted.row][wanted.col].blocked && !occupied.has(`${wanted.col},${wanted.row}`);
    let chosen = validWanted ? wanted : undefined;
    if (!chosen) {
      fallbackKeys.push(key);
      const anchor = wanted ?? unit.pos;
      chosen = candidates
        .filter(pos => !occupied.has(`${pos.col},${pos.row}`))
        .sort((a, b) => chebyshevDistance(a, anchor) - chebyshevDistance(b, anchor) || a.row - b.row || a.col - b.col)[0];
    }
    if (!chosen) continue;
    positions.set(unit.id, chosen);
    occupied.add(`${chosen.col},${chosen.row}`);
  }
  let grid = state.grid;
  for (const unit of movable) grid = setOccupant(grid, unit.pos, null);
  const units = state.units.map(unit => positions.has(unit.id) ? { ...unit, pos: positions.get(unit.id)! } : unit);
  for (const unit of units.filter(unit => positions.has(unit.id))) grid = setOccupant(grid, unit.pos, unit.id);
  return { state: { ...state, grid, units }, fallbackKeys };
}

export function formationFromBattle(state: BattleState, controllerId?: string): SavedFormation {
  return {
    version: 1,
    units: Object.fromEntries(state.units
      .filter(unit => unit.side === 'player' && !unit.isHero && (controllerId ? unit.controllerId === controllerId : !unit.isAlly))
      .map(unit => [keyFor(unit), { ...unit.pos }] as [string, Pos])
      .sort(([a], [b]) => a.localeCompare(b))),
  };
}
