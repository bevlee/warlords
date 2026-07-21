import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { openDb } from '../db.ts';
import { RoomRegistry } from '../rooms.ts';
import { attachWebSocketServer } from '../ws.ts';
import { beginCombat, initBattle } from '../../src/lib/engine/battle.ts';
import { aiTakeTurn } from '../../src/lib/engine/ai.ts';
import { GOBLIN, WOLF_RIDER } from '../../src/lib/engine/barbarian.ts';
import type { Hero } from '../../src/lib/engine/types.ts';
import type { ServerMessage } from '../protocol.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const HERO: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 1, defense: 1, statPoints: 0, factionSkills: [] };

async function start(path: string) {
  const db = openDb(path);
  const rooms = new RoomRegistry(db);
  const server = createServer((_req, res) => res.end());
  const ws = attachWebSocketServer(server, db, rooms, { heartbeatMs: 10_000 });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    db, rooms, ws, server,
    url: `ws://127.0.0.1:${(server.address() as { port: number }).port}/ws`,
    async close() {
      await ws.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
      db.close();
    },
  };
}

async function connect(url: string, token: string, lastSeq = 0) {
  const socket = new WebSocket(url);
  const messages: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    messages.push(message);
    for (const waiter of waiters.splice(0)) waiter(message);
  });
  await new Promise<void>(resolve => socket.once('open', () => resolve()));
  socket.send(JSON.stringify({ type: 'hello', token, lastSeq }));
  const waitFor = async (predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> => {
    const found = messages.find(predicate);
    if (found) return found;
    return new Promise(resolve => {
      const check = (message: ServerMessage) => {
        if (predicate(message)) resolve(message);
        else waiters.push(check);
      };
      waiters.push(check);
    });
  };
  await waitFor(message => message.type === 'hello.ok');
  return { socket, messages, waitFor };
}

describe('restart recovery', () => {
  it('rehydrates a journal, replays reconnect gaps, and finishes the recovered battle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'warlords-restart-'));
    dirs.push(dir);
    const path = join(dir, 'game.db');
    const first = await start(path);
    for (const id of ['p1', 'p2']) {
      first.db.prepare('INSERT INTO players (id, token, created_at) VALUES (?, ?, ?)').run(id, `t-${id}`, Date.now());
    }
    const room = first.rooms.create('p1', {});
    first.rooms.join(room.code, 'p2', {});
    const initial = beginCombat(initBattle(
      [{ unit: GOBLIN, count: 12 }, { unit: WOLF_RIDER, count: 3 }],
      [{ unit: GOBLIN, count: 10 }, { unit: WOLF_RIDER, count: 2 }],
      HERO,
      1234
    ));
    first.rooms.startBattle(room.code, initial);
    const actor = initial.units.find(unit => unit.id === initial.currentUnitId)!;
    first.rooms.appendAction(room.code, actor.side === 'player' ? 'host' : 'ai', aiTakeTurn(initial, actor.id));
    await first.close();

    const second = await start(path);
    const recovered = second.rooms.get(room.code)!;
    expect(recovered.actions).toHaveLength(1);
    const host = await connect(second.url, 't-p1', 0);
    const guest = await connect(second.url, 't-p2', 99);
    expect(await host.waitFor(message => message.type === 'battle.applied')).toMatchObject({ type: 'battle.applied', seq: 1 });
    expect(await guest.waitFor(message => message.type === 'battle.resync')).toMatchObject({
      type: 'battle.resync', lastSeq: 1, state: recovered.state,
    });

    let lastEntry = recovered.actions[0];
    for (let turn = 0; recovered.state!.result === 'ongoing' && turn < 500; turn++) {
      const current = recovered.state!.units.find(unit => unit.id === recovered.state!.currentUnitId)!;
      lastEntry = second.rooms.appendAction(
        room.code,
        current.side === 'player' ? 'host' : 'ai',
        aiTakeTurn(recovered.state!, current.id)
      );
      second.ws.broadcastApplied(recovered, lastEntry);
    }
    expect(recovered.state!.result).not.toBe('ongoing');
    expect((second.db.prepare('SELECT result FROM battles WHERE id = ?').get(recovered.battleId) as any).result)
      .toBe(recovered.state!.result);
    expect(await host.waitFor(message => message.type === 'battle.applied' && message.seq === lastEntry.seq))
      .toMatchObject({ seq: lastEntry.seq });
    host.socket.close();
    guest.socket.close();
    await second.close();
  });
});
