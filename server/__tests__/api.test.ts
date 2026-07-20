import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.ts';
import { createApi } from '../api.ts';

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
});
