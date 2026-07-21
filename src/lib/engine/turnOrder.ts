import type { BattleState, UnitStack } from './types.ts';

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
  // simultaneous: player acts first, then stable by id
  if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
  return a.id.localeCompare(b.id);
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
    finalUnits = units.map(u =>
      u.lastMovedFrom || u.speedPenalty !== undefined
        ? { ...u, lastMovedFrom: undefined, speedPenalty: undefined }
        : u
    );
  }

  return { ...state, units: finalUnits, battleTime, round, log, currentUnitId: actor.id };
}

/**
 * The next `n` actors from current scale positions, assuming everyone
 * re-enters at 0 (waits and deaths aren't predicted, as in LordsWM's bar).
 * Fast stacks appear more than once.
 */
export function predictTurnOrder(units: UnitStack[], n: number): string[] {
  const sim = units.filter(u => u.count > 0).map(u => ({ unit: { ...u }, id: u.id }));
  if (sim.length === 0) return [];

  const order: string[] = [];
  while (order.length < n) {
    sim.sort((a, b) => byActOrder(a.unit, b.unit));
    const next = sim[0];
    const dt = Math.max(0, timeToAct(next.unit));
    for (const s of sim) s.unit.atb += dt * rate(s.unit);
    next.unit.atb = 0;
    order.push(next.id);
  }
  return order;
}
