import type { ArmySlot, Hero, UnitDef } from './types';

export const MAX_AUGMENTS_PER_UNIT = 2;

type StatKey = 'hp' | 'attack' | 'defense' | 'minDamage' | 'maxDamage' | 'speed' | 'initiative' | 'shots';

export interface AugmentDef {
  id: string;
  name: string;
  description: string;
  /** Flat stat deltas applied onto the base UnitDef. */
  stats?: Partial<Record<StatKey, number>>;
  /** Percentage of the unit's *base* hp, resolved to a flat rounded delta. */
  hpPct?: number;
  /** Ability id appended to definition.abilities (deduped). */
  grantsAbility?: string;
  /** Eligibility restrictions; undefined = any unit. */
  requires?: { shooter?: boolean; melee?: boolean; maxTier?: number };
}

export const AUGMENTS: Record<string, AugmentDef> = {
  veterancy: {
    id: 'veterancy', name: 'Veterancy', description: '+2 attack',
    stats: { attack: 2 },
  },
  plating: {
    id: 'plating', name: 'Plating', description: '+2 defense, +15% HP',
    stats: { defense: 2 }, hpPct: 0.15,
  },
  fleetfoot: {
    id: 'fleetfoot', name: 'Fleet of Foot', description: '+1 speed',
    stats: { speed: 1 },
  },
  keen_edge: {
    id: 'keen_edge', name: 'Keen Edge', description: '+1 min and max damage',
    stats: { minDamage: 1, maxDamage: 1 },
  },
  drilled: {
    id: 'drilled', name: 'Drilled', description: '+1 initiative',
    stats: { initiative: 1 },
  },
  deep_quiver: {
    id: 'deep_quiver', name: 'Deep Quiver', description: '+4 shots',
    stats: { shots: 4 }, requires: { shooter: true },
  },
  savagery: {
    id: 'savagery', name: 'Savagery', description: 'Attacks are never retaliated',
    grantsAbility: 'no_retaliation', requires: { maxTier: 3 },
  },
  war_pinions: {
    id: 'war_pinions', name: 'War Pinions', description: 'Gains flight',
    grantsAbility: 'flying', requires: { melee: true, maxTier: 4 },
  },
};

/** Augments this unit could still take, given what it already owns. */
export function availableAugments(unit: UnitDef, owned: string[]): AugmentDef[] {
  if (owned.length >= MAX_AUGMENTS_PER_UNIT) return [];
  return Object.values(AUGMENTS).filter(a => {
    if (owned.includes(a.id)) return false;
    const r = a.requires;
    if (r?.shooter && unit.shots === 0) return false;
    if (r?.melee && unit.shots > 0) return false;
    if (r?.maxTier !== undefined && unit.tier > r.maxTier) return false;
    if (a.grantsAbility && unit.abilities.includes(a.grantsAbility)) return false;
    return true;
  });
}

/**
 * Pure transform of a base definition. Everything downstream — initBattle's
 * hp/shotsLeft seeding, damage rolls, ability procs, UnitInfo — reads the
 * embedded UnitDef, so no engine changes are needed beyond this.
 */
export function augmentedDef(base: UnitDef, ids: string[]): UnitDef {
  if (ids.length === 0) return base;
  const def: UnitDef = { ...base, abilities: [...base.abilities], augmented: true };
  for (const id of ids) {
    const a = AUGMENTS[id];
    if (!a) continue;
    for (const [key, delta] of Object.entries(a.stats ?? {})) {
      (def as unknown as Record<StatKey, number>)[key as StatKey] += delta;
    }
    if (a.hpPct) def.hp += Math.round(base.hp * a.hpPct);
    if (a.grantsAbility && !def.abilities.includes(a.grantsAbility)) {
      def.abilities.push(a.grantsAbility);
    }
  }
  return def;
}

/** Applies the hero's per-unit-type augments to an army before initBattle. */
export function applyAugmentsToArmy(army: ArmySlot[], hero: Hero): ArmySlot[] {
  return army.map(s => {
    const ids = hero.unitAugments?.[s.unit.name] ?? [];
    return ids.length ? { ...s, unit: augmentedDef(s.unit, ids) } : s;
  });
}
