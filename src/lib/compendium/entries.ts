// Compendium entry model: a uniform, browsable view over data that already
// exists elsewhere in the engine and the gauntlet. This module aggregates —
// it never restates a fact. A unit's damage is read from CatalogUnit.base, an
// item's effect line from itemEffectText(). Adding a unit to demon.ts makes it
// appear here with no further edits, and the tests enforce that.

import type { FactionClass, SpellId, UnitDef } from '../engine/types';
import { CATALOG, type CatalogUnit } from '../engine/catalog';
import { FACTION_INFO } from '../engine/factions';
import { UNIT_COSTS } from '../engine/recruit';
import { SPELLS, lightningDamage } from '../engine/battle';
import { abilityLevel } from '../engine/abilityCatalog';
import { ABILITY_INFO, abilityInfo } from '../ui/abilities';
import { SPELL_META } from '../ui/logLines';
import { ITEMS, ITEM_IDS, itemEffectText, type ItemRarity } from '../gauntlet/items';
import { UNIT_SKILLS, SKILL_IDS, type SkillId } from '../gauntlet/skills';
import { CONCEPTS } from './concepts';

export const ENTRY_KINDS = [
  'unit',
  'faction',
  'ability',
  'spell',
  'item',
  'unitSkill',
  'concept',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

/** URL slug per kind — the `?tab=` value. Reads better than the bare kind. */
export const TAB_OF: Record<EntryKind, string> = {
  unit: 'units',
  faction: 'factions',
  ability: 'abilities',
  spell: 'spells',
  item: 'items',
  unitSkill: 'gauntlet-skills',
  concept: 'glossary',
};

/** Tab heading per kind, in ENTRY_KINDS order. */
export const KIND_LABEL: Record<EntryKind, string> = {
  unit: 'Units',
  faction: 'Factions',
  ability: 'Abilities',
  spell: 'Spells',
  // The engine, the battle HUD, and the players all say "artifact"; only this
  // tab said "Items". The URL slug stays `items` so old links keep working.
  item: 'Artifacts',
  unitSkill: 'Gauntlet skills',
  concept: 'Glossary',
};

/** Singular name for one entry of a kind, for places that talk about a single
 *  term rather than heading a list of them. */
export const KIND_TERM: Record<EntryKind, string> = {
  unit: 'Unit',
  faction: 'Faction',
  ability: 'Ability',
  spell: 'Spell',
  item: 'Artifact',
  unitSkill: 'Gauntlet skill',
  concept: 'Term',
};

const KIND_OF_TAB = new Map(
  (Object.entries(TAB_OF) as [EntryKind, string][]).map(([kind, tab]) => [tab, kind]),
);

export function kindOfTab(tab: string | null): EntryKind {
  return (tab && KIND_OF_TAB.get(tab)) || 'unit';
}

/** Canonical URL for an entry, with no filters. Used by links from elsewhere in
 *  the game, which have no browsing context to preserve. The page derives its
 *  whole state from the query string, so a plain <a href> gives in-place panel
 *  swaps, working back/forward, and cmd-click-to-new-tab with no extra handling. */
export function entryHref(kind: EntryKind, id: string): string {
  return `/compendium?tab=${TAB_OF[kind]}&entry=${encodeURIComponent(id)}`;
}

/** Every faction an entry can belong to, plus Neutral for the ones that belong
 *  to none — today, the legacy stat artifacts. */
export type EntryFaction = FactionClass | 'neutral';
export type EntryTier = UnitDef['tier'];

/** A filter that is deliberately not filtering. An absent filter and a filter
 *  set to "everything" were always the same state; naming it means no filter
 *  value is ever null, and every call site is total. */
export const ALL = 'all';
type All = typeof ALL;

/** Grid filters. Every field is present and non-null — `ALL` is the value that
 *  means "don't narrow on this", and an empty search means "don't search". */
export interface EntryFilters {
  faction: EntryFaction | All;
  tier: EntryTier | All;
  rarity: ItemRarity | All;
  search: string;
}

export const NO_FILTERS: EntryFilters = { faction: ALL, tier: ALL, rarity: ALL, search: '' };

/** Terse construction for the cases that care about one field. */
export const filters = (some: Partial<EntryFilters> = {}): EntryFilters => ({ ...NO_FILTERS, ...some });

export const FACTION_FILTERS: EntryFaction[] = [
  ...(Object.keys(FACTION_INFO) as FactionClass[]),
  'neutral',
];
export const TIER_FILTERS: EntryTier[] = [1, 2, 3, 4, 5, 6, 7];
export const RARITY_FILTERS: ItemRarity[] = ['common', 'rare', 'epic'];

/** Display name for a faction value, including the one that is not a faction. */
export const factionLabel = (faction: EntryFaction): string =>
  faction === 'neutral' ? 'Neutral' : FACTION_INFO[faction].name;

/**
 * The single filter predicate, shared by the grid and by link building — so a
 * link can never send you to an entry the grid would then hide.
 *
 * A filter only applies to kinds it means something for: tier is a unit
 * concept, rarity an item one, and faction belongs to units, factions, faction
 * skills, and items. Applying them blindly would empty the Artifacts tab the
 * moment a tier was selected. A kind that has no faction at all — spells,
 * gauntlet skills — carries no `faction` field, which is what exempts it; that
 * is different from an entry whose faction is Neutral.
 */
export function matchesFilters(entry: CompendiumEntry, active: EntryFilters): boolean {
  const search = active.search.trim().toLowerCase();
  if (search && !entry.name.toLowerCase().includes(search)) return false;
  if (active.faction !== ALL && 'faction' in entry && entry.faction !== active.faction) return false;
  if (active.tier !== ALL && entry.kind === 'unit' && entry.tier !== active.tier) return false;
  if (active.rarity !== ALL && entry.kind === 'item' && entry.rarity !== active.rarity) return false;
  return true;
}

/** Filters that survive navigation from one entry to the next. Search is not
 *  one of them: it is transient typing, not a browsing mode. */
const STICKY_FILTERS = ['faction', 'tier', 'rarity'] as const;
type StickyFilter = (typeof STICKY_FILTERS)[number];

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | All =>
  allowed.includes(value as T) ? (value as T) : ALL;

/**
 * The query string, read into a complete set of filters. Anything unrecognised
 * — a hand-edited `?tier=99`, a faction that no longer exists — reads back as
 * ALL rather than as a filter that quietly matches nothing. Search is not in
 * the URL; the page holds it and spreads it over the result.
 */
export function filtersFrom(params: URLSearchParams): EntryFilters {
  const tier = Number(params.get('tier'));
  return {
    faction: oneOf(params.get('faction'), FACTION_FILTERS),
    tier: TIER_FILTERS.includes(tier as EntryTier) ? (tier as EntryTier) : ALL,
    rarity: oneOf(params.get('rarity'), RARITY_FILTERS),
    search: '',
  };
}

/** The active set narrowed to a single field, to ask whether that one filter
 *  alone would hide an entry. */
function onlyFilter(key: StickyFilter, active: EntryFilters): EntryFilters {
  if (key === 'faction') return filters({ faction: active.faction });
  if (key === 'tier') return filters({ tier: active.tier });
  return filters({ rarity: active.rarity });
}

/**
 * URL for an entry that keeps the filters currently in force, so picking a
 * Knight while filtered to Knight leaves the list filtered.
 *
 * A filter that would hide the destination is dropped instead — following a
 * cross-reference out of the current faction (a shared ability, say) should
 * take you there rather than to a grid that excludes it.
 */
export function entryHrefFrom(
  params: URLSearchParams,
  kind: EntryKind,
  id: string,
  heroLevel = SAMPLE_HERO_LEVEL,
): string {
  const next = new URLSearchParams({ tab: TAB_OF[kind], entry: id });
  const target = findEntry(kind, id, heroLevel);
  const active = filtersFrom(params);
  for (const key of STICKY_FILTERS) {
    if (active[key] === ALL) continue;
    if (target && !matchesFilters(target, onlyFilter(key, active))) continue;
    next.set(key, String(active[key]));
  }
  return `/compendium?${next}`;
}

/** URL for a tab, carrying the active filters across. They stay in force until
 *  explicitly cleared, and inapplicable ones lie dormant rather than emptying
 *  the list. Any selected entry is dropped — it belongs to the old tab. */
export function tabHrefFrom(params: URLSearchParams, kind: EntryKind): string {
  const next = new URLSearchParams({ tab: TAB_OF[kind] });
  const active = filtersFrom(params);
  for (const key of STICKY_FILTERS) {
    if (active[key] !== ALL) next.set(key, String(active[key]));
  }
  return `/compendium?${next}`;
}

interface BaseEntry {
  kind: EntryKind;
  /** Stable key, unique within its kind. Paired with the kind in the URL. */
  id: string;
  name: string;
}

export interface UnitEntry extends BaseEntry {
  kind: 'unit';
  unit: CatalogUnit;
  faction: FactionClass;
  tier: UnitDef['tier'];
  /** Gold per creature, or null for units with no recruit price (e.g. summons). */
  cost: number | null;
  /** Ability ids, paired with their effective level on this unit. */
  abilities: Array<{ id: string; level: number }>;
}

export interface FactionEntry extends BaseEntry {
  kind: 'faction';
  faction: FactionClass;
  description: string;
  /** Unit-entry ids, tier ascending. */
  roster: string[];
}

export interface AbilityEntry extends BaseEntry {
  kind: 'ability';
  description: string;
  /** Unit-entry ids that have this ability innately. */
  units: string[];
  /** Whether a gauntlet draft can teach it (see UNIT_SKILLS). */
  teachable: boolean;
}

export interface SpellEntry extends BaseEntry {
  kind: 'spell';
  glyph: string;
  manaCost: number;
  target: 'Friendly stack' | 'Enemy stack';
  effect: string;
  description: string;
}

/** How an artifact is obtained — the Items tab's top-level grouping, because
 *  it is the first thing a player needs to know about one. */
export type ItemGroup = 'starter' | 'faction' | 'legacy';

export const ITEM_GROUP_LABEL: Record<ItemGroup, string> = {
  starter: 'Starting artifacts',
  faction: 'Faction artifacts',
  legacy: 'Legacy artifacts',
};

export const ITEM_GROUP_NOTE: Record<ItemGroup, string> = {
  starter: 'Held from the first battle of a run with that faction. Never drafted.',
  faction: 'Offered as a draft choice after a won battle, to that faction only.',
  legacy: 'Flat army-wide stat bonuses from an older draft pool. No longer offered.',
};

export interface ItemEntry extends BaseEntry {
  kind: 'item';
  rarity: ItemRarity;
  effect: string;
  /** The faction whose runs can draft it; Neutral for the legacy stat items,
   *  which belong to no faction. */
  faction: EntryFaction;
  group: ItemGroup;
  /** Unit names that unlock it in a draft; any one of them is enough. Empty
   *  means the whole faction pool can roll it. */
  requiresUnit: string[];
  /** Item id this replaces when drafted, if any. */
  upgrades: string | null;
}

/** A rules word the text leans on — "primary", "retaliation", "ATB". These
 *  have no data behind them in the engine; they exist so the vocabulary has
 *  somewhere to point. */
export interface ConceptEntry extends BaseEntry {
  kind: 'concept';
  description: string;
}

export interface UnitSkillEntry extends BaseEntry {
  kind: 'unitSkill';
  description: string;
  /** Ability-entry id — the same string; a gauntlet skill *is* an engine ability. */
  ability: string;
}

export type CompendiumEntry =
  | UnitEntry
  | FactionEntry
  | AbilityEntry
  | SpellEntry
  | ItemEntry
  | UnitSkillEntry
  | ConceptEntry;

const UNIT_ENTRIES: UnitEntry[] = CATALOG.map((unit) => ({
  kind: 'unit',
  id: unit.slug,
  name: unit.name,
  unit,
  faction: unit.faction,
  tier: unit.tier,
  cost: UNIT_COSTS[unit.name] ?? null,
  abilities: unit.abilities.map((id) => ({ id, level: abilityLevel(unit, id) })),
}));

const FACTION_ENTRIES: FactionEntry[] = (
  Object.entries(FACTION_INFO) as [FactionClass, { name: string; description: string }][]
).map(([faction, info]) => ({
  kind: 'faction',
  id: faction,
  name: info.name,
  faction,
  description: info.description,
  roster: UNIT_ENTRIES.filter((e) => e.faction === faction)
    .sort((a, b) => a.tier - b.tier)
    .map((e) => e.id),
}));

const TEACHABLE = new Set<string>(SKILL_IDS);

const ABILITY_ENTRIES: AbilityEntry[] = Object.keys(ABILITY_INFO).map((id) => ({
  kind: 'ability',
  id,
  // Unleveled label: a unit's own level is shown on its entry, not here.
  name: abilityInfo(id).label,
  description: abilityInfo(id).description,
  units: UNIT_ENTRIES.filter((e) => e.abilities.some((a) => a.id === id)).map((e) => e.id),
  teachable: TEACHABLE.has(id),
}));

/** Hero level used for the spell numbers shown when no hero is loaded. */
export const SAMPLE_HERO_LEVEL = 1;

const SPELL_TEXT: Record<SpellId, { effect: (level: number) => string; description: string }> = {
  lightning: {
    effect: (level) => `${lightningDamage(level)} true damage`,
    description:
      'A bolt of raw lightning strikes one enemy stack. True damage: it ignores attack, ' +
      'defense, and buffs, and draws no retaliation. Scales as 12 + 8 × hero level, and ' +
      'Sorcery raises it further.',
  },
  bloodlust: {
    effect: () => '+4 attack',
    description:
      'Fills a friendly stack with battle fury: +4 attack for the rest of the battle. ' +
      'Casting it again on the same stack adds another +4.',
  },
  stoneskin: {
    effect: () => '+4 defense',
    description:
      'Turns a friendly stack’s skin to granite: +4 defense for the rest of the battle. ' +
      'Casting it again on the same stack adds another +4.',
  },
  slow: {
    effect: () => '−2 Speed and Initiative until the target’s next turn',
    description: 'A temporary control spell.',
  },
  chain_lightning: {
    effect: (level) => `${lightningDamage(level)} magic damage, then two 50% arcs`,
    description: 'Lightning-attribute magic damage.',
  },
  resurrect: {
    effect: (level) => `Heal ${30 + 10 * level} HP`,
    description: 'Restores health and revives creatures.',
  },
  blizzard: {
    effect: (level) => `${lightningDamage(level)} centre / 60% surrounding`,
    description: 'A friendly-fire 3×3 Cold magic spell.',
  },
};

/** Spell entries at a given hero level, so the page can show the player's real
 *  Lightning damage when a hero is loaded. */
export function spellEntries(heroLevel = SAMPLE_HERO_LEVEL): SpellEntry[] {
  return (Object.entries(SPELLS) as [SpellId, { cost: number; friendly: boolean }][]).map(
    ([id, spell]) => ({
      kind: 'spell',
      id,
      name: SPELL_META[id].label,
      glyph: SPELL_META[id].glyph,
      manaCost: spell.cost,
      target: spell.friendly ? 'Friendly stack' : 'Enemy stack',
      effect: SPELL_TEXT[id].effect(heroLevel),
      description: SPELL_TEXT[id].description,
    }),
  );
}

const ITEM_GROUP_ORDER: Record<ItemGroup, number> = { starter: 0, faction: 1, legacy: 2 };
const RARITY_ORDER: Record<ItemRarity, number> = { common: 0, rare: 1, epic: 2 };
/** Faction order follows the roster tabs rather than the alphabet, and
 *  FACTION_FILTERS already ends with Neutral, so the legacy items sort last. */
const factionRank = (faction: EntryFaction): number => FACTION_FILTERS.indexOf(faction);

const itemGroup = (id: string): ItemGroup =>
  ITEMS[id].legacy ? 'legacy' : ITEMS[id].starterForFaction ? 'starter' : 'faction';

/** Sorted so the list reads as a table of contents: how you get it, then whose
 *  it is, then how rare, then by name. The page keeps this order and only
 *  inserts headings, so filtering never reshuffles the rows. */
const ITEM_ENTRIES: ItemEntry[] = ITEM_IDS.map((id): ItemEntry => ({
  kind: 'item',
  id,
  name: ITEMS[id].name,
  rarity: ITEMS[id].rarity,
  effect: itemEffectText(ITEMS[id]),
  faction: ITEMS[id].faction ?? ITEMS[id].starterForFaction ?? 'neutral',
  group: itemGroup(id),
  requiresUnit: ITEMS[id].requiresUnit ?? [],
  upgrades: ITEMS[id].upgrades ?? null,
})).sort((a, b) =>
  ITEM_GROUP_ORDER[a.group] - ITEM_GROUP_ORDER[b.group] ||
  factionRank(a.faction) - factionRank(b.faction) ||
  RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] ||
  a.name.localeCompare(b.name),
);

