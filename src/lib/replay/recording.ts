import type { BattleAction, BattleState } from '$lib/engine/types';
import type { SoloBattleUpload, SoloController } from '$lib/net/api';
export { summarizeBattle } from './summary';
import { summarizeBattle } from './summary';

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
