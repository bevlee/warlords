import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONCEPTS, CONCEPT_IDS } from '../concepts';
import { entriesOfKind } from '../entries';
import { findKeyword, keywordTokens, stripKeywords } from '../keywords';

const SRC = new URL('../../', import.meta.url).pathname;
const read = (rel: string) => readFileSync(SRC + rel, 'utf8');

describe('glossary terms', () => {
  it('gives every concept an entry you can reach', () => {
    const entries = entriesOfKind('concept');
    expect(entries.map(e => e.id).sort()).toEqual([...CONCEPT_IDS].sort());
    for (const id of CONCEPT_IDS) expect(findKeyword(id)?.entryKind, id).toBe('concept');
  });

  it('resolves every marker used inside a concept description', () => {
    for (const concept of CONCEPTS) {
      for (const token of keywordTokens(concept.description)) {
        expect(findKeyword(token), `${concept.id} points at missing ${token}`).toBeDefined();
      }
    }
  });

  it('keeps each definition short enough for a hover card', () => {
    for (const concept of CONCEPTS) {
      expect(stripKeywords(concept.description).length, `${concept.name} is too long to hover`)
        .toBeLessThan(320);
    }
  });
});

/**
 * ATB is the term this file exists for. It is precise and fits a chip, but it
 * is meaningless until hovered — so every use has to be marked up. Two branches
 * once wrote ATB text in the same week, one translating it and one not, and
 * nothing caught the split.
 */
describe('ATB is always a linked term', () => {
  const FILES = [
    'ui/abilities.ts',
    'ui/heroActionDisplay.ts',
    'gauntlet/items.ts',
    'gauntlet/skills.ts',
    'engine/factionSkills.ts',
    'ui/unitEffects.ts',
  ];

  it('never writes bare ATB in player-facing text', () => {
    const bare: string[] = [];
    for (const file of FILES) {
      for (const [i, line] of read(file).split('\n').entries()) {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        // Marked-up uses read as [[atb]]; a bare "ATB" is the drift we're catching.
        if (/\bATB\b/.test(line)) bare.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(bare).toEqual([]);
  });
});
