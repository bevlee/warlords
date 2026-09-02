import type { BattleAction, BattleState, UnitStack } from './types.ts';
import { removeModifierSource } from './unitModifiers.ts';

/** ATB fill rate in scale-units per round; initiative 10 = one turn per round.
 *  Floored at 1 so a stacked penalty can never freeze a unit entirely. */
function rate(unit: UnitStack): number {
  return Math.max(1, unit.definition.initiative + (unit.initiativeBonus ?? 0)) / 10;
}

/** Time in rounds until the stack reaches the act point (atb = 1). */
function timeToAct(unit: UnitStack): number {
  return (1 - unit.atb) / rate(unit);
}

function byActOrder(a: UnitStack, b: UnitStack): number {
  const diff = timeToAct(a) - timeToAct(b);
  if (Math.abs(diff) > 1e-9) return diff;
  // Exactly simultaneous: settle it with each stack's per-battle seeded draw,
  // so equal-initiative stacks don't all favour one side, yet the order is
  // identical every time the same battle is replayed.
  const priorityDiff = (a.tiePriority ?? 0) - (b.tiePriority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  return a.id.localeCompare(b.id); // extremely unlikely final fallback
}

/**
 * Advance the ATB scale to the next actor: move every living stack forward by
 * the time the nearest one needs to reach 1, make that stack current, and
 * refresh its retaliation (a stack regains its retaliation at the start of
 * its own turn). Bumps `round` (with a round_start event) whenever
 * `battleTime` crosses an integer. Re-entry positions (0 after a normal
 * action, 0.5 after wait) are the action handler's job, not this function's.
 */
export function advanceTurn(state: BattleState): BattleState {
  const living = state.units.filter(u => u.count > 0);
  if (living.length === 0) return { ...state, currentUnitId: null };

  const actor = [...living].sort(byActOrder)[0];
  const dt = Math.max(0, timeToAct(actor));

  const units = state.units.map(u => {
    if (u.count === 0) return u;
    const advanced = { ...u, atb: u.atb + dt * rate(u) };
    if (u.id === actor.id) {
      advanced.hasRetaliated = false;
      advanced.isDefending = false;
    }
    return advanced;
  });

  const battleTime = state.battleTime + dt;
  let { round, log } = state;
  const newRound = Math.floor(battleTime) + 1;
  let finalUnits = units;
  if (newRound > round) {
    round = newRound;
    log = [...log, { type: 'round_start', data: { round } }];
    // Knight jousting only counts movement made within the same charge.
    // Zombie slow_on_hit's speed penalty lasts until the round ends.
    finalUnits = units.map(u => {
      if (!u.lastMovedFrom && u.speedPenalty === undefined) return u;
      const cleared = { ...u, lastMovedFrom: undefined, lastMovedDistance: undefined, lastMovePath: undefined, speedPenalty: undefined };
      return u.speedPenalty !== undefined ? removeModifierSource(cleared, 'slow_on_hit') : cleared;
    });
  }

  return { ...state, units: finalUnits, battleTime, round, log, currentUnitId: actor.id };
}

/** One predicted turn: who acts, and which round it falls in. */
export interface TurnSlot {
  unitId: string;
  /** Same clock as BattleState.round, so slot 0 always matches it. */
  round: number;
}

/**
 * The next `n` turns from current scale positions, each tagged with its round.
 *
 * This runs the real ATB maths, so it is exact for everything the scale knows
 * about — including initiative: `rate()` reads `initiativeBonus`, so buffing a
 * stack mid-battle re-shapes the whole prediction immediately. What it cannot
 * know, and deliberately does not guess at (the same choices LordsWM's bar
 * makes), is anything decided later by a player or a die:
 *
 *  - **Wait** re-enters at 0.5 rather than 0, so a waiter acts sooner than
 *    shown. Everyone here is assumed to re-enter at 0. Once the player is
 *    actually hovering an action it stops being a guess: `previewTurnSchedule`
 *    below answers it for that one stack.
 *  - **Deaths** remove a stack and every later turn it had.
 *  - **Morale** is rolled at the moment a stack acts, not scheduled: a boost
 *    grants an immediate extra turn, a freeze forfeits one. Neither changes
 *    ATB rate, so neither is visible here.
 *
 * Pass `startTime` as the battle's current `battleTime` for absolute rounds.
 */
export function predictTurnSchedule(units: UnitStack[], n: number, startTime = 0): TurnSlot[] {
  const sim = units.filter(u => u.count > 0).map(u => ({ unit: { ...u }, id: u.id }));
  if (sim.length === 0) return [];

  const slots: TurnSlot[] = [];
  let time = startTime;
  while (slots.length < n) {
    sim.sort((a, b) => byActOrder(a.unit, b.unit));
    const next = sim[0];
    const dt = Math.max(0, timeToAct(next.unit));
    for (const s of sim) s.unit.atb += dt * rate(s.unit);
    time += dt;
    next.unit.atb = 0;
    // Same derivation advanceTurn uses, so the two never disagree.
    slots.push({ unitId: next.id, round: Math.floor(time) + 1 });
  }
  return slots;
}

/** Just the actors, for callers that don't care when the rounds fall. */
export function predictTurnOrder(units: UnitStack[], n: number): string[] {
  return predictTurnSchedule(units, n).map(slot => slot.unitId);
}

/**
 * Where a stack re-enters the scale once its turn ends: a finished turn drops
 * to 0, a wait to 0.5, so a waiter comes round again in half a cycle.
 * `applyAction` and the bar's preview both read this, so what the player is
 * shown and what the engine then does cannot drift apart.
 */
export function reentryAtb(action: BattleAction['type']): number {
  return action === 'wait' ? 0.5 : 0;
}

/**
 * The schedule the bar would show if the acting stack took `action` right now
 * — the one thing `predictTurnSchedule` deliberately refuses to guess at, made
 * available for the case where it is no longer a guess because the player is
 * hovering the action.
 *
 * Read-only: the state is untouched, so this is safe to call on every hover.
 * Everything `predictTurnSchedule` cannot foresee (deaths, morale rolls) is
 * still unforeseen here.
 */
export function previewTurnSchedule(
  state: BattleState,
  action: BattleAction['type'],
  n: number,
): TurnSlot[] {
  const actorId = state.currentUnitId;
  if (!actorId) return predictTurnSchedule(state.units, n, state.battleTime);
  const atb = reentryAtb(action);
  const units = state.units.map(u => (u.id === actorId ? { ...u, atb } : u));
  return predictTurnSchedule(units, n, state.battleTime);
}
