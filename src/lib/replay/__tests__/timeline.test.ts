import { describe, expect, it } from 'vitest';
import { aiTakeTurn } from '../../engine/ai';
import { applyAction, beginCombat, initBattle } from '../../engine/battle';
import { GOBLIN, WOLF_RIDER } from '../../engine/barbarian';
import type { BattleState, Hero } from '../../engine/types';
import { ReplayController, type ReplaySink } from '../controller';
import { buildReplayTimeline } from '../timeline';

const HERO: Hero = {
  class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
};

function fixture(actionCount = 4) {
  const initialState = beginCombat(initBattle(
    [{ unit: GOBLIN, count: 12 }],
    [{ unit: WOLF_RIDER, count: 4 }],
    HERO,
    47
  ));
  let live = initialState;
  const actions = [];
  for (let seq = 1; seq <= actionCount && live.result === 'ongoing'; seq++) {
    const actor = live.units.find(unit => unit.id === live.currentUnitId)!;
    const action = aiTakeTurn(live, actor.id);
    actions.push({ seq, controller: actor.side === 'player' ? 'host' as const : 'ai' as const, action });
    live = applyAction(live, action);
  }
  return { initialState, actions, live };
}

describe('replay timeline', () => {
  it('re-simulates exact states/events and interleaves chat by action sequence', () => {
    const { initialState, actions, live } = fixture();
    const timeline = buildReplayTimeline({
      initialState,
      actions,
      chat: [
        { afterSeq: 0, controller: 'host', text: 'ready', ts: 1 },
        { afterSeq: 1, controller: 'guest', text: 'nice hit', ts: 2 },
        { afterSeq: 99, controller: 'host', text: 'gg', ts: 3 },
      ],
    });

    expect(timeline.finalState).toEqual(live);
    expect(timeline.frames[0].events).toEqual(
      timeline.frames[0].state.log.slice(initialState.log.length)
    );
    expect(timeline.initialChat.map(message => message.text)).toEqual(['ready']);
    expect(timeline.frames[0].chat.map(message => message.text)).toEqual(['nice hit']);
    expect(timeline.trailingChat.map(message => message.text)).toEqual(['gg']);
  });

  it('rejects a journal with a sequence gap', () => {
    const { initialState, actions } = fixture(1);
    expect(() => buildReplayTimeline({ initialState, actions: [{ ...actions[0], seq: 2 }], chat: [] }))
      .toThrow('gap');
  });
});

describe('ReplayController', () => {
  it('pauses between actions, resumes, scales delays, and restarts', async () => {
    const source = fixture(3);
    const timeline = buildReplayTimeline({ ...source, chat: [] });
    let state: BattleState = timeline.initialState;
    let calls = 0;
    const delays: number[] = [];
    let controller!: ReplayController;
    const sink: ReplaySink = {
      async apply(action) {
        state = applyAction(state, action);
        calls++;
        if (calls === 1) controller.pause();
        return state;
      },
      resync(next) {
        state = next;
      },
    };
    controller = new ReplayController(timeline, {
      delay: async ms => void delays.push(ms),
      interActionMs: 180,
    });
    controller.setSpeed(2);
    controller.attach(sink);

    await controller.play();
    expect(controller.snapshot()).toMatchObject({ cursor: 1, paused: true, done: false });
    await controller.play();
    expect(controller.snapshot()).toMatchObject({ cursor: timeline.frames.length, done: true });
    expect(delays).toEqual(Array(Math.max(0, timeline.frames.length - 2)).fill(90));
    expect(state).toEqual(timeline.finalState);

    controller.restart();
    expect(controller.snapshot()).toMatchObject({ cursor: 0, paused: true, done: false });
    expect(state).toEqual(timeline.initialState);
  });
});
