import type { BattleState, UnitStack } from './types';

export function buildTurnQueue(units: UnitStack[]): string[] {
  return [...units]
    .filter(u => u.count > 0)
    .sort((a, b) => {
      if (b.definition.speed !== a.definition.speed) return b.definition.speed - a.definition.speed;
      // player units act before enemy on tie
      if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
      return a.id.localeCompare(b.id);
    })
    .map(u => u.id);
}

export function advanceTurn(state: BattleState): BattleState {
  let queue = [...state.turnQueue];

  if (queue.length === 0) {
    // New round
    const newRound = state.round + 1;
    const resetUnits = state.units.map(u => ({ ...u, hasRetaliated: false }));
    queue = buildTurnQueue(resetUnits);
    const nextId = queue.shift() ?? null;
    return {
      ...state,
      units: resetUnits,
      round: newRound,
      turnQueue: queue,
      currentUnitId: nextId,
      log: [...state.log, { type: 'round_start', data: { round: newRound } }],
    };
  }

  const nextId = queue.shift() ?? null;
  return { ...state, turnQueue: queue, currentUnitId: nextId };
}
