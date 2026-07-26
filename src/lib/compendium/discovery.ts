// What the player has met in battle. Nothing is gated on this — it drives
// "Encountered" markers and per-faction counts only, so every write is
// fire-and-forget and a failure costs a badge, never a battle.
//
// Recorded on sight: at battle start, every stack on the field counts, win or
// lose. Gauntlet items and unit skills record when *offered* in a draft, so an
// option the player passed over stays readable afterwards.

import { getSave, putSave, deleteSave } from '../net/api';
import type { FactionClass } from '../engine/types';
import type { ItemId } from '../gauntlet/items';
import type { SkillId } from '../gauntlet/skills';

export interface DiscoveryState {
  /** Catalog slugs — see engine/catalog.ts. */
  units: string[];
  factions: FactionClass[];
  items: ItemId[];
  unitSkills: SkillId[];
}

/** A partial sighting; every field optional so callers pass only what they saw. */
export type Sighting = Partial<DiscoveryState>;

const FIELDS = ['units', 'factions', 'items', 'unitSkills'] as const;

export function newDiscovery(): DiscoveryState {
  return { units: [], factions: [], items: [], unitSkills: [] };
}

/** Tolerant read: a save written before a field existed still loads. Anything
 *  that isn't an array of strings is discarded rather than trusted. */
export function normalizeDiscovery(saved: unknown): DiscoveryState {
  const raw = (saved ?? {}) as Record<string, unknown>;
  const out = newDiscovery();
  for (const field of FIELDS) {
    const value = raw[field];
    if (!Array.isArray(value)) continue;
    const clean = value.filter((v): v is string => typeof v === 'string');
    (out[field] as string[]) = [...new Set(clean)].sort();
  }
  return out;
}

/**
 * Merge a sighting into the state, returning `null` when nothing is new.
 *
 * That null is what keeps this cheap: the save only fires on an actual
 * discovery, so replaying chapter 1 with a known army writes nothing.
 * Arrays stay sorted and deduplicated so the stored JSON is stable.
 */
export function mergeDiscovery(state: DiscoveryState, seen: Sighting): DiscoveryState | null {
  let changed = false;
  const next = newDiscovery();

  for (const field of FIELDS) {
    const known = new Set<string>(state[field] as string[]);
    const before = known.size;
    for (const id of (seen[field] as string[] | undefined) ?? []) known.add(id);
    if (known.size !== before) changed = true;
    (next[field] as string[]) = [...known].sort();
  }

  return changed ? next : null;
}

export function isSeen(state: DiscoveryState, field: (typeof FIELDS)[number], id: string): boolean {
  return (state[field] as string[]).includes(id);
}

/** Encountered / total for a faction's roster, for the per-faction counter. */
export function factionProgress(
  state: DiscoveryState,
  roster: string[],
): { seen: number; total: number } {
  return {
    seen: roster.filter((slug) => state.units.includes(slug)).length,
    total: roster.length,
  };
}

export async function loadDiscovery(): Promise<DiscoveryState> {
  return normalizeDiscovery(await getSave<unknown>('compendium'));
}

export async function saveDiscovery(state: DiscoveryState): Promise<void> {
  await putSave('compendium', state);
}

export async function resetDiscovery(): Promise<void> {
  await deleteSave('compendium');
}

/**
 * Record a sighting. Never throws and never blocks the caller: the compendium
 * is cosmetic, and a battle must not be able to fail because a badge did.
 * Returns the merged state when something was written, else null.
 */
export async function recordSeen(seen: Sighting): Promise<DiscoveryState | null> {
  try {
    const merged = mergeDiscovery(await loadDiscovery(), seen);
    if (!merged) return null;
    await saveDiscovery(merged);
    return merged;
  } catch {
    return null;
  }
}
