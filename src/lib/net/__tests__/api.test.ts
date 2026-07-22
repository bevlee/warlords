import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../../../server/db.ts';
import { createApi } from '../../../../server/api.ts';
import {
  getSession,
  getSave,
  putSave,
  deleteSave,
  fetchWithRetry,
  _resetForTests,
  postSoloBattle,
  getBattles,
  getBattle,
} from '../api';
import { ENGINE_VERSION } from '../../engine/version';

let server: Server;
let base: string;
let dir: string;

// node test env has no localStorage; the client module only uses get/set/remove.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'warlords-clientapi-'));
  const db = openDb(join(dir, 'test.db'));
  const api = createApi(db);
  server = createServer((req, res) => api(req, res, () => (res.statusCode = 404, res.end())));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  store.clear();
  _resetForTests(base, [10, 20, 40]); // fast retry delays for tests
});

describe('client api', () => {
  it('mints a session once and persists it', async () => {
    const a = await getSession();
    const b = await getSession();
    expect(a.playerId).toBeTruthy();
    expect(b).toEqual(a);
    expect(JSON.parse(store.get('warlords.session')!)).toEqual(a);
  });

  it('reuses a stored session instead of minting', async () => {
    const first = await getSession();
    _resetForTests(base, [10, 20, 40]); // new module state, same localStorage
    const second = await getSession();
    expect(second).toEqual(first);
  });

  it('round-trips saves and returns null for missing', async () => {
    expect(await getSave('hero')).toBeNull();
    await putSave('hero', { class: 'knight', level: 7 });
    expect(await getSave('hero')).toEqual({ class: 'knight', level: 7 });
    await deleteSave('hero');
    expect(await getSave('hero')).toBeNull();
  });

  it('re-mints and retries when the stored token is rejected (401)', async () => {
    // A stale token from a DB the server no longer knows about (e.g. the dev
    // db was reset). The client must self-heal rather than 401 forever.
    store.set('warlords.session', JSON.stringify({ playerId: 'ghost', token: 'stale-token-not-in-db' }));
    _resetForTests(base, [10, 20, 40]); // module reads the stale token from localStorage

    expect(await getSave('hero')).toBeNull(); // recovers to a fresh session, no save yet

    const stored = JSON.parse(store.get('warlords.session')!);
    expect(stored.token).not.toBe('stale-token-not-in-db'); // stale token replaced
    expect(stored.playerId).toBeTruthy();

    // The healed session works for writes too.
    await putSave('hero', { class: 'wizard', level: 3 });
    expect(await getSave('hero')).toEqual({ class: 'wizard', level: 3 });
  });

  it('retries on 5xx and then succeeds', async () => {
    let calls = 0;
    const flaky = createServer((req, res) => {
      calls++;
      if (calls < 3) {
        res.statusCode = 503;
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
    });
    await new Promise<void>(r => flaky.listen(0, '127.0.0.1', r));
    const flakyBase = `http://127.0.0.1:${(flaky.address() as any).port}`;
    _resetForTests(flakyBase, [10, 20, 40]);

    const res = await fetchWithRetry('/anything', { method: 'GET' }, false);
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
    await new Promise(r => flaky.close(r));
  });

  it('gives up after exhausting retries', async () => {
    const dead = createServer((req, res) => {
      res.statusCode = 500;
      res.end();
    });
    await new Promise<void>(r => dead.listen(0, '127.0.0.1', r));
    _resetForTests(`http://127.0.0.1:${(dead.address() as any).port}`, [10, 20, 40]);

    const res = await fetchWithRetry('/x', { method: 'GET' }, false);
    expect(res.status).toBe(500); // last response returned, caller decides
    await new Promise(r => dead.close(r));
  });

  it('uploads and reads a solo battle journal', async () => {
    const payload = {
      initialState: { seed: 9, log: [], result: 'ongoing', units: [] } as any,
      actions: [{ controller: 'host' as const, action: { type: 'wait' as const } }],
      summary: { rounds: 2, playerCasualties: [], enemyCasualties: [] },
      result: 'player_wins' as const,
    };

    const { id } = await postSoloBattle(payload);
    expect(await getBattles()).toEqual([
      expect.objectContaining({ id, mode: 'solo', engineVersion: ENGINE_VERSION }),
    ]);
    expect(await getBattle(id)).toEqual(
      expect.objectContaining({
        id,
        initialState: payload.initialState,
        actions: [{ seq: 1, ...payload.actions[0] }],
      })
    );
  });
});
