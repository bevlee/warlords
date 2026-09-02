// Keyword markup: the bridge between a line of effect text and the compendium
// entry that defines the terms in it.
//
// Descriptions carry `[[…]]` markers naming an entry. The UI renders them as
// hoverable terms; anywhere that can only hold a plain string flattens them
// instead. Markup is explicit rather than auto-matched because prose almost
// never contains a term's exact name — Butcher's Pennant says "empowered", and
// the thing it means is called "Banner of the First Raid".

import { ENTRY_KINDS, STATIC_ENTRIES, spellEntries, type CompendiumEntry, type EntryKind } from './entries';

/** A run of a parsed description: either literal text or a resolved term. */
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'keyword'; entryKind: EntryKind; id: string; label: string };

/**
 * Which kind a bare `[[id]]` means. Ids are unique within a kind but not
 * across kinds — a gauntlet skill deliberately shares its id with the ability
 * it grants — so an unqualified marker needs a documented winner. Abilities
 * lead because that is what a rules sentence nearly always means; write
 * `[[unitSkill:focus]]` for the draft card.
 */
const RESOLUTION_ORDER: EntryKind[] = ['ability', 'item', 'unit', 'spell', 'factionSkill', 'faction', 'unitSkill'];

/** The one-line definition a popup shows. Not the same as a grid card's
 *  subtitle: a card answers "which one is this in a list", a popup answers
 *  "what does this word mean". */
export function keywordBlurb(entry: CompendiumEntry): string {
  switch (entry.kind) {
    case 'unit':
      return `Tier ${entry.tier} · ${entry.unit.base.hp} HP · ${entry.unit.base.minDamage}–${entry.unit.base.maxDamage} dmg`;
    case 'item':
      return entry.effect;
    case 'spell':
      return `${entry.manaCost} mana · ${entry.effect}`;
    case 'faction':
    case 'ability':
    case 'factionSkill':
    case 'unitSkill':
      return entry.description;
  }
}

export interface KeywordTarget {
  entryKind: EntryKind;
  id: string;
  name: string;
  blurb: string;
}

/** Every entry, keyed by kind and id. Spells are included at the sample hero
 *  level: a popup explains what a spell is, not what it hits for tonight. */
const REGISTRY: Map<string, KeywordTarget> = new Map(
  [...STATIC_ENTRIES, ...spellEntries()].map((entry) => [
    `${entry.kind}:${entry.id}`,
    { entryKind: entry.kind, id: entry.id, name: entry.name, blurb: keywordBlurb(entry) },
  ]),
);

const KIND_NAMES = new Set<string>(ENTRY_KINDS);

/** Resolve a marker's target half — `id` or `kind:id`. */
export function findKeyword(token: string): KeywordTarget | undefined {
  const [head, ...rest] = token.split(':');
  if (rest.length > 0 && KIND_NAMES.has(head)) return REGISTRY.get(`${head}:${rest.join(':')}`);
  for (const kind of RESOLUTION_ORDER) {
    const found = REGISTRY.get(`${kind}:${token}`);
    if (found) return found;
  }
  return undefined;
}

const MARKER = /\[\[([^\]]+)\]\]/g;

/** Split a marker's body into its target and the words to show for it. */
function markerParts(body: string): { token: string; label: string | null } {
  const pipe = body.indexOf('|');
  if (pipe === -1) return { token: body.trim(), label: null };
  return { token: body.slice(0, pipe).trim(), label: body.slice(pipe + 1).trim() };
}

// Descriptions are static and the battle screen re-renders constantly, so the
// same forty strings would otherwise be re-parsed every frame.
const parseCache = new Map<string, Segment[]>();
const stripCache = new Map<string, string>();

/**
 * A description split into literal text and resolved terms.
 *
 * A marker naming an entry that does not exist degrades to plain text showing
 * its label — a stale id reads as ordinary prose rather than raw brackets, so a
 * bad rename is never visible to a player. The test suite fails on it instead.
 */
export function parseKeywords(text: string): Segment[] {
  const cached = parseCache.get(text);
  if (cached) return cached;

  const segments: Segment[] = [];
  let cursor = 0;
  const push = (literal: string) => {
    if (!literal) return;
    const last = segments.at(-1);
    // Merge with the run before it, so an unresolved marker leaves one text
    // segment rather than three touching ones.
    if (last?.kind === 'text') last.text += literal;
    else segments.push({ kind: 'text', text: literal });
  };

  for (const match of text.matchAll(MARKER)) {
    push(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const { token, label } = markerParts(match[1]);
    const target = findKeyword(token);
    if (target) segments.push({ kind: 'keyword', entryKind: target.entryKind, id: target.id, label: label ?? target.name });
    else push(label ?? token);
  }
  push(text.slice(cursor));

  parseCache.set(text, segments);
  return segments;
}

/** The same text with every marker flattened to the words it shows. For the
 *  places that can only hold a string — `title` attributes, aria-labels, and
 *  single-line truncated card subtitles. */
export function stripKeywords(text: string): string {
  const cached = stripCache.get(text);
  if (cached !== undefined) return cached;
  const flat = parseKeywords(text)
    .map((segment) => (segment.kind === 'text' ? segment.text : segment.label))
    .join('');
  stripCache.set(text, flat);
  return flat;
}

/** Every marker in a string, resolved or not — the test suite's way in. */
export function keywordTokens(text: string): string[] {
  return [...text.matchAll(MARKER)].map((match) => markerParts(match[1]).token);
}
