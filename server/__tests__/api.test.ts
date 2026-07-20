import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.ts';
import { createApi } from '../api.ts';
import { ENGINE_VERSION } from '../../src/lib/engine/version.ts';

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'warlords-api-'));
  const db = openDb(join(dir, 'test.db'));
  const api = createApi(db);
  server = createServer((req, res) => {
    api(req, res, () => {
      res.statusCode = 418; // sentinel: request fell through to the SPA handler
      res.end();
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

async function mintSession(): Promise<{ playerId: string; token: string }> {
  const res = await fetch(`${base}/api/session`, { method: 'POST' });
  expect(res.status).toBe(200);
  return res.json();
}

const soloBattle = {
  initialState: { seed: 42, log: [], result: 'ongoing', units: [] },
  actions: [
    { controller: 'host', action: { type: 'wait' } },
    { controller: 'ai', action: { type: 'defend' } },
  ],
  summary: {
    rounds: 3,
    playerCasualties: [{ unitName: 'Goblin', lost: 2 }],
    enemyCasualties: [{ unitName: 'Wolf Rider', lost: 4 }],
  },
  result: 'player_wins',
};

describe('api', () => {
  it('serves health unauthenticated', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
  });

  it('passes non-api requests through', async () => {
    const res = await fetch(`${base}/some/page`);
    expect(res.status).toBe(418);
  });

  it('mints a session with playerId and token', async () => {
    const s = await mintSession();
    expect(s.playerId).toBeTruthy();
    expect(s.token).toBeTruthy();
  });

  it('round-trips a save', async () => {
    const { token } = await mintSession();
    const auth = { Authorization: `Bearer ${token}` };

    const missing = await fetch(`${base}/api/save/hero`, { headers: auth });
    expect(missing.status).toBe(404);

    const hero = { class: 'barbarian', level: 3 };
    const put = await fetch(`${base}/api/save/hero`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(hero),
    });
    expect(put.status).toBe(204);

    const got = await fetch(`${base}/api/save/hero`, { headers: auth });
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(hero);

    const del = await fetch(`${base}/api/save/hero`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(204);
    const gone = await fetch(`${base}/api/save/hero`, { headers: auth });
    expect(gone.status).toBe(404);
  });

  it('saves are per-player', async () => {
    const a = await mintSession();
    const b = await mintSession();
    await fetch(`${base}/api/save/campaign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter: 2 }),
    });
    const other = await fetch(`${base}/api/save/campaign`, {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(other.status).toBe(404);
  });

  it('rejects missing or bad tokens', async () => {
    expect((await fetch(`${base}/api/save/hero`)).status).toBe(401);
    const bad = await fetch(`${base}/api/save/hero`, {
      headers: { Authorization: 'Bearer nope' },
    });
    expect(bad.status).toBe(401);
  });

  it('rejects unknown slots', async () => {
    const { token } = await mintSession();
    const res = await fetch(`${base}/api/save/loot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON bodies', async () => {
    const { token } = await mintSession();
    const res = await fetch(`${base}/api/save/hero`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('uploads a solo journal and returns it through history and replay detail', async () => {
    const { token } = await mintSession();
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const uploaded = await fetch(`${base}/api/battles`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(soloBattle),
    });
    expect(uploaded.status).toBe(201);
    const { id } = (await uploaded.json()) as { id: string };
    expect(id).toBeTruthy();

    const history = await fetch(`${base}/api/battles`, { headers: auth });
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual([
      expect.objectContaining({
        id,
        mode: 'solo',
        result: 'player_wins',
        engineVersion: ENGINE_VERSION,
        summary: soloBattle.summary,
      }),
    ]);

    const detail = await fetch(`${base}/api/battles/${id}`, { headers: auth });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(
      expect.objectContaining({
        id,
        mode: 'solo',
        initialState: soloBattle.initialState,
        actions: [
          { seq: 1, ...soloBattle.actions[0] },
          { seq: 2, ...soloBattle.actions[1] },
        ],
        chat: [],
        engineVersion: ENGINE_VERSION,
        result: 'player_wins',
        summary: soloBattle.summary,
      })
    );
  });

  it('lists newest battles first and isolates battle history by player', async () => {
    const owner = await mintSession();
    const stranger = await mintSession();
    const headers = {
      Authorization: `Bearer ${owner.token}`,
      'Content-Type': 'application/json',
    };
    const first = await fetch(`${base}/api/battles`, {
      method: 'POST', headers, body: JSON.stringify(soloBattle),
    });
    const firstId = ((await first.json()) as { id: string }).id;
    const second = await fetch(`${base}/api/battles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...soloBattle, result: 'enemy_wins' }),
    });
    const secondId = ((await second.json()) as { id: string }).id;

    const owned = await fetch(`${base}/api/battles`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect((await owned.json()).map((row: { id: string }) => row.id)).toEqual([secondId, firstId]);

    const hiddenList = await fetch(`${base}/api/battles`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(await hiddenList.json()).toEqual([]);
    const hiddenDetail = await fetch(`${base}/api/battles/${firstId}`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(hiddenDetail.status).toBe(404);
  });

  it('deduplicates a retried upload by idempotency key', async () => {
    const { token } = await mintSession();
    const id = 'a4ab4bd8-680d-4fe1-9ca3-c07b593e8ca4';
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': id,
    };
    const first = await fetch(`${base}/api/battles`, {
      method: 'POST', headers, body: JSON.stringify(soloBattle),
    });
    const retry = await fetch(`${base}/api/battles`, {
      method: 'POST', headers, body: JSON.stringify(soloBattle),
    });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ id });
    const history = await fetch(`${base}/api/battles`, { headers });
    expect((await history.json()).filter((row: { id: string }) => row.id === id)).toHaveLength(1);
  });

  it('rejects malformed solo journals', async () => {
    const { token } = await mintSession();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const badResult = await fetch(`${base}/api/battles`, {
      method: 'POST', headers, body: JSON.stringify({ ...soloBattle, result: 'abandoned' }),
    });
    expect(badResult.status).toBe(400);

    const dirtySnapshot = await fetch(`${base}/api/battles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...soloBattle, initialState: { ...soloBattle.initialState, log: [{}] } }),
    });
    expect(dirtySnapshot.status).toBe(400);

    const badController = await fetch(`${base}/api/battles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...soloBattle,
        actions: [{ controller: 'guest', action: { type: 'wait' } }],
      }),
    });
    expect(badController.status).toBe(400);

    const badKey = await fetch(`${base}/api/battles`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'not-a-uuid' },
      body: JSON.stringify(soloBattle),
    });
    expect(badKey.status).toBe(400);
  });
});
