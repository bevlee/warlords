import type { BattleAction, BattleState } from './types';
import { findPath, chebyshevDistance } from './grid';
import { canShootTarget, effectiveSpeed, getMeleeApproaches, isShootingBlocked } from './selectors';

export function aiTakeTurn(state: BattleState, unitId: string): BattleAction {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit || unit.count === 0) return { type: 'wait' };

  const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0 && !u.isHero);
  if (enemies.length === 0) return { type: 'wait' };

  // Find nearest enemy (Chebyshev)
  const target = enemies.reduce((closest, e) =>
    chebyshevDistance(unit.pos, e.pos) < chebyshevDistance(unit.pos, closest.pos) ? e : closest
  );

  // Ranged: shoot unless an enemy is in our face — beyond range still beats walking (half damage)
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

  // Out of reach of any attack: an unclaimed structure this stack can stand
  // on this turn beats plain approach — the buffs are army-wide and free.
  const speed = effectiveSpeed(unit);
  let bestClaim: { to: { col: number; row: number }; dist: number } | null = null;
  for (const st of state.structures ?? []) {
    if (st.claimedBy) continue;
    const cell = state.grid.cells[st.pos.row][st.pos.col];
    if (cell.blocked || cell.occupantId) continue;
    const claimPath = findPath(state.grid, unit.pos, st.pos, unit.id);
    if (claimPath.length === 0 || claimPath.length > speed) continue;
    if (!bestClaim || claimPath.length < bestClaim.dist) {
      bestClaim = { to: st.pos, dist: claimPath.length };
    }
  }
  if (bestClaim) return { type: 'move', to: bestClaim.to };

  // Walk toward the target
  const path = findPath(state.grid, unit.pos, target.pos, unit.id);
  if (path.length > 0) {
    // Move up to `speed` cells; -1: don't step onto the target's cell
    const steps = Math.min(speed, path.length - 1);
    const moveTo = steps > 0 ? path[steps - 1] : path[0];
    return { type: 'move', to: moveTo };
  }

  return { type: 'wait' };
}