/** Heading an item sits under in the Items tab. Faction artifacts get one
 *  heading per faction; the other two groups are a single run each. */
export function itemSectionOf(entry: ItemEntry): string {
  return entry.group === 'faction' && entry.faction !== 'neutral'
    ? `${FACTION_INFO[entry.faction].name} artifacts`
    : ITEM_GROUP_LABEL[entry.group];
}

const UNIT_SKILL_ENTRIES: UnitSkillEntry[] = SKILL_IDS.map((id) => ({
  kind: 'unitSkill',
  id,
  name: UNIT_SKILLS[id].name,
  description: UNIT_SKILLS[id].description,
  ability: id,
}));

const CONCEPT_ENTRIES: ConceptEntry[] = CONCEPTS.map((concept) => ({
  kind: 'concept',
  id: concept.id,
  name: concept.name,
  description: concept.description,
}));

/** Every entry except spells, which depend on hero level and are built on demand. */
export const STATIC_ENTRIES: CompendiumEntry[] = [
  ...UNIT_ENTRIES,
  ...FACTION_ENTRIES,
  ...ABILITY_ENTRIES,
  ...ITEM_ENTRIES,
  ...UNIT_SKILL_ENTRIES,
  ...CONCEPT_ENTRIES,
];

export function entriesOfKind(kind: EntryKind, heroLevel = SAMPLE_HERO_LEVEL): CompendiumEntry[] {
  if (kind === 'spell') return spellEntries(heroLevel);
  return STATIC_ENTRIES.filter((e) => e.kind === kind);
}

export function findEntry(
  kind: EntryKind,
  id: string,
  heroLevel = SAMPLE_HERO_LEVEL,
): CompendiumEntry | undefined {
  return entriesOfKind(kind, heroLevel).find((e) => e.id === id);
}

export const unitEntries = (): UnitEntry[] => UNIT_ENTRIES;
export const factionEntries = (): FactionEntry[] => FACTION_ENTRIES;
export const abilityEntries = (): AbilityEntry[] => ABILITY_ENTRIES;
export const itemEntries = (): ItemEntry[] => ITEM_ENTRIES;
export const unitSkillEntries = (): UnitSkillEntry[] => UNIT_SKILL_ENTRIES;
export const conceptEntries = (): ConceptEntry[] => CONCEPT_ENTRIES;
