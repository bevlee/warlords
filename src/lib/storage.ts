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
  // Spread: state proxies aren't structured-cloneable.
  await (await db()).put(STORE, { ...hero }, HERO_KEY);
}

export async function resetHero(): Promise<void> {
  await (await db()).delete(STORE, HERO_KEY);
}
