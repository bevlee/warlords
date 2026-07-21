import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Opens (creating if needed) the SQLite file, enables WAL, and applies any
 *  pending migrations from server/migrations in filename order. Migration N is
 *  the file with numeric prefix N; meta.schema_version records the last applied. */
export function openDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  const row = db.prepare("SELECT v FROM meta WHERE k='schema_version'").get() as
    | { v: string }
    | undefined;
  let version = row ? Number(row.v) : 0;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const n = Number(file.split('-')[0]);
    if (n <= version) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO meta (k, v) VALUES ('schema_version', ?) " +
          'ON CONFLICT(k) DO UPDATE SET v=excluded.v'
      ).run(String(n));
    });
    apply();
    version = n;
  }
}
