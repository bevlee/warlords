import { describe, it, expect } from 'vitest';
import { parseKeywords, stripKeywords, findKeyword, keywordTokens, keywordBlurb } from '../keywords';
import { entriesOfKind, ENTRY_KINDS } from '../entries';
import { ITEMS, ITEM_IDS } from '../../gauntlet/items';
import { UNIT_SKILLS, SKILL_IDS } from '../../gauntlet/skills';
import { ABILITY_INFO } from '../../ui/abilities';
import { FACTION_SKILL_DEFS } from '../../engine/factionSkills';
import { FACTION_INFO } from '../../engine/factions';

const text = (segments: ReturnType<typeof parseKeywords>) =>
  segments.map(s => (s.kind === 'text' ? s.text : `<${s.entryKind}:${s.id}=${s.label}>`)).join('');

describe('parsing markup', () => {
  it('passes plain text through as a single run', () => {
    expect(parseKeywords('Burn ticks deal double damage.')).toEqual([
      { kind: 'text', text: 'Burn ticks deal double damage.' },
    ]);
  });

  it('resolves a bare id to the entry name', () => {
    const [segment] = parseKeywords('[[butchers_pennant]]');
    expect(segment).toEqual({ kind: 'keyword', entryKind: 'item', id: 'butchers_pennant', label: "Butcher's Pennant" });
  });

  it('shows the display half when one is given', () => {
    expect(text(parseKeywords('A kill on an [[banner_of_the_first_raid|empowered]] turn.')))
      .toBe('A kill on an <item:banner_of_the_first_raid=empowered> turn.');
  });

  it('keeps the text either side of a marker', () => {
    const segments = parseKeywords('before [[bloodletter_axe]] after');
    expect(segments[0]).toEqual({ kind: 'text', text: 'before ' });
    expect(segments[2]).toEqual({ kind: 'text', text: ' after' });
  });

  it('handles several markers in one line', () => {
    expect(text(parseKeywords('[[powder_keg]] and [[blood_chalice]]')))
      .toBe('<item:powder_keg=Powder Keg> and <item:blood_chalice=Blood Chalice>');
  });
});

describe('resolving a marker to an entry', () => {
  it('prefers the ability when a bare id is shared across kinds', () => {
    // A gauntlet skill deliberately shares its id with the ability it grants.
    const shared = SKILL_IDS.filter(id => id in ABILITY_INFO);
    expect(shared.length).toBeGreaterThan(0);
    for (const id of shared) expect(findKeyword(id)?.entryKind).toBe('ability');
  });

  it('takes an explicit kind over the resolution order', () => {
    const id = SKILL_IDS.find(skill => skill in ABILITY_INFO)!;
    expect(findKeyword(`unitSkill:${id}`)?.entryKind).toBe('unitSkill');
    expect(findKeyword(`ability:${id}`)?.entryKind).toBe('ability');
  });

  it('reaches every kind of entry', () => {
    for (const kind of ENTRY_KINDS) {
      const entry = entriesOfKind(kind)[0];
      expect(findKeyword(`${kind}:${entry.id}`)?.id, `${kind} unreachable`).toBe(entry.id);
    }
  });

  it('gives every entry a blurb', () => {
    for (const kind of ENTRY_KINDS) {
      for (const entry of entriesOfKind(kind)) {
        expect(keywordBlurb(entry), `${kind}/${entry.id} has no blurb`).toBeTruthy();
      }
    }
  });

  it('does not resolve an id that no entry has', () => {
    expect(findKeyword('sword_of_nothing')).toBeUndefined();
    expect(findKeyword('item:sword_of_nothing')).toBeUndefined();
  });
});

describe('a marker that cannot be resolved', () => {
  // A stale id must never reach a player as raw brackets. The guard test below
  // is what stops it reaching them at all.
  it('degrades to its display text', () => {
    expect(parseKeywords('the [[no_such_thing|Old Name]] rule')).toEqual([
      { kind: 'text', text: 'the Old Name rule' },
    ]);
  });

  it('degrades to its id when it has no display text', () => {
    expect(parseKeywords('[[no_such_thing]]')).toEqual([{ kind: 'text', text: 'no_such_thing' }]);
  });

  it('leaves one merged run rather than three touching ones', () => {
    expect(parseKeywords('a [[nope]] b')).toHaveLength(1);
  });
});

describe('flattening for plain-text contexts', () => {
  it('leaves no brackets behind', () => {
    expect(stripKeywords('A kill on an [[banner_of_the_first_raid|empowered]] turn.'))
      .toBe('A kill on an empowered turn.');
  });

  it('uses the entry name when the marker has no display text', () => {
    expect(stripKeywords('See [[butchers_pennant]].')).toBe("See Butcher's Pennant.");
  });

  it('never leaves markup in any description the game ships', () => {
    const every = [
      ...ITEM_IDS.map(id => ITEMS[id].description),
      ...Object.values(ABILITY_INFO).map(info => info.description),
      ...SKILL_IDS.map(id => UNIT_SKILLS[id].description),
      ...Object.values(FACTION_SKILL_DEFS).flatMap(defs => defs.map(def => def.description)),
      ...Object.values(FACTION_INFO).map(info => info.description),
    ];
    for (const description of every) {
      expect(stripKeywords(description)).not.toMatch(/\[\[|\]\]/);
    }
  });
});

// The test that keeps markup alive. Rename an entry id and this names the
// lines to fix, rather than a player finding the word turned back into prose.
describe('every marker the game ships resolves', () => {
  const sources: Array<{ where: string; text: string }> = [
    ...ITEM_IDS.map(id => ({ where: `item ${id}`, text: ITEMS[id].description })),
    ...Object.entries(ABILITY_INFO).map(([id, info]) => ({ where: `ability ${id}`, text: info.description })),
    ...SKILL_IDS.map(id => ({ where: `gauntlet skill ${id}`, text: UNIT_SKILLS[id].description })),
    ...Object.entries(FACTION_SKILL_DEFS).flatMap(([faction, defs]) =>
      defs.map(def => ({ where: `${faction} skill ${def.id}`, text: def.description })),
    ),
    ...Object.entries(FACTION_INFO).map(([id, info]) => ({ where: `faction ${id}`, text: info.description })),
  ];

  it('points every marker at an entry that exists', () => {
    const broken = sources.flatMap(source =>
      keywordTokens(source.text)
        .filter(token => !findKeyword(token))
        .map(token => `${source.where}: [[${token}]]`),
    );
    expect(broken).toEqual([]);
  });

  it('has something to check', () => {
    expect(sources.length).toBeGreaterThan(200);
  });
});
