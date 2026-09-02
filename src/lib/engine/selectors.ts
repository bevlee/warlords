import type { BattleState, Grid, Pos, UnitStack } from './types.ts';
import { getCell, getNeighbours, chebyshevDistance, manhattanDistance, stepCost } from './grid.ts';
import { modifiedDamage, modifiedDamageInBattle, applyDamage, applyStrike } from './combat.ts';
import { hasArtifact } from './artifacts.ts';

/** Movement range for this turn: base speed, plus Logistics, minus any active slow (Zombie slow_on_hit). */
export function effectiveSpeed(unit: UnitStack, state?: BattleState): number {
  const effectSpeed = (unit.effects ?? []).reduce((sum, effect) => sum + Number(effect.data?.speed ?? 0), 0);
  const tormentPenalty = state && (unit.burnRoundsLeft ?? 0) > 0 && state.units.some(
    aura => aura.count > 0 && aura.side !== unit.side && aura.definition.abilities.includes('torment_aura') && hasArtifact(state, aura, 'tormentors_brand'),
  ) ? 1 : 0;
  return Math.max(0, unit.definition.speed + (unit.speedBonus ?? 0) - (unit.speedPenalty ?? 0) + effectSpeed - tormentPenalty);
}

/**
 * Empty cells the unit can move to this turn, spending at most `speed`
 * movement points. Cardinal steps cost one and diagonals cost two. Walkers
 * cannot path through occupants; flyers pass over them but cannot land on
 * them. The start cell is excluded.
 */
export function getReachableCells(grid: Grid, unit: UnitStack, state?: BattleState): Pos[] {
  const teleport = unit.definition.abilities.includes('teleport');
  const flying = unit.definition.abilities.includes('flying') || teleport;
  const key = (p: Pos) => `${p.col},${p.row}`;
  const costs = new Map<string, number>([[key(unit.pos), 0]]);
  const settled = new Set<string>();
  const reachable: Pos[] = [];

  const budget = teleport ? Math.max(grid.width, grid.height) : effectiveSpeed(unit, state);
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
    settled.add(bestKey);

    const [col, row] = bestKey.split(',').map(Number);
    const pos = { col, row };
    const cell = getCell(grid, col, row);
    if (bestKey !== key(unit.pos) && cell && cell.occupantId === null && !cell.blocked) {
      reachable.push(pos);
    }

    for (const nb of getNeighbours(grid, pos.col, pos.row)) {
      const k = key(nb);
      if (settled.has(k)) continue;
      // Walkers cannot enter a rock or an occupied cell at all; flyers pass
      // straight over both but still cannot land on them.
      if (!flying && (nb.occupantId !== null || nb.blocked)) continue;
      const nextCost = bestCost + stepCost(pos, nb);
      if (nextCost > budget || nextCost >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k, nextCost);
    }
  }
  return reachable;
}

/** Blinkwing Mantle destinations available after a Sprite spends part of its
 * movement reaching an attack cell. The ordinary Darting Assault return to
 * the starting cell remains available by omitting `retreatTo`; these are the
 * optional destinations paid for with movement the Sprite did not spend. */
