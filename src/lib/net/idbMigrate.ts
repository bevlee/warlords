// One-time import of pre-server saves (parent plan Part 1, "Migration of
// existing saves"). Runs only when a session is freshly minted: reads the old
// `warlords` IndexedDB database if present, uploads each slot, then deletes the
// database. Ships for a release or two, then this file and the `idb` dep go.
import { openDB, deleteDB } from 'idb';
import { putSave, _setFreshSessionHook, type SaveSlot } from './api';

const DB_NAME = 'warlords';
const STORE = 'kv';
const SLOTS: SaveSlot[] = ['hero', 'campaign', 'gauntletRun'];

export function installIdbMigration(): void {
  _setFreshSessionHook(migrate);
}

async function migrate(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    // databases() doesn't exist in Firefox. Where we can enumerate, skip early
    // when there's nothing to import; where we can't, open directly — a
    // database that never existed opens empty and gets deleted below.
    if (indexedDB.databases) {
      const existing = await indexedDB.databases();
      if (!existing.some(d => d.name === DB_NAME)) return;
    }

    const db = await openDB(DB_NAME, 1);
    if (db.objectStoreNames.contains(STORE)) {
      for (const slot of SLOTS) {
        const value = await db.get(STORE, slot);
        if (value !== undefined) await putSave(slot, value);
      }
    }
    db.close();
    await deleteDB(DB_NAME);
  } catch (err) {
    // Import is best-effort; a failure must never block the game from loading.
    console.error('idb save import failed:', err);
  }
}
