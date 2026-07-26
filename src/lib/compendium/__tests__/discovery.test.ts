import { describe, it, expect } from 'vitest';
import {
  factionProgress,
  isSeen,
  mergeDiscovery,
  newDiscovery,
  normalizeDiscovery,
} from '../discovery';

describe('mergeDiscovery', () => {
  it('returns null when nothing is new — the property that keeps writes rare', () => {
    const state = { ...newDiscovery(), units: ['goblin', 'orc'] };
    expect(mergeDiscovery(state, { units: ['goblin'] })).toBeNull();
    expect(mergeDiscovery(state, { units: ['goblin', 'orc'] })).toBeNull();
    expect(mergeDiscovery(state, {})).toBeNull();
    expect(mergeDiscovery(state, { units: [] })).toBeNull();
  });

  it('adds only what is new, and reports the change', () => {
    const state = { ...newDiscovery(), units: ['goblin'] };
    const merged = mergeDiscovery(state, { units: ['goblin', 'lich'] });
    expect(merged?.units).toEqual(['goblin', 'lich']);
  });

  it('never mutates the state it was given', () => {
    const state = { ...newDiscovery(), units: ['goblin'] };
    mergeDiscovery(state, { units: ['lich'] });
    expect(state.units).toEqual(['goblin']);
  });

  it('deduplicates and sorts, so the stored JSON is stable', () => {
    const merged = mergeDiscovery(newDiscovery(), { units: ['orc', 'goblin', 'orc', 'lich'] });
    expect(merged?.units).toEqual(['goblin', 'lich', 'orc']);
  });

  it('reaches the same state regardless of the order sightings arrive in', () => {
    const forward = mergeDiscovery(
      mergeDiscovery(newDiscovery(), { units: ['orc'] })!,
      { units: ['goblin'] },
    );
    const backward = mergeDiscovery(
      mergeDiscovery(newDiscovery(), { units: ['goblin'] })!,
      { units: ['orc'] },
    );
    expect(forward).toEqual(backward);
  });

  it('tracks each field independently', () => {
    const merged = mergeDiscovery(newDiscovery(), {
      units: ['skeleton'],
      factions: ['necromancer'],
      items: ['aegis_charm'],
      unitSkills: ['life_drain'],
    });
    expect(merged).toEqual({
      units: ['skeleton'],
      factions: ['necromancer'],
      items: ['aegis_charm'],
      unitSkills: ['life_drain'],
    });
  });

  it('detects a change in any single field', () => {
    const state = { ...newDiscovery(), units: ['orc'] };
    expect(mergeDiscovery(state, { units: ['orc'], items: ['rabbits_foot'] })?.items).toEqual([
      'rabbits_foot',
    ]);
  });
});

describe('normalizeDiscovery', () => {
  it('defaults every field, so a save written before a field existed still loads', () => {
    expect(normalizeDiscovery({ units: ['orc'] })).toEqual({
      units: ['orc'],
      factions: [],
      items: [],
      unitSkills: [],
    });
  });

  it('treats null, undefined, and junk as an empty log rather than trusting them', () => {
    expect(normalizeDiscovery(null)).toEqual(newDiscovery());
    expect(normalizeDiscovery(undefined)).toEqual(newDiscovery());
    expect(normalizeDiscovery({ units: 'goblin' })).toEqual(newDiscovery());
    expect(normalizeDiscovery({ units: [1, null, 'orc'] }).units).toEqual(['orc']);
  });

  it('sorts and deduplicates what it reads', () => {
    expect(normalizeDiscovery({ units: ['orc', 'goblin', 'orc'] }).units).toEqual(['goblin', 'orc']);
  });
});

describe('reading the log', () => {
  it('answers whether a specific entry has been met', () => {
    const state = normalizeDiscovery({ units: ['orc'], items: ['aegis_charm'] });
    expect(isSeen(state, 'units', 'orc')).toBe(true);
    expect(isSeen(state, 'units', 'goblin')).toBe(false);
    expect(isSeen(state, 'items', 'aegis_charm')).toBe(true);
  });

  it('counts a faction roster against what has been met', () => {
    const state = normalizeDiscovery({ units: ['goblin', 'orc', 'lich'] });
    expect(factionProgress(state, ['goblin', 'orc', 'ogre'])).toEqual({ seen: 2, total: 3 });
    expect(factionProgress(state, [])).toEqual({ seen: 0, total: 0 });
    expect(factionProgress(newDiscovery(), ['goblin'])).toEqual({ seen: 0, total: 1 });
  });
});
