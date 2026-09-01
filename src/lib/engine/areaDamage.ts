import type { BattleState, Pos, UnitStack } from './types.ts';

export interface AreaTarget { stack: UnitStack; primary: boolean; multiplier: number }

export function areaTargets(
  state: BattleState,
  center: Pos,
  options: { size: 3 | 5; primaryId?: string; secondaryMultiplier: number; enemyOf?: UnitStack; friendlyFire: boolean; maxTargets?: number },
): AreaTarget[] {
  const radius = Math.floor(options.size / 2);
  const targets = state.units.filter(unit => unit.count > 0 && !unit.isHero &&
    Math.max(Math.abs(unit.pos.col - center.col), Math.abs(unit.pos.row - center.row)) <= radius &&
    (options.friendlyFire || !options.enemyOf || unit.side !== options.enemyOf.side))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(stack => ({ stack, primary: stack.id === options.primaryId, multiplier: stack.id === options.primaryId ? 1 : options.secondaryMultiplier }));
  return options.maxTargets ? targets.slice(0, options.maxTargets) : targets;
}

export function lineCells(from: Pos, toward: Pos, length: number): Pos[] {
  const dc = Math.sign(toward.col - from.col);
  const dr = Math.sign(toward.row - from.row);
  if ((!dc && !dr) || Math.abs(toward.col - from.col) > 1 || Math.abs(toward.row - from.row) > 1) return [];
  return Array.from({ length }, (_, index) => ({ col: from.col + dc * (index + 1), row: from.row + dr * (index + 1) }));
}
