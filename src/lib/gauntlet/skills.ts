import type { ArmySlot, FactionClass } from '../engine/types';
import { mixSeed, mulberry32 } from '../engine/rng';
import { ABILITY_CATALOG, abilityLevel, addAbilityLevels, isUnique } from '../engine/abilityCatalog';
import { FACTION_UNITS } from '../engine/factions';
import type { RunState } from './run';

export type SkillId =
  | 'weapon_training'
  | 'armour_training'
  | 'life_drain'
  | 'double_strike'
  | 'no_retaliation'
  | 'fleet_footwork'
  | 'bravery'
  | 'fortune'
  | 'ammunition_training';

/** unitName → granted skill levels (unique skills are level 1). */
export type UnitSkills = Record<string, Partial<Record<SkillId, number>>>;

export interface UnitSkillDef {
  id: SkillId;
  name: string;
  description: string;
}

/** Teachable unit skills. Ids are engine ability strings, so granting one is
 *  just adding it to the unit definition's abilities. Leveled skills (per the
 *  engine ability catalog) stack additively per pick; unique ones are
 *  once-only. Melee/ranged-penalty style abilities are excluded by design. */
export const UNIT_SKILLS: Record<SkillId, UnitSkillDef> = {
  weapon_training: { id: 'weapon_training', name: 'Weapon Training', description: 'This unit gains +1 Attack for each Gauntlet battle won.' },
  armour_training: { id: 'armour_training', name: 'Armour Training', description: 'This unit gains +1 Defense for each Gauntlet battle won.' },
  life_drain: { id: 'life_drain', name: 'Lifesteal', description: 'Each training adds one Lifesteal stack, which heals this unit for 10% of the damage it deals. Can be trained multiple times per unit.' },
  double_strike: { id: 'double_strike', name: 'Double Strike', description: 'Melee attacks land a second blow after the [[retaliation]].' },
  no_retaliation: { id: 'no_retaliation', name: 'No Retaliation', description: 'Targets this unit hits cannot [[retaliation|retaliate]].' },
  fleet_footwork: { id: 'fleet_footwork', name: 'Agility Training', description: 'Each training gives this unit +1 Speed and +1 Initiative. Can be trained multiple times per unit, up to +3 of each.' },
  bravery: { id: 'bravery', name: 'Bravery', description: 'Each training gives this unit +1 [[morale]]. Can be trained multiple times per unit, up to +3 Morale.' },
  fortune: { id: 'fortune', name: 'Fortune', description: 'Each training gives this unit +1 [[luck]]. Can be trained multiple times per unit, up to +3 Luck.' },
  ammunition_training: { id: 'ammunition_training', name: 'Ammunition Training', description: 'Each training gives this ranged unit +5 Shots: +5, +10, then +15. Can be trained multiple times per unit.' },
};

export const SKILL_IDS = Object.keys(UNIT_SKILLS) as SkillId[];
export const SKILL_OFFER_COUNT = 3;

/** The level a unit's granted skill sits at (0 = not granted). */
const grantedLevel = (unitSkills: UnitSkills, unitName: string, id: SkillId): number =>
  unitSkills[unitName]?.[id] ?? 0;

/** Whether this unit could still gain a level of the skill. Innate abilities
 *  block unique grants; leveled grants stack until the catalog cap. */
export function canLearnSkill(slot: ArmySlot, unitSkills: UnitSkills, id: SkillId): boolean {
  if (id === 'ammunition_training' && slot.unit.shots <= 0) return false;
  const granted = grantedLevel(unitSkills, slot.unit.name, id);
  if (isUnique(id)) return granted === 0 && !slot.unit.abilities.includes(id);
  const max = ABILITY_CATALOG[id]?.maxLevel ?? 1;
  const listed = slot.unit.abilities.includes(id) ? abilityLevel(slot.unit, id) : 0;
  const current = slot.unit.grantedAbilities?.includes(id)
    ? Math.max(listed, granted)
    : listed + granted;
  return current < max;
}

/** Seeded pick of skills to offer. Excludes skills no army unit could still
 *  learn (unique and universally owned, or leveled and universally capped). */
export function skillDraftOptions(run: RunState): SkillId[] {
  const unitSkills = run.unitSkills ?? {};
  const training = (['weapon_training', 'armour_training'] as SkillId[])
    .filter(id => run.army.some(slot => canLearnSkill(slot, unitSkills, id)));
  const pool = SKILL_IDS.filter(id =>
    !training.includes(id) && run.army.some(slot => canLearnSkill(slot, unitSkills, id))
  );
  const rng = mulberry32(mixSeed(run.seed, run.battlesWon * 4271 + 17));
  const picks: SkillId[] = [];
  if (training.length > 0) picks.push(training[Math.floor(rng() * training.length)]);
  const bag = [...pool];
  while (picks.length < SKILL_OFFER_COUNT && bag.length > 0) {
    picks.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return picks;
}

/** Merge granted skills into unit definitions for battle, stamping
 *  `grantedAbilities` so the UI can color them apart from base abilities.
 *  Idempotent by construction: every unit is rebuilt from its clean faction
 *  base def (survivors round-trip merged defs back into the run, so merging
 *  on top of a merged def would stack speed/levels). */
export function applyUnitSkills(army: ArmySlot[], unitSkills: UnitSkills, faction: FactionClass): ArmySlot[] {
  return army.map(slot => {
    const grants = unitSkills[slot.unit.name];
    if (!grants || Object.keys(grants).length === 0) return slot;
    const base = FACTION_UNITS[faction].find(u => u.name === slot.unit.name) ?? slot.unit;

    const abilities = [...base.abilities];
    const abilityLevels = { ...(base.abilityLevels ?? {}) };
    const grantedList: string[] = [];
    let speed = base.speed;
    let initiative = base.initiative;
    let shots = base.shots;

    for (const [id, lvl] of Object.entries(grants) as [SkillId, number][]) {
      if (!lvl) continue;
      if (id === 'weapon_training' || id === 'armour_training') {
        grantedList.push(id);
        continue;
      }
      if (isUnique(id) && abilities.includes(id)) continue; // innate unique — nothing to add
      const baseLevel = abilities.includes(id)
        ? (abilityLevels[id] ?? ABILITY_CATALOG[id]?.defaultLevel ?? 1)
        : 0;
      const total = addAbilityLevels(id, baseLevel, lvl);
      if (!abilities.includes(id)) abilities.push(id);
      abilityLevels[id] = total;
      grantedList.push(id);
      if (id === 'fleet_footwork') {
        const trainedLevels = total - baseLevel;
        speed = base.speed + trainedLevels;
        initiative = base.initiative + trainedLevels;
      }
      if (id === 'ammunition_training') shots = base.shots + total * 5;
    }

    if (grantedList.length === 0) return slot;
    return { ...slot, unit: { ...base, speed, initiative, shots, abilities, abilityLevels, grantedAbilities: grantedList } };
  });
}

/** Old saves stored unitSkills values as SkillId[] — upgrade to level-1 maps. */
export function migrateUnitSkills(saved: UnitSkills): UnitSkills {
  const out: UnitSkills = {};
  for (const [name, value] of Object.entries(saved)) {
    out[name] = Array.isArray(value)
      ? Object.fromEntries((value as SkillId[]).map(id => [id, 1]))
      : value;
  }
  return out;
}
