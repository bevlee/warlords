import type { BattleAction, BattleState, UnitStack } from '$lib/engine/types';
import { predictTurnSchedule, previewTurnSchedule } from '$lib/engine/turnOrder';

/** How many turns the ribbon predicts ahead. */
export const TURN_BAR_ENTRIES = 16;

/** One portrait on the turns bar. */
export interface TurnBarEntry {
  unit: UnitStack;
  round: number;
  /** First turn of a new round — where the inline round marker goes. */
  startsRound: boolean;
  /** The stack acting right now. Never set while a projection is showing:
   *  in a hypothetical order nothing is acting yet. */
  isCurrent: boolean;
  /** While projecting: the acting stack's next turn under the hovered action —
   *  where it lands. Only the first such slot; a fast stack recurs later in the
   *  strip and ringing every recurrence would blur the one spot that moved. */
  isProjected: boolean;
}

/**
 * The strip of portraits to draw, live or projected.
 *
 * Pass `previewAction` — the action the player is hovering — to show the scale
 * that action would produce instead of the current one. Waiting is the case
 * that actually moves: it re-enters at half a cycle rather than 0, so the
 * ribbon can finally answer "where do I end up if I wait?" rather than
 * assuming, as the live strip must, that every stack re-enters at 0.
 */
export function turnBarEntries(
  state: BattleState,
  previewAction: BattleAction['type'] | null = null,
): TurnBarEntry[] {
  const slots = previewAction
    ? previewTurnSchedule(state, previewAction, TURN_BAR_ENTRIES)
    : predictTurnSchedule(state.units, TURN_BAR_ENTRIES, state.battleTime);

  const landing = previewAction
    ? slots.findIndex(slot => slot.unitId === state.currentUnitId)
    : -1;

  return slots
    .map((slot, i) => ({
      unit: state.units.find(u => u.id === slot.unitId),
      round: slot.round,
      startsRound: i > 0 && slot.round !== slots[i - 1].round,
      isCurrent: !previewAction && i === 0,
      isProjected: i === landing,
    }))
    .filter((e): e is TurnBarEntry => !!e.unit);
}
