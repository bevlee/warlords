import type { Pos } from '$lib/engine/types';

/** Degrees a rival origin must beat the current pick by before the aim
 *  switches. Eight square-grid directions are only 45 degrees apart, so a
 *  small margin absorbs jitter without consuming most of the next sector. */
export const AIM_HYSTERESIS_DEG = 8;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenOrigin {
  origin: Pos;
  center: ScreenPoint;
}

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

function screenAngularDiff(candidate: ScreenPoint, target: ScreenPoint, pointer: ScreenPoint): number {
  const pointerAngle = Math.atan2(pointer.y - target.y, pointer.x - target.x);
  const candidateAngle = Math.atan2(candidate.y - target.y, candidate.x - target.x);
  const diff = Math.abs(pointerAngle - candidateAngle);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}

/**
 * Choose an attack origin in rendered screen space. Using the actual centres
 * of the transformed DOM cells accounts for perspective, row depth and board
 * scale without trying to reverse the CSS transform mathematically.
 */
export function pickScreenOrigin(
  current: Pos | null,
  candidates: ScreenOrigin[],
  target: ScreenPoint,
  pointer: ScreenPoint
): Pos | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDiff = Infinity;
  for (const candidate of candidates) {
    const diff = screenAngularDiff(candidate.center, target, pointer);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }

  const held = current
    ? candidates.find(candidate => candidate.origin.col === current.col && candidate.origin.row === current.row)
    : undefined;
  if (!held) return best.origin;

  const heldDiff = screenAngularDiff(held.center, target, pointer);
  const margin = (AIM_HYSTERESIS_DEG * Math.PI) / 180;
  return bestDiff < heldDiff - margin ? best.origin : held.origin;
}
