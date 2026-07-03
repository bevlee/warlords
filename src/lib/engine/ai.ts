import type { BattleAction, BattleState, UnitStack } from './types';
import { findPath, chebyshevDistance } from './grid';

export function aiTakeTurn(state: BattleState, unitId: string): BattleAction {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit || unit.count === 0) return { type: 'wait' };

  const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0);
  if (enemies.length === 0) return { type: 'wait' };

  // Find nearest enemy (Chebyshev)
  const target = enemies.reduce((closest, e) =>
    chebyshevDistance(unit.pos, e.pos) < chebyshevDistance(unit.pos, closest.pos) ? e : closest
  );

  const dist = chebyshevDistance(unit.pos, target.pos);

  // Ranged: shoot if we have shots and target is anywhere (simplified: range = whole board)
  if (unit.shotsLeft > 0 && unit.definition.shots > 0) {
    return { type: 'shoot', targetId: target.id };
  }

  // Melee: if adjacent, attack
  if (dist <= 1) {
    return { type: 'attack', targetId: target.id };
  }

  // Move toward target
  const path = findPath(state.grid, unit.pos, target.pos, unit.id);
  if (path.length > 0) {
    // Move up to `speed` cells
    const steps = Math.min(unit.definition.speed, path.length - 1); // -1: don't step onto target's cell
    const moveTo = steps > 0 ? path[steps - 1] : path[0];
    return { type: 'move', to: moveTo };
  }

  return { type: 'wait' };
}
