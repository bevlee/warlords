import type { ArmySlot, FactionClass, FactionSkill, Hero } from './types.ts';
import { SKELETON } from './necromancer.ts';

/** Each faction gets 3 innate skills that level up with the hero. */
export const FACTION_SKILL_DEFS: Record<
  FactionClass,
  Array<{ id: string; name: string; description: string; unlockLevel: number }>
> = {
  barbarian: [
    { id: 'offense', name: 'Offense', description: '+3/6/9% damage dealt, by rank', unlockLevel: 1 },
    { id: 'armorer', name: 'Armorer', description: '+3/6/9% less damage taken, by rank', unlockLevel: 3 },
    { id: 'leadership', name: 'Leadership', description: '+1/2/3 [[morale]] to every stack, by rank', unlockLevel: 5 },
  ],
  knight: [
    { id: 'tactics', name: 'Tactics', description: 'Deploy 1/2/3 rows further forward, by rank', unlockLevel: 1 },
    { id: 'armorer', name: 'Armorer', description: '+5/10/15% less damage taken, by rank', unlockLevel: 2 },
    { id: 'leadership', name: 'Leadership', description: '+1/2/3 [[morale]] to every stack, by rank', unlockLevel: 4 },
  ],
  wizard: [
    { id: 'sorcery', name: 'Sorcery', description: '+5/10/15% spell damage, by rank', unlockLevel: 1 },
    { id: 'intelligence', name: 'Intelligence', description: '+2/4/6 maximum mana, by rank', unlockLevel: 2 },
    { id: 'mysticism', name: 'Mysticism', description: 'Regain 1/2/3 mana each round, by rank', unlockLevel: 4 },
  ],
  necromancer: [
    { id: 'necromancy', name: 'Necromancy', description: 'Raise 5/10/15% of enemies you kill as Skeletons for the next battle, by rank', unlockLevel: 1 },
    { id: 'death_magic', name: 'Death Magic', description: "+5/10/15% to the Lich's shot damage", unlockLevel: 3 },
    { id: 'sorcery', name: 'Sorcery', description: '+5/10/15% spell damage, by rank', unlockLevel: 5 },
  ],
  ranger: [
    { id: 'archery', name: 'Archery', description: '+5/10/15% ranged damage, by rank', unlockLevel: 1 },
    { id: 'logistics', name: 'Logistics', description: '+1/2/3 Speed to every stack, by rank', unlockLevel: 3 },
    { id: 'natures_luck', name: "Nature's Luck", description: '+1/2/3 [[luck]] to every stack, by rank', unlockLevel: 5 },
  ],
  demon: [
    { id: 'offense', name: 'Offense', description: '+3/6/9% damage dealt, by rank', unlockLevel: 1 },
    { id: 'fire_magic', name: 'Fire Magic', description: '+10/20/30% damage from [[burn]] and from Efreet’s attacks, by rank', unlockLevel: 3 },
    { id: 'gating', name: 'Gating', description: '20/40/60% chance a fallen Demon-faction stack returns for free, by rank', unlockLevel: 5 },
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
  if (hero.class !== 'wizard') return 0;
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

/** Ranger Archery: +5% ranged damage per skill level, for the hero's own shooting stacks. */
export function applyArcheryBonus(damage: number, hero: Hero): number {
  const lvl = getSkillLevel(hero, 'archery');
  if (lvl === 0) return damage;
  return Math.round(damage * (1 + 0.05 * lvl));
}

/** Ranger Logistics: +1 movement speed per skill level, granted to all of the hero's units at battle start. */
export function getLogisticsBonus(hero: Hero): number {
  return getSkillLevel(hero, 'logistics');
}

/** Ranger Nature's Luck: +1 luck per skill level, granted to all of the hero's units at battle start. */
export function getNatureLuckBonus(hero: Hero): number {
  return getSkillLevel(hero, 'natures_luck');
}

/** Necromancer Death Magic: +5% per skill level to the Lich's shot damage. */
export function applyDeathMagicBonus(damage: number, hero: Hero): number {
  const lvl = getSkillLevel(hero, 'death_magic');
  if (lvl === 0) return damage;
  return Math.round(damage * (1 + 0.05 * lvl));
}

/** Demon Fire Magic: +10% per skill level to burn damage and the Efreet's own attacks. */
export function applyFireMagicBonus(damage: number, hero: Hero): number {
  const lvl = getSkillLevel(hero, 'fire_magic');
  if (lvl === 0) return damage;
  return Math.round(damage * (1 + 0.1 * lvl));
}

/** Demon Gating: 20% chance per skill level a fallen Demon-faction unit respawns for free. */
export function getGatingChance(hero: Hero): number {
  return 0.2 * getSkillLevel(hero, 'gating');
}

/**
 * Necromancer Necromancy: a win always wipes the enemy army (checkBattleEnd
 * requires it), so the killed-HP value is simply the whole pre-battle enemy
 * army's HP. 5/10/15% of it converts into free Skeletons for the next battle.
 */
export function necromancyBonusSkeletons(hero: Hero, enemyArmy: ArmySlot[]): number {
  const lvl = getSkillLevel(hero, 'necromancy');
  if (lvl === 0) return 0;
  const totalEnemyHp = enemyArmy.reduce((sum, slot) => sum + slot.count * slot.unit.hp, 0);
  return Math.floor((totalEnemyHp * 0.05 * lvl) / SKELETON.hp);
}

/** Unlock/level faction skills as the hero levels up. Called whenever hero.level changes. */
export function updateFactionSkills(hero: Hero): Hero {
  // Faction powers are now explicit hero actions/artifacts rather than silent
  // level-derived combat bonuses. Retain already-persisted skills so migrated
  // runs remain loadable, but never manufacture or level them automatically.
  return { ...hero, factionSkills: hero.factionSkills ?? [] };
}
