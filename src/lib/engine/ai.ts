import type { BattleAction, BattleState } from './types';
import { findPath, chebyshevDistance } from './grid';
import { canShootTarget, getMeleeApproaches, isShootingBlocked } from './selectors';

export function aiTakeTurn(state: BattleState, unitId: string): BattleAction {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit || unit.count === 0) return { type: 'wait' };

  const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0 && !u.isHero);
  if (enemies.length === 0) return { type: 'wait' };

  // Find nearest enemy (Chebyshev)
  const target = enemies.reduce((closest, e) =>
    chebyshevDistance(unit.pos, e.pos) < chebyshevDistance(unit.pos, closest.pos) ? e : closest
  );

  // Ranged: shoot if the target is within range and no enemy is in our face
  if (canShootTarget(unit, target) && !isShootingBlocked(state, unit)) {
    return { type: 'shoot', targetId: target.id };
  }

  // Melee: attack in place if adjacent, else move+attack if reachable
  const approaches = getMeleeApproaches(state, unit);
  if (approaches.has(target.id)) {
    const dest = approaches.get(target.id);
    return dest
      ? { type: 'attack', targetId: target.id, moveTo: dest }
      : { type: 'attack', targetId: target.id };
  }

  // Out of reach: walk toward the target
  const path = findPath(state.grid, unit.pos, target.pos, unit.id);
  if (path.length > 0) {
    // Move up to `speed` cells; -1: don't step onto the target's cell
    const steps = Math.min(unit.definition.speed, path.length - 1);
    const moveTo = steps > 0 ? path[steps - 1] : path[0];
    return { type: 'move', to: moveTo };
  }

  return { type: 'wait' };
}
