import { describe, it, expect } from 'vitest';
import {
  ENTRY_KINDS,
  TAB_OF,
  entriesOfKind,
  entryHref,
  entryHrefFrom,
  factionSkillId,
  findEntry,
  kindOfTab,
  matchesFilters,
  spellEntries,
  tabHrefFrom,
  type EntryKind,
} from '../entries';
import { CATALOG } from '../../engine/catalog';
import { FACTION_UNITS, FACTION_INFO } from '../../engine/factions';
import { FACTION_SKILL_DEFS } from '../../engine/factionSkills';
import { ABILITY_INFO } from '../../ui/abilities';
import { ITEM_IDS } from '../../gauntlet/items';
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

    const expected = Object.entries(FACTION_SKILL_DEFS).flatMap(([faction, defs]) =>
      defs.map(d => factionSkillId(faction as FactionClass, d.id)),
    );
    expect(entriesOfKind('factionSkill').map(e => e.id).sort()).toEqual(expected.sort());
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

  it('keeps faction skills apart when factions define the same skill differently', () => {
    const skills = entriesOfKind('factionSkill');
    const barbarian = skills.find(e => e.id === factionSkillId('barbarian', 'armorer'));
    const knight = skills.find(e => e.id === factionSkillId('knight', 'armorer'));
    expect(barbarian?.kind === 'factionSkill' && barbarian.description).toContain('3/6/9');
    expect(knight?.kind === 'factionSkill' && knight.description).toContain('5/10/15');
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

describe('filters', () => {
  const unit = (slug: string) => entriesOfKind('unit').find(e => e.id === slug)!;

  it('applies a tier filter only to units, so other tabs are not emptied', () => {
    expect(matchesFilters(unit('champion'), { tier: 7 })).toBe(true);
    expect(matchesFilters(unit('champion'), { tier: 3 })).toBe(false);
    // An item has no tier; a stale tier filter must not hide it.
    expect(matchesFilters(entriesOfKind('item')[0], { tier: 3 })).toBe(true);
    expect(entriesOfKind('item').filter(e => matchesFilters(e, { tier: 3 }))).toHaveLength(
      entriesOfKind('item').length,
    );
  });

  it('applies a faction filter only to entries that have a faction', () => {
    expect(matchesFilters(unit('champion'), { faction: 'knight' })).toBe(true);
    expect(matchesFilters(unit('champion'), { faction: 'demon' })).toBe(false);
    expect(matchesFilters(entriesOfKind('spell')[0], { faction: 'demon' })).toBe(true);
  });

  it('matches names case-insensitively and ignores blank search', () => {
    expect(matchesFilters(unit('champion'), { search: 'CHAMP' })).toBe(true);
    expect(matchesFilters(unit('champion'), { search: '  ' })).toBe(true);
    expect(matchesFilters(unit('champion'), { search: 'goblin' })).toBe(false);
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
        const applied = {
          faction: url.searchParams.get('faction'),
          tier: Number(url.searchParams.get('tier')) || null,
        };
        expect(matchesFilters(entry, applied), `${kind}/${entry.id} would be hidden`).toBe(true);
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
