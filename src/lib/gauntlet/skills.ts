import type { ArmySlot } from '../engine/types';
import { mixSeed, mulberry32 } from '../engine/rng';
import type { RunState } from './run';

export type SkillId = 'life_drain' | 'double_strike' | 'no_retaliation' | 'fleet_footwork' | 'bravery';

export interface UnitSkillDef {
  id: SkillId;
  name: string;
  description: string;
}

/** Teachable unit skills. Ids are engine ability strings, so granting one is
 *  just adding it to the unit definition's abilities. Melee/ranged-penalty
 *  style abilities are excluded by design. */
export const UNIT_SKILLS: Record<SkillId, UnitSkillDef> = {
  life_drain: { id: 'life_drain', name: 'Lifesteal', description: 'Heals the stack for the damage it deals on hit.' },
  double_strike: { id: 'double_strike', name: 'Double Strike', description: 'Melee attacks land a second blow after the retaliation.' },
  no_retaliation: { id: 'no_retaliation', name: 'No Retaliation', description: 'Targets this unit hits cannot retaliate.' },
  fleet_footwork: { id: 'fleet_footwork', name: 'Fleet Footwork', description: '+1 speed.' },
  bravery: { id: 'bravery', name: 'Bravery', description: '+1 morale.' },
};

export const SKILL_IDS = Object.keys(UNIT_SKILLS) as SkillId[];
export const SKILL_OFFER_COUNT = 3;

/** Seeded pick of skills to offer. Excludes skills no army unit could still
 *  learn (already granted or innate on every unit type). */
export function skillDraftOptions(run: RunState): SkillId[] {
  const granted = run.unitSkills ?? {};
  const pool = SKILL_IDS.filter(id =>
    run.army.some(
      slot => !(granted[slot.unit.name] ?? []).includes(id) && !slot.unit.abilities.includes(id)
    )
  );
  const rng = mulberry32(mixSeed(run.seed, run.battlesWon * 4271 + 17));
  const picks: SkillId[] = [];
  const bag = [...pool];
  while (picks.length < SKILL_OFFER_COUNT && bag.length > 0) {
    picks.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return picks;
}

/** Merge granted skills into unit definitions for battle, stamping
 *  `grantedAbilities` so the UI can color them apart from base abilities.
 *  Idempotent: survivors round-trip merged defs back into the run, so
 *  re-application must never duplicate abilities or stack the fleet speed. */
export function applyUnitSkills(army: ArmySlot[], unitSkills: Record<string, SkillId[]>): ArmySlot[] {
  return army.map(slot => {
    const granted = unitSkills[slot.unit.name] ?? [];
    const missing = granted.filter(id => !slot.unit.abilities.includes(id));
    if (missing.length === 0) return slot;
    const speedBump = missing.includes('fleet_footwork') ? 1 : 0;
    return {
      ...slot,
      unit: {
        ...slot.unit,
        speed: slot.unit.speed + speedBump,
        abilities: [...slot.unit.abilities, ...missing],
        grantedAbilities: [...(slot.unit.grantedAbilities ?? []), ...missing],
      },
    };
  });
}
