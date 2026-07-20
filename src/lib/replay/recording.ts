import type { BattleAction, BattleState, UnitStack } from '$lib/engine/types';
import type {
  BattleCasualty,
  BattleSummary,
  SoloBattleUpload,
  SoloController,
} from '$lib/net/api';

/** Accumulates only action causes. The immutable combat-start snapshot plus
 * these actions is sufficient to regenerate every event and final state. */
export function createSoloBattleRecorder(combatStart: BattleState) {
  const initialState = clone({ ...combatStart, log: [] });
  const actions: SoloBattleUpload['actions'] = [];
  let finished = false;

  return {
    record(controller: SoloController, action: BattleAction): void {
      if (finished) throw new Error('battle recorder already finished');
      actions.push(clone({ controller, action }));
    },

    finish(finalState: BattleState): SoloBattleUpload {
      if (finished) throw new Error('battle recorder already finished');
      if (finalState.result === 'ongoing') throw new Error('cannot finish an ongoing battle');
      finished = true;
      return {
        initialState,
        actions: clone(actions),
        summary: summarizeBattle(initialState, finalState),
        result: finalState.result,
      };
    },
  };
}

export function summarizeBattle(initialState: BattleState, finalState: BattleState): BattleSummary {
  return {
    rounds: finalState.round,
    playerCasualties: casualties(initialState.units, finalState.units, 'player'),
    enemyCasualties: casualties(initialState.units, finalState.units, 'enemy'),
  };
}

function casualties(
  initialUnits: UnitStack[],
  finalUnits: UnitStack[],
  side: UnitStack['side']
): BattleCasualty[] {
  const before = countsByName(initialUnits, side);
  const after = countsByName(finalUnits, side);
  return [...before.entries()]
    .map(([unitName, count]) => ({ unitName, lost: Math.max(0, count - (after.get(unitName) ?? 0)) }))
    .filter(row => row.lost > 0)
    .sort((a, b) => a.unitName.localeCompare(b.unitName));
}

function countsByName(units: UnitStack[], side: UnitStack['side']): Map<string, number> {
  const counts = new Map<string, number>();
  for (const unit of units) {
    if (unit.side !== side || unit.isHero) continue;
    counts.set(unit.definition.name, (counts.get(unit.definition.name) ?? 0) + unit.count);
  }
  return counts;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
