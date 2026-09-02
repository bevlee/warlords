import type { Hero } from './types.ts';

/**
 * What is left of faction skills.
 *
 * Each faction once had three skills that levelled with the hero and quietly
 * scaled damage, morale, mana and deployment. They were replaced by explicit
 * hero actions and artifacts — things a player picks and can see — and nothing
 * has granted a faction skill since. Every stack therefore ran with a skill
 * level of 0, so all the bonus helpers were identity functions and are gone.
 *
 * `Hero.factionSkills` stays on the type, and `updateFactionSkills` stays on
 * the load path, purely so heroes saved before the change still deserialise.
 * Neither does anything else.
 */

/** Hero's max and starting mana. Wizard-only; the Intelligence skill that used
 *  to add to it no longer exists. */
export function maxMana(hero: Hero): number {
  if (hero.class !== 'wizard') return 0;
  return 5 + 3 * hero.level;
}

/** Kept on the hero load path so old saves still open. Faction skills are no
 *  longer granted or levelled, so this only normalises a missing field. */
export function updateFactionSkills(hero: Hero): Hero {
  return { ...hero, factionSkills: hero.factionSkills ?? [] };
}
