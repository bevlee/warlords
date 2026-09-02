import { describe, it, expect } from 'vitest';
import {
  ENTRY_KINDS,
  TAB_OF,
  entriesOfKind,
  entryHref,
  entryHrefFrom,
  findEntry,
  kindOfTab,
  matchesFilters,
  filters,
  filtersFrom,
  ALL,
  spellEntries,
  tabHrefFrom,
  itemSectionOf,
  type EntryKind,
  type ItemEntry,
} from '../entries';
import { CATALOG } from '../../engine/catalog';
import { FACTION_UNITS, FACTION_INFO } from '../../engine/factions';
import { ABILITY_INFO } from '../../ui/abilities';
import { ITEMS, ITEM_IDS } from '../../gauntlet/items';
import { SKILL_IDS } from '../../gauntlet/skills';
import { lightningDamage } from '../../engine/battle';
import type { FactionClass } from '../../engine/types';

describe('entry coverage', () => {
  it('gives every catalog unit exactly one entry', () => {
    const units = entriesOfKind('unit');
    expect(units).toHaveLength(CATALOG.length);
    for (const unit of CATALOG) {
      expect(units.filter(e => e.id === unit.slug)).toHaveLength(1);
    }
  });

  it('covers every faction, item, gauntlet skill, and faction skill', () => {
    expect(entriesOfKind('faction').map(e => e.id).sort()).toEqual(Object.keys(FACTION_INFO).sort());
    expect(entriesOfKind('item').map(e => e.id).sort()).toEqual([...ITEM_IDS].sort());
    expect(entriesOfKind('unitSkill').map(e => e.id).sort()).toEqual([...SKILL_IDS].sort());

  });

  it('documents every ability any unit actually has', () => {
    const used = new Set(Object.values(FACTION_UNITS).flatMap(units => units.flatMap(u => u.abilities)));
    const documented = new Set(entriesOfKind('ability').map(e => e.id));
    for (const id of used) expect(documented, `ability "${id}" has no ABILITY_INFO entry`).toContain(id);
  });

  it('names every entry', () => {
    for (const kind of ENTRY_KINDS) {
      for (const entry of entriesOfKind(kind)) {
        expect(entry.name, `${kind}/${entry.id} has no name`).toBeTruthy();
        expect(entry.kind).toBe(kind);
      }
    }
  });
});

describe('entry ids', () => {
  // Ids are unique *within* a kind, not globally — the URL carries both, and a
  // gauntlet skill deliberately shares its id with the engine ability it grants.
  it('are unique within each kind', () => {
    for (const kind of ENTRY_KINDS) {
      const ids = entriesOfKind(kind).map(e => e.id);
      expect(new Set(ids).size, `${kind} has duplicate ids`).toBe(ids.length);
    }
  });

  it('round-trips through the tab slug used in URLs', () => {
    for (const kind of ENTRY_KINDS) expect(kindOfTab(TAB_OF[kind])).toBe(kind);
    expect(kindOfTab(null)).toBe('unit');
    expect(kindOfTab('nonsense')).toBe('unit');
  });

  it('builds hrefs that resolve back to the same entry', () => {
    for (const kind of ENTRY_KINDS) {
      const entry = entriesOfKind(kind)[0];
      const url = new URL(entryHref(kind, entry.id), 'https://example.test');
      expect(kindOfTab(url.searchParams.get('tab'))).toBe(kind);
      expect(url.searchParams.get('entry')).toBe(entry.id);
      expect(findEntry(kind, entry.id)?.name).toBe(entry.name);
    }
  });
});

