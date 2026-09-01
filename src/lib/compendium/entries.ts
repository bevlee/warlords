// Compendium entry model: a uniform, browsable view over data that already
// exists elsewhere in the engine and the gauntlet. This module aggregates —
// it never restates a fact. A unit's damage is read from CatalogUnit.base, an
// item's effect line from itemEffectText(). Adding a unit to demon.ts makes it
// appear here with no further edits, and the tests enforce that.

import type { FactionClass, SpellId, UnitDef } from '../engine/types';
import { CATALOG, type CatalogUnit } from '../engine/catalog';
import { FACTION_INFO } from '../engine/factions';
import { UNIT_COSTS } from '../engine/recruit';
import { FACTION_SKILL_DEFS } from '../engine/factionSkills';
import { SPELLS, lightningDamage } from '../engine/battle';
import { abilityLevel } from '../engine/abilityCatalog';
import { ABILITY_INFO, abilityInfo } from '../ui/abilities';
import { SPELL_META } from '../ui/logLines';
import { ITEMS, ITEM_IDS, itemEffectText, type ItemId, type ItemRarity } from '../gauntlet/items';
import { UNIT_SKILLS, SKILL_IDS, type SkillId } from '../gauntlet/skills';

export const ENTRY_KINDS = [
  'unit',
  'faction',
  'ability',
  'spell',
  'factionSkill',
  'item',
  'unitSkill',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

/** URL slug per kind — the `?tab=` value. Reads better than the bare kind. */
export const TAB_OF: Record<EntryKind, string> = {
  unit: 'units',
  faction: 'factions',
  ability: 'abilities',
  spell: 'spells',
  factionSkill: 'faction-skills',
  item: 'items',
  unitSkill: 'gauntlet-skills',
};

/** Tab heading per kind, in ENTRY_KINDS order. */
export const KIND_LABEL: Record<EntryKind, string> = {
  unit: 'Units',
  faction: 'Factions',
  ability: 'Abilities',
  spell: 'Spells',
  factionSkill: 'Faction skills',
  item: 'Items',
  unitSkill: 'Gauntlet skills',
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

/** Grid filters, all optional. Absent or empty means "don't filter on this". */
export interface EntryFilters {
  faction?: string | null;
  tier?: number | null;
  search?: string | null;
}

/**
 * The single filter predicate, shared by the grid and by link building — so a
 * link can never send you to an entry the grid would then hide.
 *
 * A filter only applies to kinds it means something for: tier is a unit
 * concept, faction belongs to units, factions, and faction skills. Applying
 * them blindly would empty the Items tab the moment a tier was selected.
 */
export function matchesFilters(entry: CompendiumEntry, filters: EntryFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search && !entry.name.toLowerCase().includes(search)) return false;
  if (filters.faction && 'faction' in entry && entry.faction !== filters.faction) return false;
  if (filters.tier && entry.kind === 'unit' && entry.tier !== filters.tier) return false;
  return true;
}

/** Filters that survive navigation from one entry to the next. Search is not
 *  one of them: it is transient typing, not a browsing mode. */
const STICKY_FILTERS = ['faction', 'tier'] as const;

function filtersFrom(params: URLSearchParams): EntryFilters {
  return {
    faction: params.get('faction'),
    tier: Number(params.get('tier')) || null,
  };
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
  for (const key of STICKY_FILTERS) {
    const value = params.get(key);
    if (!value) continue;
    const only: EntryFilters = key === 'tier' ? { tier: Number(value) || null } : { faction: value };
    if (target && !matchesFilters(target, only)) continue;
    next.set(key, value);
  }
  return `/compendium?${next}`;
}

/** URL for a tab, carrying the active filters across. They stay in force until
 *  explicitly cleared, and inapplicable ones lie dormant rather than emptying
 *  the list. Any selected entry is dropped — it belongs to the old tab. */
export function tabHrefFrom(params: URLSearchParams, kind: EntryKind): string {
  const next = new URLSearchParams({ tab: TAB_OF[kind] });
  for (const key of STICKY_FILTERS) {
    const value = params.get(key);
    if (value) next.set(key, value);
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
  /** factionSkill-entry ids. */
  skills: string[];
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

export interface FactionSkillEntry extends BaseEntry {
  kind: 'factionSkill';
  faction: FactionClass;
  description: string;
  unlockLevel: number;
}

export interface ItemEntry extends BaseEntry {
  kind: 'item';
  rarity: ItemRarity;
  effect: string;
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
  | FactionSkillEntry
  | ItemEntry
  | UnitSkillEntry;

/** Faction-scoped id: Armorer is +3%/level for Barbarian but +5%/level for
 *  Knight, so the two are genuinely different entries and cannot share a key. */
export const factionSkillId = (faction: FactionClass, skillId: string): string =>
  `${faction}:${skillId}`;

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
  skills: FACTION_SKILL_DEFS[faction].map((s) => factionSkillId(faction, s.id)),
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

const FACTION_SKILL_ENTRIES: FactionSkillEntry[] = (
  Object.entries(FACTION_SKILL_DEFS) as [
    FactionClass,
    Array<{ id: string; name: string; description: string; unlockLevel: number }>,
  ][]
).flatMap(([faction, defs]) =>
  defs.map((def) => ({
    kind: 'factionSkill' as const,
    id: factionSkillId(faction, def.id),
    name: def.name,
    faction,
    description: def.description,
    unlockLevel: def.unlockLevel,
  })),
);

const ITEM_ENTRIES: ItemEntry[] = ITEM_IDS.map((id) => ({
  kind: 'item',
  id,
  name: ITEMS[id].name,
  rarity: ITEMS[id].rarity,
  effect: itemEffectText(ITEMS[id]),
}));

const UNIT_SKILL_ENTRIES: UnitSkillEntry[] = SKILL_IDS.map((id) => ({
  kind: 'unitSkill',
  id,
  name: UNIT_SKILLS[id].name,
  description: UNIT_SKILLS[id].description,
  ability: id,
}));

/** Every entry except spells, which depend on hero level and are built on demand. */
export const STATIC_ENTRIES: CompendiumEntry[] = [
  ...UNIT_ENTRIES,
  ...FACTION_ENTRIES,
  ...ABILITY_ENTRIES,
  ...FACTION_SKILL_ENTRIES,
  ...ITEM_ENTRIES,
  ...UNIT_SKILL_ENTRIES,
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
export const factionSkillEntries = (): FactionSkillEntry[] => FACTION_SKILL_ENTRIES;
