import { applyAction } from '$lib/engine/battle';
import type { BattleAction, BattleEvent, BattleState } from '$lib/engine/types';
import type { BattleDetail, RecordedBattleAction } from '$lib/net/api';

export type ReplayChat = BattleDetail['chat'][number];

export interface ReplayFrame extends RecordedBattleAction {
  seq: number;
  events: BattleEvent[];
  state: BattleState;
  chat: ReplayChat[];
}

export interface ReplayTimeline {
  initialState: BattleState;
  initialChat: ReplayChat[];
  frames: ReplayFrame[];
  trailingChat: ReplayChat[];
  finalState: BattleState;
}

/** Re-simulates a persisted cause-only journal once and captures every clean
 * between-action analysis point. Chat is attached to the sequence after which
 * it was sent, without becoming engine input. */
export function buildReplayTimeline(detail: Pick<BattleDetail, 'initialState' | 'actions' | 'chat'>): ReplayTimeline {
  let state = clone(detail.initialState);
  const orderedActions = [...detail.actions].sort((a, b) => a.seq - b.seq);
  const orderedChat = [...detail.chat].sort((a, b) => a.afterSeq - b.afterSeq || a.ts - b.ts);
  const frames: ReplayFrame[] = [];

  for (let index = 0; index < orderedActions.length; index++) {
    const row = orderedActions[index];
    if (row.seq !== index + 1) throw new Error(`replay journal has a gap at seq ${index + 1}`);
    const before = state.log.length;
    const next = applyAction(state, row.action);
    if (next === state) throw new Error(`replay action ${row.seq} was rejected by engine`);
    state = next;
    frames.push({
      seq: row.seq,
      controller: row.controller,
      action: clone(row.action) as BattleAction,
      events: clone(state.log.slice(before)),
      state: clone(state),
      chat: orderedChat.filter(message => message.afterSeq === row.seq).map(clone),
    });
  }

  return {
    initialState: clone(detail.initialState),
    initialChat: orderedChat.filter(message => message.afterSeq <= 0).map(clone),
    frames,
    trailingChat: orderedChat.filter(message => message.afterSeq > orderedActions.length).map(clone),
    finalState: clone(state),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
