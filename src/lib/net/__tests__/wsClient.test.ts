import { describe, expect, it } from 'vitest';
import { MultiplayerClient } from '../wsClient';

class FakeSocket {
  readyState = 0;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

describe('MultiplayerClient', () => {
  it('authenticates, answers heartbeats, and tracks the latest sequence', () => {
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerClient('ws://game/ws', 'secret', {
      socketFactory: () => (sockets.push(new FakeSocket()), sockets.at(-1)!),
    });
    client.start(4);
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: 'hello', token: 'secret', lastSeq: 4 });
    sockets[0].receive({ type: 'hello.ok', playerId: 'p1' });
    sockets[0].receive({ type: 'ping' });
    sockets[0].receive({ type: 'battle.applied', seq: 5, byController: 'ai', action: { type: 'wait' }, stateHash: 'x' });
    expect(client.status).toBe('connected');
    expect(client.latestSeq).toBe(5);
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toEqual({ type: 'pong' });
    client.stop();
  });

  it('backs off 1s then 2s and exposes lost status after the second failure', () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const client = new MultiplayerClient('ws://game/ws', 'secret', {
      socketFactory: () => (sockets.push(new FakeSocket()), sockets.at(-1)!),
      setTimer: (fn, ms) => (timers.push({ fn, ms }), 1 as any),
      clearTimer: () => {},
    });
    client.start();
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: 'hello', token: 'secret' });
    sockets[0].close();
    expect(timers[0].ms).toBe(1000);
    timers[0].fn();
    sockets[1].close();
    expect(timers[1].ms).toBe(2000);
    expect(client.status).toBe('lost');
    client.stop();
  });

  it('reconnects when its own heartbeat pong is missed', () => {
    const socket = new FakeSocket();
    let heartbeat = () => {};
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const client = new MultiplayerClient('ws://game/ws', 'secret', {
      socketFactory: () => socket,
      setTimer: (fn, ms) => (timers.push({ fn, ms }), 1 as any),
      setRepeating: fn => (heartbeat = fn, 2 as any),
      clearRepeating: () => {},
    });
    client.start();
    socket.open();
    socket.receive({ type: 'hello.ok', playerId: 'p1' });
    heartbeat();
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'ping' });
    heartbeat();
    expect(socket.readyState).toBe(3);
    expect(timers[0].ms).toBe(1000);
    client.stop();
  });
});