describe('entries read from their sources rather than restating them', () => {
  it('takes unit stats straight from the catalog', () => {
    for (const entry of entriesOfKind('unit')) {
      if (entry.kind !== 'unit') continue;
      const source = CATALOG.find(u => u.slug === entry.id)!;
      expect(entry.unit.base).toEqual(source.base);
      expect(entry.tier).toBe(source.tier);
      expect(entry.faction).toBe(source.faction);
    }
  });

  it('lists a faction roster that matches the faction unit table, tier ascending', () => {
    for (const entry of entriesOfKind('faction')) {
      if (entry.kind !== 'faction') continue;
      const roster = FACTION_UNITS[entry.faction];
      expect(entry.roster).toHaveLength(roster.length);
      const tiers = entry.roster.map(slug => CATALOG.find(u => u.slug === slug)!.tier);
      expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    }
  });

  it('cross-references abilities to the units that have them', () => {
    const breath = entriesOfKind('ability').find(e => e.id === 'caustic_breath');
    expect(breath?.kind === 'ability' && breath.units).toContain('bilehorn');
    const deathStare = entriesOfKind('ability').find(e => e.id === 'death_stare');
    expect(deathStare?.kind === 'ability' ? deathStare.units : []).toEqual([]);

    for (const entry of entriesOfKind('ability')) {
      if (entry.kind !== 'ability') continue;
      for (const slug of entry.units) {
        expect(CATALOG.find(u => u.slug === slug)!.abilities).toContain(entry.id);
      }
    }
  });

  it('marks exactly the gauntlet-teachable abilities as teachable', () => {
    const teachable = entriesOfKind('ability')
      .filter(e => e.kind === 'ability' && e.teachable)
      .map(e => e.id);
    expect(teachable.sort()).toEqual([...SKILL_IDS].sort());
  });

  it('scales Lightning with hero level instead of hardcoding a number', () => {
    expect(spellEntries(1).find(s => s.id === 'lightning')!.effect).toContain(String(lightningDamage(1)));
    expect(spellEntries(9).find(s => s.id === 'lightning')!.effect).toContain(String(lightningDamage(9)));
  });

  it('prices units from the recruit table, tolerating units with no price', () => {
    const champion = entriesOfKind('unit').find(e => e.id === 'champion');
    expect(champion?.kind === 'unit' && champion.cost).toBe(150);
  });
});

const items = (): ItemEntry[] => entriesOfKind('item') as ItemEntry[];

describe('filters', () => {
  const unit = (slug: string) => entriesOfKind('unit').find(e => e.id === slug)!;

  it('applies a tier filter only to units, so other tabs are not emptied', () => {
    expect(matchesFilters(unit('champion'), filters({ tier: 7 }))).toBe(true);
    expect(matchesFilters(unit('champion'), filters({ tier: 3 }))).toBe(false);
    // An item has no tier; a stale tier filter must not hide it.
    expect(matchesFilters(entriesOfKind('item')[0], filters({ tier: 3 }))).toBe(true);
    expect(entriesOfKind('item').filter(e => matchesFilters(e, filters({ tier: 3 })))).toHaveLength(
      entriesOfKind('item').length,
    );
  });

  it('applies a faction filter only to entries that have a faction', () => {
    expect(matchesFilters(unit('champion'), filters({ faction: 'knight' }))).toBe(true);
    expect(matchesFilters(unit('champion'), filters({ faction: 'demon' }))).toBe(false);
    expect(matchesFilters(entriesOfKind('spell')[0], filters({ faction: 'demon' }))).toBe(true);
  });

  it('filters artifacts by the faction that can draft them', () => {
    const pennant = items().find(e => e.id === 'butchers_pennant')!;
    expect(matchesFilters(pennant, filters({ faction: 'barbarian' }))).toBe(true);
    expect(matchesFilters(pennant, filters({ faction: 'knight' }))).toBe(false);
    // The legacy stat items belong to no faction: they are Neutral, which is a
    // value you can filter *to*, not an absence.
    const legacy = items().find(e => e.id === 'blade_of_the_vanguard')!;
    expect(legacy.faction).toBe('neutral');
    expect(matchesFilters(legacy, filters({ faction: 'knight' }))).toBe(false);
    expect(matchesFilters(legacy, filters({ faction: 'neutral' }))).toBe(true);
    expect(matchesFilters(legacy, filters())).toBe(true);
    // ...and it is the only group that is Neutral.
    expect(items().filter(e => e.faction === 'neutral').every(e => e.group === 'legacy')).toBe(true);
  });

  it('applies a rarity filter only to artifacts, so other tabs are not emptied', () => {
    const pennant = items().find(e => e.id === 'butchers_pennant')!;
    expect(matchesFilters(pennant, filters({ rarity: 'rare' }))).toBe(true);
    expect(matchesFilters(pennant, filters({ rarity: 'epic' }))).toBe(false);
    expect(matchesFilters(unit('champion'), filters({ rarity: 'epic' }))).toBe(true);
  });

  it('matches names case-insensitively and ignores blank search', () => {
    expect(matchesFilters(unit('champion'), filters({ search: 'CHAMP' }))).toBe(true);
    expect(matchesFilters(unit('champion'), filters({ search: '  ' }))).toBe(true);
    expect(matchesFilters(unit('champion'), filters({ search: 'goblin' }))).toBe(false);
  });
});

