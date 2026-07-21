import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../../../server/db.ts';
import { createApi } from '../../../../server/api.ts';
import { _resetForTests } from '../api';
import { loadHero, saveHero, resetHero, loadRun, saveRun, clearRun } from '../../storage';
import {
  loadCampaign,
  saveCampaign,
  resetCampaign,
  newCampaign,
} from '../../campaign/campaignStore';
import type { Hero } from '../../engine/types';

let server: Server;
let dir: string;

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'warlords-storage-'));
  const api = createApi(openDb(join(dir, 'test.db')));
  server = createServer((req, res) => api(req, res, () => (res.statusCode = 404, res.end())));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  store.clear();
  _resetForTests(base, [10, 20, 40]);
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const hero: Hero = {
  class: 'wizard', level: 4, xp: 120, attack: 2, defense: 6, statPoints: 1, factionSkills: [],
};

describe('storage over the API (signatures unchanged)', () => {
  it('hero round-trip', async () => {
    expect(await loadHero()).toBeNull();
    await saveHero(hero);
    expect(await loadHero()).toEqual(hero);
    await resetHero();
    expect(await loadHero()).toBeNull();
  });

  it('gauntlet run round-trip', async () => {
    expect(await loadRun()).toBeNull();
    await saveRun({ battlesWon: 3, seed: 99 });
    expect(await loadRun()).toEqual({ battlesWon: 3, seed: 99 });
    await clearRun();
    expect(await loadRun()).toBeNull();
  });

  it('campaign round-trip', async () => {
    expect(await loadCampaign()).toBeNull();
    const c = newCampaign('default');
    await saveCampaign(c);
    expect(await loadCampaign()).toEqual(c);
    await resetCampaign();
    expect(await loadCampaign()).toBeNull();
  });
});
