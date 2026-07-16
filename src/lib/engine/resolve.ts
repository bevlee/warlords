// Base + modifier unit model. Modifiers are run-scoped (nothing in-run is
// permanent); the only cross-run source is the gacha level, recomputed from
// the collection at run start. resolve() is pure and order-independent:
// per stat, (base + Σflat) × (1 + Σpct), rounded.

import type { CatalogUnit, Stats } from './catalog';

export interface UnitModifier {
  /** provenance, e.g. 'gacha:silver' or 'gauntlet:node-4-reward' */
  source: string;
  flat?: Partial<Stats>;
  pct?: Partial<Stats>;
  grants?: string[];
}

export interface UnitInstance {
  slug: string;
  modifiers: UnitModifier[];
}

export interface ResolvedUnit {
  stats: Stats;
  abilities: string[];
}

export function resolve(def: CatalogUnit, modifiers: UnitModifier[]): ResolvedUnit {
  const stats = { ...def.base };
  for (const k of Object.keys(stats) as (keyof Stats)[]) {
    const flat = modifiers.reduce((a, m) => a + (m.flat?.[k] ?? 0), 0);
    const pct = modifiers.reduce((a, m) => a + (m.pct?.[k] ?? 0), 0);
    stats[k] = Math.round((def.base[k] + flat) * (1 + pct));
  }
  const abilities = [...new Set([...def.abilities, ...modifiers.flatMap((m) => m.grants ?? [])])];
  return { stats, abilities };
}
