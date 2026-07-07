import type { UnitDef } from './types';

// Necromancer faction — undead army, cheap chaff, self-replenishing
export const NECROMANCER_UNITS: UnitDef[] = [
  {
    name: 'Skeleton', tier: 1, speed: 4, initiative: 8, hp: 6,
    attack: 3, defense: 3, minDamage: 1, maxDamage: 3,
    shots: 0, range: 0, isLarge: false, abilities: ['undead'],
  },
  {
    name: 'Zombie', tier: 2, speed: 3, initiative: 6, hp: 30,
    attack: 5, defense: 5, minDamage: 2, maxDamage: 4,
    shots: 0, range: 0, isLarge: false, abilities: ['undead', 'slow_on_hit'],
  },
  {
    name: 'Ghost', tier: 3, speed: 7, initiative: 10, hp: 20,
    attack: 7, defense: 7, minDamage: 4, maxDamage: 6,
    shots: 0, range: 0, isLarge: false, abilities: ['undead', 'flying', 'no_retaliation', 'drain_morale'],
  },
  {
    name: 'Vampire', tier: 4, speed: 7, initiative: 9, hp: 55,
    attack: 10, defense: 9, minDamage: 5, maxDamage: 8,
    shots: 0, range: 0, isLarge: false, abilities: ['undead', 'flying', 'no_retaliation', 'life_drain'],
  },
  {
    name: 'Lich', tier: 5, speed: 6, initiative: 9, hp: 65,
    attack: 13, defense: 10, minDamage: 11, maxDamage: 15,
    shots: 6, range: 10, isLarge: false, abilities: ['undead', 'area_shot'],
  },
  {
    name: 'Black Knight', tier: 6, speed: 6, initiative: 9, hp: 120,
    attack: 18, defense: 15, minDamage: 15, maxDamage: 25,
    shots: 0, range: 0, isLarge: false, abilities: ['undead', 'death_blow'],
  },
  {
    name: 'Bone Dragon', tier: 7, speed: 8, initiative: 10, hp: 250,
    attack: 28, defense: 20, minDamage: 25, maxDamage: 45,
    shots: 0, range: 0, isLarge: false, abilities: ['undead', 'flying', 'defense_reduction'],
  },
];

export const SKELETON = NECROMANCER_UNITS[0];
export const ZOMBIE = NECROMANCER_UNITS[1];
export const GHOST = NECROMANCER_UNITS[2];
export const VAMPIRE = NECROMANCER_UNITS[3];
export const LICH = NECROMANCER_UNITS[4];
export const BLACK_KNIGHT = NECROMANCER_UNITS[5];
export const BONE_DRAGON = NECROMANCER_UNITS[6];
