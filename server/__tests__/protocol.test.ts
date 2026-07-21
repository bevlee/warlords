import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../protocol.ts';

describe('client message validation', () => {
  it('normalizes valid messages at the WebSocket boundary', () => {
    expect(parseClientMessage({
      type: 'battle.action',
      lastSeq: 3,
      action: { type: 'attack', targetId: 'enemy-1', moveTo: { col: 2, row: 4 }, ignored: true },
      ignored: true,
    })).toEqual({
      type: 'battle.action',
      lastSeq: 3,
      action: { type: 'attack', targetId: 'enemy-1', moveTo: { col: 2, row: 4 } },
    });
  });

  it.each([
    null,
    [],
    { type: 'hello', token: '', lastSeq: 0 },
    { type: 'hello', token: 'token', lastSeq: -1 },
    { type: 'room.join', code: 12345, loadout: {} },
    { type: 'room.join', code: 'TOO-LONG', loadout: {} },
    { type: 'deploy.move', unitId: 'u1', to: { col: '2', row: 4 } },
    { type: 'deploy.split', unitId: 'u1', amount: 0, to: { col: 2, row: 4 } },
    { type: 'battle.action', lastSeq: 0, action: { type: 'cast', spell: 'unknown', targetId: 'u2' } },
    { type: 'chat.send', text: 42 },
    { type: 'unknown' },
  ])('rejects malformed input %#', value => {
    expect(parseClientMessage(value)).toBeNull();
  });
});
