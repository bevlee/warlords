import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { openDb } from '../db.ts';
import { RoomRegistry } from '../rooms.ts';
import { attachWebSocketServer } from '../ws.ts';
import type { WsServiceOptions } from '../ws.ts';
import type { ClientMessage, ServerMessage } from '../protocol.ts';
import { GOBLIN, WOLF_RIDER } from '../../src/lib/engine/barbarian.ts';
import { aiTakeTurn } from '../../src/lib/engine/ai.ts';
import type { Hero } from '../../src/lib/engine/types.ts';

const TEST_HERO: Hero = {
  class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
};
const TEST_LOADOUT = { hero: TEST_HERO, army: [{ unit: GOBLIN, count: 9 }] };

const dirs: string[] = [];
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function runtime(options: WsServiceOptions = { heartbeatMs: 10_000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'warlords-ws-'));
  dirs.push(dir);
  const db = openDb(join(dir, 'test.db'));
  for (const id of ['p1', 'p2']) {
    db.prepare('INSERT INTO players (id, token, created_at) VALUES (?, ?, ?)').run(id, `t-${id}`, Date.now());
  }
  const rooms = new RoomRegistry(db);
  const server = createServer((_req, res) => (res.statusCode = 404, res.end()));
  const service = attachWebSocketServer(server, db, rooms, options);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/ws`;
  const close = async () => {
    await service.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  };
  cleanups.push(close);
  return { db, rooms, server, service, url, close };
}

class Client {
  readonly socket: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private readonly waiters: Array<{ predicate: (message: ServerMessage) => boolean; resolve: (message: ServerMessage) => void }> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      const waiter = this.waiters.find(item => item.predicate(message));
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      } else this.messages.push(message);
    });
  }

  async open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>(resolve => this.socket.once('open', () => resolve()));
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const existing = this.messages.find(predicate);
    if (existing) {
      this.messages.splice(this.messages.indexOf(existing), 1);
      return Promise.resolve(existing);
    }
    return new Promise(resolve => this.waiters.push({ predicate, resolve }));
  }
}

async function hello(client: Client, token: string, lastSeq?: number) {
  await client.open();
  client.send({ type: 'hello', token, ...(lastSeq === undefined ? {} : { lastSeq }) });
  return client.waitFor(message => message.type === 'hello.ok');
}

describe('/ws', () => {
  it('leaves websocket upgrades for other paths to their owning service', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'warlords-ws-shared-'));
    dirs.push(dir);
    const db = openDb(join(dir, 'test.db'));
    const rooms = new RoomRegistry(db);
    const server = createServer((_req, res) => (res.statusCode = 404, res.end()));
    const otherWss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/hmr') {
        otherWss.handleUpgrade(request, socket, head, ws => otherWss.emit('connection', ws, request));
      }
    });
    const service = attachWebSocketServer(server, db, rooms, { heartbeatMs: 10_000 });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await service.close();
      for (const socket of otherWss.clients) socket.terminate();
      await new Promise<void>(resolve => otherWss.close(() => resolve()));
      await new Promise<void>(resolve => server.close(() => resolve()));
      db.close();
    });

    const client = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/hmr`);
    await new Promise<void>((resolve, reject) => {
      client.once('open', resolve);
      client.once('error', reject);
    });
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  it('authenticates two clients, creates/joins a room, and supersedes an older session', async () => {
    const app = await runtime();
    const host = new Client(app.url);
    const guest = new Client(app.url);
    await hello(host, 't-p1');
    host.send({ type: 'room.create', loadout: TEST_LOADOUT });
    const created = await host.waitFor(message => message.type === 'room.state') as Extract<ServerMessage, { type: 'room.state' }>;
    expect(created.code).toMatch(/^[A-Z]{5}$/);

    await hello(guest, 't-p2');
    guest.send({ type: 'room.join', code: created.code, loadout: TEST_LOADOUT });
    const joined = await guest.waitFor(message => message.type === 'room.state') as Extract<ServerMessage, { type: 'room.state' }>;
    expect(joined.players).toHaveLength(2);

    const replacement = new Client(app.url);
    await hello(replacement, 't-p1');
    const superseded = await host.waitFor(message => message.type === 'error');
    expect(superseded).toMatchObject({ type: 'error', code: 'superseded' });
  });

  it('rejects room operations before hello', async () => {
    const app = await runtime();
    const client = new Client(app.url);
    await client.open();
    client.send({ type: 'room.create', loadout: {} });
    expect(await client.waitFor(message => message.type === 'error')).toMatchObject({
      type: 'error', code: 'not_authenticated',
    });
  });

  it('rejects malformed messages at the transport boundary', async () => {
    const app = await runtime();
    const client = new Client(app.url);
    await client.open();

    client.socket.send('{not json');
    expect(await client.waitFor(message => message.type === 'error')).toMatchObject({
      type: 'error', code: 'bad_json',
    });

    client.socket.send(JSON.stringify({ type: 'room.join', code: 12345, loadout: {} }));
    expect(await client.waitFor(message => message.type === 'error')).toMatchObject({
      type: 'error', code: 'invalid_message',
    });
  });

  it('rejects malformed loadouts and canonicalizes client unit stats', async () => {
    const app = await runtime();
    const client = new Client(app.url);
    await hello(client, 't-p1');
    client.send({ type: 'room.create', loadout: { faction: 'barbarian' } });
    expect(await client.waitFor(message => message.type === 'error')).toMatchObject({
      type: 'error', code: 'invalid_loadout',
    });
    expect(app.rooms.findForPlayer('p1')).toBeUndefined();

    client.send({
      type: 'room.create',
      loadout: { hero: TEST_HERO, army: [{ unit: { ...GOBLIN, attack: 999 }, count: 3 }] },
    });
    await client.waitFor(message => message.type === 'room.state');
    const saved = app.rooms.findForPlayer('p1')!.host.loadout as typeof TEST_LOADOUT;
    expect(saved.army[0].unit.attack).toBe(GOBLIN.attack);
  });

  it('returns room_gone for a stale reconnect sequence', async () => {
    const app = await runtime();
    const client = new Client(app.url);
    await hello(client, 't-p1', 3);
    expect(await client.waitFor(message => message.type === 'error')).toMatchObject({
      type: 'error', code: 'room_gone',
    });
  });

  it('closes a client after two missed app-level heartbeat replies', async () => {
    const app = await runtime({ heartbeatMs: 10, helloTimeoutMs: 1000 });
    const client = new Client(app.url);
    await hello(client, 't-p1');
    const closed = new Promise<number>(resolve => client.socket.once('close', code => resolve(code)));
    expect(await closed).toBe(1006);
  });

  it('runs an authoritative co-op battle with scoped deploy, pause/rejoin, AI, and chat', async () => {
    const app = await runtime({ heartbeatMs: 10_000, disconnectGraceMs: 500 });
    const hero: Hero = {
      class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
    };
    const loadout = { hero, army: [{ unit: GOBLIN, count: 9 }, { unit: WOLF_RIDER, count: 3 }] };
    const host = new Client(app.url);
    const guest = new Client(app.url);
    await hello(host, 't-p1');
    host.send({ type: 'room.create', loadout });
    const created = await host.waitFor(message => message.type === 'room.state') as Extract<ServerMessage, { type: 'room.state' }>;
    await hello(guest, 't-p2');
    guest.send({ type: 'room.join', code: created.code, loadout });
    const deploy = await guest.waitFor(message => message.type === 'deploy.state') as Extract<ServerMessage, { type: 'deploy.state' }>;
    await host.waitFor(message => message.type === 'deploy.state');

    const hostUnit = deploy.state.units.find(unit => unit.controllerId === 'host' && !unit.isHero)!;
    guest.send({ type: 'deploy.move', unitId: hostUnit.id, to: { col: 2, row: 9 } });
    expect(await guest.waitFor(message => message.type === 'error')).toMatchObject({ code: 'invalid_deploy' });

    host.send({ type: 'deploy.confirm' });
    guest.send({ type: 'deploy.confirm' });
    await host.waitFor(message => message.type === 'battle.start');
    await guest.waitFor(message => message.type === 'battle.start');
    const room = app.rooms.get(created.code)!;

    host.send({ type: 'chat.send', text: '  hold the line  ' });
    expect(await guest.waitFor(message => message.type === 'chat.message')).toMatchObject({
      byController: 'host', text: 'hold the line',
    });

    guest.socket.close();
    await host.waitFor(message => message.type === 'room.waiting' && message.waiting);
    host.send({ type: 'battle.action', lastSeq: room.actions.length, action: { type: 'wait' } });
    expect(await host.waitFor(message => message.type === 'error')).toMatchObject({ code: 'waiting_for_peer' });

    const guest2 = new Client(app.url);
    await hello(guest2, 't-p2', room.actions.length);
    await host.waitFor(message => message.type === 'room.waiting' && !message.waiting);

    for (let turn = 0; room.state!.result === 'ongoing' && turn < 500; turn++) {
      const actor = room.state!.units.find(unit => unit.id === room.state!.currentUnitId)!;
      expect(actor.controllerId).not.toBe('ai'); // server drains AI turns itself
      const sender = actor.controllerId === 'host' ? host : guest2;
      const nextSeq = room.actions.length + 1;
      sender.send({
        type: 'battle.action',
        lastSeq: room.actions.length,
        action: aiTakeTurn(room.state!, actor.id),
      });
      await sender.waitFor(message => message.type === 'battle.applied' && message.seq === nextSeq);
    }
    expect(room.state!.result).not.toBe('ongoing');
    const persisted = app.db.prepare('SELECT result, summary FROM battles WHERE id = ?').get(room.battleId) as any;
    expect(persisted.result).toBe(room.state!.result);
    expect(JSON.parse(persisted.summary)).toMatchObject({ rounds: expect.any(Number) });
    expect(app.rooms.get(created.code)).toBeUndefined();
    expect((app.db.prepare('SELECT text FROM battle_chat WHERE battle_id = ?').get(room.battleId) as any).text)
      .toBe('hold the line');
  });

  it('freezes the deploy deadline while a player is disconnected', async () => {
    const app = await runtime({ heartbeatMs: 10_000, disconnectGraceMs: 500, deployTimeoutMs: 30 });
    const loadout = { hero: TEST_HERO, army: [{ unit: GOBLIN, count: 3 }] };
    const host = new Client(app.url);
    const guest = new Client(app.url);
    await hello(host, 't-p1');
    host.send({ type: 'room.create', loadout });
    const created = await host.waitFor(message => message.type === 'room.state') as Extract<ServerMessage, { type: 'room.state' }>;
    await hello(guest, 't-p2');
    guest.send({ type: 'room.join', code: created.code, loadout });
    await guest.waitFor(message => message.type === 'deploy.state');
    guest.socket.close();
    await host.waitFor(message => message.type === 'room.waiting' && message.waiting);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(app.rooms.get(created.code)?.phase).toBe('deploy');

    const rejoined = new Client(app.url);
    await hello(rejoined, 't-p2');
    await host.waitFor(message => message.type === 'battle.start');
    expect(app.rooms.get(created.code)?.phase).toBe('battle');
  });

  it('abandons a live battle after the reconnect grace period', async () => {
    const app = await runtime({ heartbeatMs: 10_000, disconnectGraceMs: 20, deployTimeoutMs: 10_000 });
    const host = new Client(app.url);
    const guest = new Client(app.url);
    await hello(host, 't-p1');
    host.send({ type: 'room.create', loadout: TEST_LOADOUT });
    const created = await host.waitFor(message => message.type === 'room.state') as Extract<ServerMessage, { type: 'room.state' }>;
    await hello(guest, 't-p2');
    guest.send({ type: 'room.join', code: created.code, loadout: TEST_LOADOUT });
    await guest.waitFor(message => message.type === 'deploy.state');
    host.send({ type: 'deploy.confirm' });
    guest.send({ type: 'deploy.confirm' });
    await host.waitFor(message => message.type === 'battle.start');
    const battleId = app.rooms.get(created.code)!.battleId!;

    guest.socket.close();
    await host.waitFor(message => message.type === 'battle.end' && message.result === 'abandoned');
    expect(app.rooms.get(created.code)).toBeUndefined();
    expect((app.db.prepare('SELECT result FROM battles WHERE id = ?').get(battleId) as { result: string }).result)
      .toBe('abandoned');
  });
});
