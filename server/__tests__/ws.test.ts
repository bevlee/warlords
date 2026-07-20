import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { openDb } from '../db.ts';
import { RoomRegistry } from '../rooms.ts';
import { attachWebSocketServer } from '../ws.ts';
import type { WsServiceOptions } from '../ws.ts';
import type { ClientMessage, ServerMessage } from '../protocol.ts';

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
  it('authenticates two clients, creates/joins a room, and supersedes an older session', async () => {
    const app = await runtime();
    const host = new Client(app.url);
    const guest = new Client(app.url);
    await hello(host, 't-p1');
    host.send({ type: 'room.create', loadout: { faction: 'barbarian' } });
    const created = await host.waitFor(message => message.type === 'room.state') as Extract<ServerMessage, { type: 'room.state' }>;
    expect(created.code).toMatch(/^[A-Z]{5}$/);

    await hello(guest, 't-p2');
    guest.send({ type: 'room.join', code: created.code, loadout: { faction: 'knight' } });
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
});
