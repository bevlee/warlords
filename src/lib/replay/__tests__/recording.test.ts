import { describe, expect, it } from 'vitest';
import { aiTakeTurn } from '../../engine/ai';
import { applyAction, beginCombat, initBattle } from '../../engine/battle';
import { GOBLIN, WOLF_RIDER } from '../../engine/barbarian';
import type { BattleState, Hero } from '../../engine/types';
import { createSoloBattleRecorder } from '../recording';

const HERO: Hero = {
  class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1,
  statPoints: 0, factionSkills: [],
};

describe('solo battle recording', () => {
  it('replays a complete action journal to the exact live final state', () => {
    let live = beginCombat(initBattle(
      [{ unit: GOBLIN, count: 12 }, { unit: WOLF_RIDER, count: 4 }],
      [{ unit: GOBLIN, count: 9 }, { unit: WOLF_RIDER, count: 3 }],
      HERO,
      98765
    ));
    const recorder = createSoloBattleRecorder(live);

    for (let turn = 0; live.result === 'ongoing' && turn < 500; turn++) {
      const actor = live.units.find(u => u.id === live.currentUnitId)!;
      const action = aiTakeTurn(live, actor.id);
      recorder.record(actor.side === 'player' ? 'host' : 'ai', action);
      live = applyAction(live, action);
    }
    expect(live.result).not.toBe('ongoing');

    const payload = recorder.finish(live);
    let replay = payload.initialState as BattleState;
    for (const row of payload.actions) replay = applyAction(replay, row.action);

    expect(replay).toEqual(live);
    expect(payload.result).toBe(live.result);
    expect(payload.summary.rounds).toBe(live.round);
    expect(payload.summary.playerCasualties.length + payload.summary.enemyCasualties.length).toBeGreaterThan(0);
  });

  it('can only be finished once', () => {
    const initial = beginCombat(initBattle(
      [{ unit: GOBLIN, count: 2 }],
      [{ unit: GOBLIN, count: 1 }],
      HERO,
      12
    ));
    const recorder = createSoloBattleRecorder(initial);
    const final = { ...initial, result: 'player_wins' as const };

    expect(recorder.finish(final)).toBeTruthy();
    expect(() => recorder.finish(final)).toThrow(/already finished/);
  });
});
