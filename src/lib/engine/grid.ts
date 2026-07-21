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

export function getNeighbours(grid: Grid, col: number, row: number): Cell[] {
  const dirs: Pos[] = [
    { col: 0, row: -1 }, { col: 0, row: 1 },
    { col: -1, row: 0 }, { col: 1, row: 0 },
  ];
  return dirs
    .map(d => getCell(grid, col + d.col, row + d.row))
    .filter((c): c is Cell => c !== null);
}

export function findPath(grid: Grid, from: Pos, to: Pos, ignoreOccupantId?: string): Pos[] {
  if (from.col === to.col && from.row === to.row) return [];

  const key = (p: Pos) => `${p.col},${p.row}`;
  const visited = new Set<string>();
  const queue: Array<{ pos: Pos; path: Pos[] }> = [{ pos: from, path: [] }];
  visited.add(key(from));

  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;
    for (const nb of getNeighbours(grid, pos.col, pos.row)) {
      const k = key(nb);
      if (visited.has(k)) continue;
      if (nb.blocked) continue;
      // Allow passing through friendly units but not occupying their cell (simplified: block all occupants except destination)
      if (nb.occupantId && nb.occupantId !== ignoreOccupantId && !(nb.col === to.col && nb.row === to.row)) continue;
      const newPath = [...path, nb];
      if (nb.col === to.col && nb.row === to.row) return newPath;
      visited.add(k);
      queue.push({ pos: nb, path: newPath });
    }
  }
  return []; // unreachable
}

export function chebyshevDistance(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
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
