import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.ts';

const dirs: string[] = [];
function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'warlords-db-'));
  dirs.push(dir);
  return join(dir, 'nested', 'test.db'); // nested: proves openDb mkdirs
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('openDb', () => {
  it('creates the full current schema', () => {
    const db = openDb(tempDbPath());
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    for (const t of ['players', 'saves', 'battles', 'battle_actions', 'battle_chat', 'rooms', 'meta']) {
      expect(tables).toContain(t);
    }
    db.close();
  });

  it('records schema_version and is idempotent on reopen', () => {
    const path = tempDbPath();
    const db1 = openDb(path);
    const v1 = db1.prepare("SELECT v FROM meta WHERE k='schema_version'").get() as any;
    expect(v1.v).toBe('2');
    db1.close();

    const db2 = openDb(path); // re-applying migrations must not throw or duplicate
    const v2 = db2.prepare("SELECT v FROM meta WHERE k='schema_version'").get() as any;
    expect(v2.v).toBe('2');
    db2.close();
  });

  it('enables WAL mode', () => {
    const db = openDb(tempDbPath());
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
    db.close();
  });
});
