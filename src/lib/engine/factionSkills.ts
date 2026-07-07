import type { FactionClass, FactionSkill, Hero } from './types';

/** Each faction gets 3 innate skills that level up with the hero. */
export const FACTION_SKILL_DEFS: Record<
  FactionClass,
  Array<{ id: string; name: string; description: string; unlockLevel: number }>
> = {
  barbarian: [
    { id: 'offense', name: 'Offense', description: '+3/6/9% damage', unlockLevel: 1 },
    { id: 'armorer', name: 'Armorer', description: '+3/6/9% defense', unlockLevel: 3 },
    { id: 'leadership', name: 'Leadership', description: '+1/2/3 morale to all', unlockLevel: 5 },
  ],
  knight: [
    { id: 'tactics', name: 'Tactics', description: 'Start 1/2/3 rows forward', unlockLevel: 1 },
    { id: 'armorer', name: 'Armorer', description: '+5/10/15% defense', unlockLevel: 2 },
    { id: 'leadership', name: 'Leadership', description: '+1/2/3 morale to all', unlockLevel: 4 },
  ],
  wizard: [
    { id: 'sorcery', name: 'Sorcery', description: '+5/10/15% spell damage', unlockLevel: 1 },
    { id: 'intelligence', name: 'Intelligence', description: '+2/4/6 mana', unlockLevel: 2 },
    { id: 'mysticism', name: 'Mysticism', description: 'Regen 1/2/3 mana/round', unlockLevel: 4 },
  ],
};

/** Active skill level for a given skill id. 0 if not yet unlocked, 1-3 otherwise. */
export function getSkillLevel(hero: Hero, skillId: string): 0 | 1 | 2 | 3 {
  const skill = hero.factionSkills.find(s => s.id === skillId);
  return skill ? skill.level : 0;
}

/** Barbarian Offense: +3% damage per skill level. */
export function applyOffenseBonus(damage: number, hero: Hero): number {
  const lvl = getSkillLevel(hero, 'offense');
  if (lvl === 0) return damage;
  return Math.round(damage * (1 + 0.03 * lvl));
}

/** Armorer: reduces incoming damage — 3%/level (barbarian) or 5%/level (knight). */
export function applyArmorerBonus(damage: number, hero: Hero): number {
  const lvl = getSkillLevel(hero, 'armorer');
  if (lvl === 0) return damage;
  const pct = hero.class === 'knight' ? 0.05 * lvl : 0.03 * lvl;
  return Math.max(1, Math.round(damage * (1 - pct)));
}

/** Morale bonus from the Leadership skill, applied to all of the hero's units. */
export function getMoraleBonus(hero: Hero): number {
  return getSkillLevel(hero, 'leadership');
}

/** Sorcery multiplier for spell damage (wizard). */
export function getSorceryMultiplier(hero: Hero): number {
  return 1 + 0.05 * getSkillLevel(hero, 'sorcery');
}

/** Hero's max/starting mana: base regen curve plus Intelligence (wizard). */
export function maxMana(hero: Hero): number {
  return 5 + 3 * hero.level + 2 * getSkillLevel(hero, 'intelligence');
}

/** Mana regenerated at the start of each new round from Mysticism (wizard). */
export function getMysticismRegen(hero: Hero): number {
  return getSkillLevel(hero, 'mysticism');
}

/** Knight Tactics: starting column shift toward the enemy, in cells. */
export function getTacticsShift(hero: Hero): number {
  return getSkillLevel(hero, 'tactics');
}

/** Unlock/level faction skills as the hero levels up. Called whenever hero.level changes. */
export function updateFactionSkills(hero: Hero): Hero {
  const defs = FACTION_SKILL_DEFS[hero.class];
  const factionSkills: FactionSkill[] = [];
  for (const def of defs) {
    if (hero.level < def.unlockLevel) continue;
    const levelsAboveUnlock = hero.level - def.unlockLevel;
    const skillLevel = Math.min(3, 1 + Math.floor(levelsAboveUnlock / 3)) as 1 | 2 | 3;
    factionSkills.push({ id: def.id, name: def.name, description: def.description, level: skillLevel });
  }
  return { ...hero, factionSkills };
}
