import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.ts';
import { pruneBattleHistory } from '../retention.ts';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('battle retention', () => {
  it('prunes dependent rows beyond the cap but protects shared battles in another player cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'warlords-retention-'));
    dirs.push(dir);
    const db = openDb(join(dir, 'test.db'));
    for (const player of ['p1', 'p2']) {
      db.prepare('INSERT INTO players (id, token, created_at) VALUES (?, ?, 0)').run(player, `t-${player}`);
    }
    const insert = db.prepare(
      "INSERT INTO battles (id, mode, player_ids, initial_state, engine_version, started_at) VALUES (?, 'solo', ?, '{}', '2', ?)"
    );
    insert.run('new', JSON.stringify(['p1']), 3);
    insert.run('shared', JSON.stringify(['p1', 'p2']), 2);
    insert.run('old', JSON.stringify(['p1']), 1);
    db.prepare("INSERT INTO battle_actions (battle_id, seq, controller, action) VALUES ('old', 1, 'host', '{}')").run();
    db.prepare("INSERT INTO battle_chat (battle_id, after_seq, controller, text, ts) VALUES ('old', 0, 'host', 'bye', 1)").run();

    expect(pruneBattleHistory(db, 2)).toEqual(['old']);
    expect((db.prepare('SELECT id FROM battles ORDER BY started_at DESC').all() as Array<{ id: string }>).map(row => row.id))
      .toEqual(['new', 'shared']);
    expect((db.prepare("SELECT count(*) AS n FROM battle_actions WHERE battle_id = 'old'").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT count(*) AS n FROM battle_chat WHERE battle_id = 'old'").get() as { n: number }).n).toBe(0);
    db.close();
  });
});
