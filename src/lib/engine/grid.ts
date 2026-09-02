import type { Grid, Cell, Pos, UnitStack } from './types.ts';

export function createGrid(width: number, height: number): Grid {
  const cells: Cell[][] = [];
  for (let row = 0; row < height; row++) {
    cells[row] = [];
    for (let col = 0; col < width; col++) {
      cells[row][col] = { col, row, blocked: false, occupantId: null };
    }
  }
  return { width, height, cells };
}

export function getCell(grid: Grid, col: number, row: number): Cell | null {
  if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) return null;
  return grid.cells[row][col];
}

/** The eight surrounding cells. Diagonals are included so a unit can squeeze
 * between two neighbours instead of being sealed in by them. */
export function getNeighbours(grid: Grid, col: number, row: number): Cell[] {
  const dirs: Pos[] = [
    { col: 0, row: -1 }, { col: 0, row: 1 },
    { col: -1, row: 0 }, { col: 1, row: 0 },
    { col: -1, row: -1 }, { col: 1, row: -1 },
    { col: -1, row: 1 }, { col: 1, row: 1 },
  ];
  return dirs
    .map(d => getCell(grid, col + d.col, row + d.row))
    .filter((c): c is Cell => c !== null);
}

/** A diagonal costs the same two movement points as the cardinal steps it
 * replaces, so squeezing through a gap does not increase maximum range. */
export function stepCost(from: Pos, to: Pos): number {
  return from.col !== to.col && from.row !== to.row ? 2 : 1;
}

export function findPath(grid: Grid, from: Pos, to: Pos, ignoreOccupantId?: string): Pos[] {
  if (from.col === to.col && from.row === to.row) return [];

  const key = (p: Pos) => `${p.col},${p.row}`;
  // Dijkstra rather than BFS because cardinal and diagonal steps have
  // different costs.
  const costs = new Map<string, number>([[key(from), 0]]);
  const paths = new Map<string, Pos[]>([[key(from), []]]);
  const settled = new Set<string>();

  for (;;) {
    let bestKey: string | null = null;
    let bestCost = Infinity;
    for (const [candidate, cost] of costs) {
      if (!settled.has(candidate) && cost < bestCost) {
        bestKey = candidate;
        bestCost = cost;
      }
    }
    if (bestKey === null) break;
    if (bestKey === key(to)) return paths.get(bestKey)!;
    settled.add(bestKey);

    const [col, row] = bestKey.split(',').map(Number);
    const pos = { col, row };
    for (const nb of getNeighbours(grid, pos.col, pos.row)) {
      const k = key(nb);
      if (settled.has(k)) continue;
      if (nb.blocked) continue;
      // Occupied cells block pathing. The optional id only permits a caller
      // to ignore the moving stack's own occupancy if it appears in the path.
      if (nb.occupantId && nb.occupantId !== ignoreOccupantId) continue;
      const nextCost = bestCost + stepCost(pos, nb);
      if (nextCost >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k, nextCost);
      paths.set(k, [...paths.get(bestKey)!, nb]);
    }
  }
  return []; // unreachable
}

/** Total movement-point cost of a path returned by findPath. */
export function pathCost(from: Pos, path: Pos[]): number {
  let total = 0;
  let previous = from;
  for (const next of path) {
    total += stepCost(previous, next);
    previous = next;
  }
  return total;
}

export function chebyshevDistance(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** Walking cost between two cells on open ground. */
export function manhattanDistance(a: Pos, b: Pos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export function isInRange(from: Pos, to: Pos, range: number): boolean {
  return chebyshevDistance(from, to) <= range;
}

export function setBlocked(grid: Grid, pos: Pos): Grid {
  const newCells = grid.cells.map(row => row.map(cell => {
    if (cell.col === pos.col && cell.row === pos.row) {
      return { ...cell, blocked: true };
    }
    return cell;
  }));
  return { ...grid, cells: newCells };
}

export function setOccupant(grid: Grid, pos: Pos, id: string | null): Grid {
  const newCells = grid.cells.map(row => row.map(cell => {
    if (cell.col === pos.col && cell.row === pos.row) {
      return { ...cell, occupantId: id };
    }
    return cell;
  }));
  return { ...grid, cells: newCells };
}

export function placeUnits(grid: Grid, units: UnitStack[]): Grid {
  let g = grid;
  for (const u of units) {
    g = setOccupant(g, u.pos, u.id);
  }
  return g;
}
