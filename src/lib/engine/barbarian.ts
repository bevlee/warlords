import type { UnitDef } from './types';

export const BARBARIAN_UNITS: UnitDef[] = [
  {
    name: 'Goblin', tier: 1, speed: 5, hp: 5,
    attack: 2, defense: 1, minDamage: 1, maxDamage: 2,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Wolf Rider', tier: 2, speed: 7, hp: 20,
    attack: 5, defense: 3, minDamage: 2, maxDamage: 5,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Orc', tier: 3, speed: 4, hp: 35,
    attack: 7, defense: 5, minDamage: 4, maxDamage: 8,
    shots: 4, range: 7, isLarge: false, abilities: [],
  },
  {
    name: 'Ogre', tier: 4, speed: 4, hp: 75,
    attack: 10, defense: 7, minDamage: 7, maxDamage: 14,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Cyclops', tier: 5, speed: 6, hp: 100,
    attack: 15, defense: 10, minDamage: 12, maxDamage: 24,
    shots: 3, range: 8, isLarge: false, abilities: [],
  },
  {
    name: 'Thunderbird', tier: 6, speed: 9, hp: 150,
    attack: 20, defense: 12, minDamage: 18, maxDamage: 30,
    shots: 0, range: 0, isLarge: false, abilities: ['flying'],
  },
  {
    name: 'Behemoth', tier: 7, speed: 6, hp: 300,
    attack: 30, defense: 18, minDamage: 30, maxDamage: 55,
    shots: 0, range: 0, isLarge: false, abilities: ['defense_reduction'],
  },
];

export const GOBLIN = BARBARIAN_UNITS[0];
export const WOLF_RIDER = BARBARIAN_UNITS[1];
export const ORC = BARBARIAN_UNITS[2];
export const OGRE = BARBARIAN_UNITS[3];
export const CYCLOPS = BARBARIAN_UNITS[4];
export const THUNDERBIRD = BARBARIAN_UNITS[5];
export const BEHEMOTH = BARBARIAN_UNITS[6];
