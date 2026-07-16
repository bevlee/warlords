// Unit catalog: adapter over FACTION_UNITS giving every unit a stable
// {slug, faction, tier} identity and a full uniform Stats block. Faction
// files stay untouched; the original UnitDef fields remain on each entry.

import type { FactionClass, UnitDef } from './types';
import { FACTION_UNITS } from './factions';

export type Faction = FactionClass;

/** Uniform stat schema: every field present on every unit, zeroed where unused. */
export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  initiative: number;
  minDamage: number;
  maxDamage: number;
  shots: number;
  range: number;
  mana: number;
}

export interface CatalogUnit extends UnitDef {
  slug: string;
  faction: Faction;
  base: Stats;
}

/**
 * Kebab-case slug for a unit name — the key used for sprite sheets and
 * persistence records. Single source of truth; sprites.ts re-exports it.
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function toCatalogUnit(def: UnitDef, faction: Faction): CatalogUnit {
  // UnitDef may not declare every uniform stat (e.g. mana); default to 0.
  const d = def as UnitDef & Partial<Stats>;
  return {
    ...def,
    slug: slugify(def.name),
    faction,
    base: {
      hp: d.hp ?? 0,
      attack: d.attack ?? 0,
      defense: d.defense ?? 0,
      speed: d.speed ?? 0,
      initiative: d.initiative ?? 0,
      minDamage: d.minDamage ?? 0,
      maxDamage: d.maxDamage ?? 0,
      shots: d.shots ?? 0,
      range: d.range ?? 0,
      mana: d.mana ?? 0,
    },
  };
}

export const CATALOG: CatalogUnit[] = (
  Object.entries(FACTION_UNITS) as [Faction, UnitDef[]][]
).flatMap(([faction, units]) => units.map((def) => toCatalogUnit(def, faction)));

const BY_SLUG = new Map(CATALOG.map((u) => [u.slug, u]));

export function unitBySlug(slug: string): CatalogUnit | undefined {
  return BY_SLUG.get(slug);
}
