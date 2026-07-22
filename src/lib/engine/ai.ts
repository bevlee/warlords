import type { BattleAction, BattleState } from './types.ts';
import { chebyshevDistance } from './grid.ts';
import { canShootTarget, getMeleeApproaches, getReachableCells, isShootingBlocked } from './selectors.ts';

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

  // Out of reach: advance to the reachable cell nearest the target. This uses
  // the same reachability rules the player has, so flyers fly over rocks and
  // occupants (landing only on free ground) instead of trudging around them.
  const reachable = getReachableCells(state.grid, unit);
  if (reachable.length > 0) {
    const here = chebyshevDistance(unit.pos, target.pos);
    const best = reachable.reduce((a, b) =>
      chebyshevDistance(b, target.pos) < chebyshevDistance(a, target.pos) ? b : a
    );
    if (chebyshevDistance(best, target.pos) < here) return { type: 'move', to: best };
  }

  return { type: 'wait' };
}
