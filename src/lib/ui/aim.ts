import type { Pos } from '$lib/engine/types';

/** Degrees a rival origin must beat the current pick by before the aim
 *  switches. Big enough to absorb hand jitter at sector boundaries, small
 *  enough that a deliberate steer toward another tile switches immediately. */
export const AIM_HYSTERESIS_DEG = 20;

/** Absolute angular distance (radians, ≤ π) between the cursor direction
 *  and the target→origin direction, both in board space. */
function angularDiff(origin: Pos, target: Pos, cursor: { dx: number; dy: number }): number {
  const cursorAngle = Math.atan2(cursor.dy, cursor.dx);
  const originAngle = Math.atan2(origin.row - target.row, origin.col - target.col);
  const diff = Math.abs(cursorAngle - originAngle);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}

/** Choose the melee origin the cursor is pointing at, with hysteresis:
 *  the current pick survives unless a rival beats it by AIM_HYSTERESIS_DEG.
 *  `current` is ignored when it's no longer in `origins` (stale pick after
 *  the board changed) or null (first pick on entering the tile). */
export function pickOrigin(
  current: Pos | null,
  origins: Pos[],
  target: Pos,
  cursor: { dx: number; dy: number }
): Pos | null {
  if (origins.length === 0) return null;

  let best = origins[0];
  let bestDiff = Infinity;
  for (const o of origins) {
    const diff = angularDiff(o, target, cursor);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  }

  const held = current && origins.some(o => o.col === current.col && o.row === current.row) ? current : null;
  if (!held) return best;

  const heldDiff = angularDiff(held, target, cursor);
  const margin = (AIM_HYSTERESIS_DEG * Math.PI) / 180;
  return bestDiff < heldDiff - margin ? best : held;
}
