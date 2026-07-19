import { openDB, type IDBPDatabase } from 'idb';
import type { Hero } from './engine/types';

const DB_NAME = 'warlords';
const STORE = 'kv';
const HERO_KEY = 'hero';

function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  });
}

export async function loadHero(): Promise<Hero | null> {
  return (await (await db()).get(STORE, HERO_KEY)) ?? null;
}

export async function saveHero(hero: Hero): Promise<void> {
  // JSON round-trip: deep-plain copy — a shallow spread still leaves nested
  // state proxies (factionSkills), which aren't structured-cloneable.
  await (await db()).put(STORE, JSON.parse(JSON.stringify(hero)), HERO_KEY);
}

export async function resetHero(): Promise<void> {
  await (await db()).delete(STORE, HERO_KEY);
}

const ARMY_KEY = 'army';

/** Last army the player fielded, as unit name → count. Names only: unit stats
 *  always come from the current roster, never from a stale save. */
export type SavedArmy = Record<string, number>;

export async function loadArmy(): Promise<SavedArmy | null> {
  return (await (await db()).get(STORE, ARMY_KEY)) ?? null;
}

export async function saveArmy(counts: SavedArmy): Promise<void> {
  // Spread: state proxies aren't structured-cloneable.
  await (await db()).put(STORE, { ...counts }, ARMY_KEY);
}

export async function clearArmy(): Promise<void> {
  await (await db()).delete(STORE, ARMY_KEY);
}

const RUN_KEY = 'gauntletRun';

export async function loadRun<T>(): Promise<T | null> {
  return (await (await db()).get(STORE, RUN_KEY)) ?? null;
}

export async function saveRun<T>(run: T): Promise<void> {
  // JSON round-trip: deep-plain copy, state proxies aren't structured-cloneable.
  await (await db()).put(STORE, JSON.parse(JSON.stringify(run)), RUN_KEY);
}

export async function clearRun(): Promise<void> {
  await (await db()).delete(STORE, RUN_KEY);
}
