import type { UnitDef } from './types.ts';

export interface AbilityCatalogEntry {
  kind: 'leveled' | 'unique';
  maxLevel: number; // 1 for unique
  /** Level assumed for legacy defs that list the ability without a level. */
  defaultLevel: number;
}

/** Leveled entries only — any id not listed is 'unique' (safe default: new
 *  engine abilities are once-only until deliberately made leveled here).
 *  defaultLevels reproduce the pre-catalog hardcodes exactly: Vampire
 *  life_drain healed 100% of damage (level 10 at 10%/level), Behemoth
 *  defense_reduction was a flat 40% (level 8 at 5%/level). */
export const ABILITY_CATALOG: Record<string, AbilityCatalogEntry> = {
  life_drain:        { kind: 'leveled', maxLevel: 15, defaultLevel: 10 },
  defense_reduction: { kind: 'leveled', maxLevel: 15, defaultLevel: 8 },
  bravery:           { kind: 'leveled', maxLevel: 3,  defaultLevel: 1 },
  fleet_footwork:    { kind: 'leveled', maxLevel: 3,  defaultLevel: 1 },
  fortune:            { kind: 'leveled', maxLevel: 3,  defaultLevel: 1 },
  ammunition_training: { kind: 'leveled', maxLevel: 3, defaultLevel: 1 },
};

export const isUnique = (id: string): boolean =>
  (ABILITY_CATALOG[id]?.kind ?? 'unique') === 'unique';

/** Effective level of an ability on a def: explicit, else catalog default,
 *  else 1 for unknown-but-present, 0 when absent. The single read path for
 *  every magnitude. */
export function abilityLevel(def: UnitDef, id: string): number {
  if (!def.abilities.includes(id)) return 0;
  return def.abilityLevels?.[id] ?? ABILITY_CATALOG[id]?.defaultLevel ?? 1;
}

/** Additive stacking, capped; unique abilities clamp to 1. */
export function addAbilityLevels(id: string, a: number, b: number): number {
  const max = ABILITY_CATALOG[id]?.kind === 'leveled' ? ABILITY_CATALOG[id].maxLevel : 1;
  return Math.min(max, a + b);
}

/** Magnitude formulas — beside the catalog so a new leveled ability adds its
 *  number here, not in combat/battle code. */
export const lifestealFraction = (level: number) => 0.1 * level; // 10%·L of damage dealt
export const defenseReductionMult = (level: number) => 1 - 0.05 * level; // −5%·L target defense

/** Unique-ability magnitudes. Same rationale as the formulas above: one place
 *  to tune, so combat/battle code reads the name rather than a bare number. */
export const INFECT_PENALTY = 5;      // Zombie infecting_strike: −5 attack and defense per hit
export const CURSE_SHOT_PENALTY = 5;  // Lich curse_shot: −5 attack per shot
export const BLOOD_FRENZY_DAMAGE = 2; // Blood Acolyte blood_frenzy: +2 min/max damage per wound