export function getDartingRetreatCells(state: BattleState, unit: UnitStack, attackCell: Pos): Pos[] {
  if (!unit.definition.abilities.includes('darting_assault') || !hasArtifact(state, unit, 'blinkwing_mantle')) return [];
  const unusedMovement = Math.max(0, effectiveSpeed(unit, state) - chebyshevDistance(unit.pos, attackCell));
  if (unusedMovement === 0) return [];
  const cells: Pos[] = [];
  for (const row of state.grid.cells) for (const cell of row) {
    const occupiedByOther = cell.occupantId !== null && cell.occupantId !== unit.id;
    if (cell.blocked || occupiedByOther || (cell.col === attackCell.col && cell.row === attackCell.row)) continue;
    if (chebyshevDistance(attackCell, cell) <= unusedMovement) cells.push({ col: cell.col, row: cell.row });
  }
  return cells.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Living enemy stacks adjacent to the unit (Chebyshev distance 1). Heroes are untargetable. */
export function getMeleeTargets(state: BattleState, unit: UnitStack): UnitStack[] {
  return state.units.filter(
    u => u.side !== unit.side && u.count > 0 && !u.isHero && chebyshevDistance(unit.pos, u.pos) === 1
  );
}

/** Whether the unit can fire a ranged shot this turn. */
export function canShoot(unit: UnitStack): boolean {
  return unit.definition.shots > 0 && unit.shotsLeft > 0;
}

/**
 * Whether the unit can shoot this specific target: shots left and a real stack.
 * Range never blocks a shot (LordsWM) — beyond range it just deals half damage.
 */
export function canShootTarget(unit: UnitStack, target: UnitStack): boolean {
  return canShoot(unit) && !target.isHero;
}

/** LordsWM far-shot rule: past `range` cardinal tile steps a shot deals half
 * damage. This follows the same sideways/vertical geometry as movement rather
 * than treating every cell in a square as equally near. */
export function isBeyondRange(unit: UnitStack, target: UnitStack): boolean {
  return manhattanDistance(unit.pos, target.pos) > unit.definition.range;
}

/** Cells within a shooter's full-damage range, own cell excluded; empty for melee units. */
export function getRangeCells(grid: Grid, unit: UnitStack): Pos[] {
  const range = unit.definition.range;
  if (range <= 0) return [];
  const cells: Pos[] = [];
  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell.col === unit.pos.col && cell.row === unit.pos.row) continue;
      if (manhattanDistance(unit.pos, cell) <= range) cells.push({ col: cell.col, row: cell.row });
    }
  }
  return cells;
}

export interface DamagePreview {
  min: number;
  max: number;
  killsMin: number;
  killsMax: number;
}

/** Expected damage/kill ranges for the aiming tooltip (luck excluded). */
export function damagePreview(
  attacker: UnitStack,
  defender: UnitStack,
  heroAttack: number,
  ranged = false
): DamagePreview {
  // Mirror the engine's rounding: full damage first, then the far-shot halving.
  const penalized = ranged && isBeyondRange(attacker, defender);
  const roll = (per: number) => {
    const base = Math.max(1, Math.round(modifiedDamage(attacker, defender, heroAttack, per)));
    return penalized ? Math.max(1, Math.round(base / 2)) : base;
  };
  const min = roll(attacker.definition.minDamage);
  const max = roll(attacker.definition.maxDamage);
  // Melee forecasts route through applyStrike so Black Knight soul_reaper's
  // extra kill shows in the tooltip instead of surprising the player.
  const kills = (damage: number) =>
    ranged ? applyDamage(defender, damage).killed : applyStrike(attacker, defender, damage).killed;
  return { min, max, killsMin: kills(min), killsMax: kills(max) };
}

/** Live forecast including controller stats, enemy Veterancy and Rank Training. */
export function damagePreviewInBattle(
  state: BattleState,
  attacker: UnitStack,
  defender: UnitStack,
  ranged = false,
): DamagePreview {
  const penalized = ranged && isBeyondRange(attacker, defender);
  const areaFraction = attacker.definition.abilities.includes('area_shot')
    ? (hasArtifact(state, attacker, 'blackpowder_fletching') ? 0.65 : 0.5)
    : 1;
  const roll = (per: number) => {
    const base = Math.max(1, Math.round(modifiedDamageInBattle(state, attacker, defender, per) * areaFraction));
    return penalized ? Math.max(1, Math.round(base / 2)) : base;
  };
  const min = roll(attacker.definition.minDamage);
  const max = roll(attacker.definition.maxDamage);
  const kills = (damage: number) => ranged ? applyDamage(defender, damage).killed : applyStrike(attacker, defender, damage).killed;
  return { min, max, killsMin: kills(min), killsMax: kills(max) };
}

/** LordsWM rule: a living enemy directly adjacent disables shooting. */
export function isShootingBlocked(state: BattleState, unit: UnitStack): boolean {
  if (unit.definition.abilities.includes('no_melee_penalty') || unit.definition.abilities.includes('combat_casting')) return false;
  const sheltered = state.units.some(
    ally => ally.count > 0 && ally.side === unit.side && ally.definition.abilities.includes('sheltering_boughs') &&
      chebyshevDistance(ally.pos, unit.pos) <= (hasArtifact(state, ally, 'thornwall_seed') ? 2 : 1)
  );
  if (sheltered) return false;
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
  for (const cell of getReachableCells(state.grid, unit, state)) {
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
  const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0 && !u.isHero);
  const reachable = getReachableCells(state.grid, unit, state);

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
