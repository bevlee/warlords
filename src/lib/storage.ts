// Server-side saves (parent plan Part 1): same exported signatures the former local
// layer had, bodies now go through the save API. Call sites are unchanged.
import { getSave, putSave, deleteSave } from './net/api';
import type { Hero } from './engine/types';

export async function loadHero(): Promise<Hero | null> {
  return getSave<Hero>('hero');
}

export async function saveHero(hero: Hero): Promise<void> {
  await putSave('hero', hero);
}

export async function resetHero(): Promise<void> {
  await deleteSave('hero');
}

/** Last army the player fielded, as unit name → count. Names only: unit stats
 *  always come from the current roster, never from a stale save. */
export type SavedArmy = Record<string, number>;

export async function loadArmy(): Promise<SavedArmy | null> {
  return getSave<SavedArmy>('army');
}

export async function saveArmy(counts: SavedArmy): Promise<void> {
  await putSave('army', counts);
}

export async function clearArmy(): Promise<void> {
  await deleteSave('army');
}

export async function loadRun<T>(): Promise<T | null> {
  return getSave<T>('gauntletRun');
}

export async function saveRun<T>(run: T): Promise<void> {
  await putSave('gauntletRun', run);
}

export async function clearRun(): Promise<void> {
  await deleteSave('gauntletRun');
}