describe('the artifact tab sorts itself', () => {
  it('reads each artifact\u2019s faction, source and requirement off the item table', () => {
    for (const entry of items()) {
      const def = ITEMS[entry.id];
      expect(entry.faction).toBe(def.faction ?? def.starterForFaction ?? 'neutral');
      expect(entry.requiresUnit).toEqual(def.requiresUnit ?? []);
      expect(entry.group).toBe(def.legacy ? 'legacy' : def.starterForFaction ? 'starter' : 'faction');
    }
  });

  it('groups starters first, then faction pools, then the legacy pool', () => {
    const groups = items().map(e => e.group);
    expect([...new Set(groups)]).toEqual(['starter', 'faction', 'legacy']);
    // Each group is one contiguous run, so the page never repeats a heading.
    expect(groups.filter((g, i) => g !== groups[i - 1])).toEqual(['starter', 'faction', 'legacy']);
  });

  it('keeps each faction\u2019s artifacts together and ordered common to epic', () => {
    const rank = { common: 0, rare: 1, epic: 2 };
    const faction = items().filter(e => e.group === 'faction');
    const sections = faction.map(itemSectionOf);
    expect(new Set(sections).size).toBe(sections.filter((s, i) => s !== sections[i - 1]).length);
    for (const [index, entry] of faction.entries()) {
      const previous = faction[index - 1];
      if (!previous || itemSectionOf(previous) !== itemSectionOf(entry)) continue;
      expect(rank[previous.rarity], `${previous.name} sorts after ${entry.name}`)
        .toBeLessThanOrEqual(rank[entry.rarity]);
    }
  });

  it('names a section after the faction whose runs draft it', () => {
    const pennant = items().find(e => e.id === 'butchers_pennant')!;
    expect(itemSectionOf(pennant)).toBe('Barbarian artifacts');
    expect(itemSectionOf(items().find(e => e.id === 'banner_of_the_first_raid')!))
      .toBe('Starting artifacts');
    expect(itemSectionOf(items().find(e => e.id === 'blade_of_the_vanguard')!))
      .toBe('Legacy artifacts');
  });
});

describe('filters are total: every field always holds a real value', () => {
  it('reads a filterless query string as ALL rather than as nothing', () => {
    expect(filtersFrom(new URLSearchParams())).toEqual({
      faction: ALL, tier: ALL, rarity: ALL, search: '',
    });
  });

  it('reads each filter back off the query string', () => {
    const active = filtersFrom(new URLSearchParams('faction=knight&tier=7&rarity=epic'));
    expect(active).toEqual({ faction: 'knight', tier: 7, rarity: 'epic', search: '' });
  });

  it('falls back to ALL for values that are not real filters', () => {
    // A hand-edited or stale URL must show everything, never silently nothing.
    const active = filtersFrom(new URLSearchParams('faction=goblin&tier=99&rarity=mythic'));
    expect(active).toEqual({ faction: ALL, tier: ALL, rarity: ALL, search: '' });
    expect(entriesOfKind('unit').filter(e => matchesFilters(e, active))).toHaveLength(
      entriesOfKind('unit').length,
    );
  });

  it('drops junk filters from the links it builds rather than carrying them', () => {
    const url = new URL(
      entryHrefFrom(new URLSearchParams('faction=goblin&tier=99'), 'unit', 'champion'),
      'https://example.test',
    );
    expect(url.searchParams.get('faction')).toBeNull();
    expect(url.searchParams.get('tier')).toBeNull();
  });

  it('matches everything when nothing is filtered', () => {
    for (const kind of ENTRY_KINDS) {
      for (const entry of entriesOfKind(kind)) expect(matchesFilters(entry, filters())).toBe(true);
    }
  });
});

describe('links keep the browsing context', () => {
  const params = (q: string) => new URLSearchParams(q);

  it('carries the active filters onto the entry you pick', () => {
    const href = entryHrefFrom(params('tab=units&faction=knight'), 'unit', 'champion');
    const url = new URL(href, 'https://example.test');
    expect(url.searchParams.get('faction')).toBe('knight');
    expect(url.searchParams.get('entry')).toBe('champion');
  });

  it('carries several filters at once', () => {
    const url = new URL(
      entryHrefFrom(params('faction=knight&tier=7'), 'unit', 'champion'),
      'https://example.test',
    );
    expect(url.searchParams.get('faction')).toBe('knight');
    expect(url.searchParams.get('tier')).toBe('7');
  });

  it('drops a filter that would hide where the link goes', () => {
    // Following a shared ability out of the Knight roster should land on the
    // Ranger unit, not on a grid that excludes it.
    const url = new URL(
      entryHrefFrom(params('faction=knight'), 'unit', 'pegasus'),
      'https://example.test',
    );
    expect(url.searchParams.get('faction')).toBeNull();
    expect(url.searchParams.get('entry')).toBe('pegasus');
  });

  it('keeps a filter that does not apply to the destination kind', () => {
    const url = new URL(entryHrefFrom(params('tier=7'), 'item', 'aegis_charm'), 'https://example.test');
    expect(url.searchParams.get('tier')).toBe('7');
  });

  it('never emits a link whose own filters would hide its entry', () => {
    for (const kind of ENTRY_KINDS) {
      for (const entry of entriesOfKind(kind)) {
        const url = new URL(
          entryHrefFrom(params('faction=knight&tier=7'), kind, entry.id),
          'https://example.test',
        );
        expect(
          matchesFilters(entry, filtersFrom(url.searchParams)),
          `${kind}/${entry.id} would be hidden`,
        ).toBe(true);
      }
    }
  });

  it('carries filters across tabs but drops the selected entry', () => {
    const url = new URL(
      tabHrefFrom(params('tab=units&faction=knight&tier=7&entry=champion'), 'item'),
      'https://example.test',
    );
    expect(url.searchParams.get('faction')).toBe('knight');
    expect(url.searchParams.get('tier')).toBe('7');
    expect(url.searchParams.get('entry')).toBeNull();
    expect(kindOfTab(url.searchParams.get('tab'))).toBe('item');
  });

  it('leaves in-game links unfiltered — they have no browsing context', () => {
    const url = new URL(entryHref('unit', 'champion'), 'https://example.test');
    expect(url.searchParams.get('faction')).toBeNull();
    expect(url.searchParams.get('tier')).toBeNull();
  });
});

describe('kind labels', () => {
  it('gives every kind a distinct tab slug', () => {
    const tabs = ENTRY_KINDS.map((k: EntryKind) => TAB_OF[k]);
    expect(new Set(tabs).size).toBe(tabs.length);
  });
});
