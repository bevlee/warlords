import type { UnitDef } from './types';

// Knight faction — defensive, balanced units, strong against undead
export const KNIGHT_UNITS: UnitDef[] = [
  {
    name: 'Peasant', tier: 1, speed: 3, initiative: 9, hp: 5,
    attack: 1, defense: 1, minDamage: 1, maxDamage: 1,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Archer', tier: 2, speed: 4, initiative: 9, hp: 15,
    attack: 5, defense: 3, minDamage: 2, maxDamage: 3,
    shots: 12, range: 10, isLarge: false, abilities: [],
  },
  {
    name: 'Griffin', tier: 3, speed: 7, initiative: 14, hp: 35,
    attack: 8, defense: 8, minDamage: 3, maxDamage: 7,
    shots: 0, range: 0, isLarge: false, abilities: ['flying', 'unlimited_retaliation'],
  },
  {
    name: 'Swordsman', tier: 4, speed: 5, initiative: 8, hp: 55,
    attack: 10, defense: 12, minDamage: 6, maxDamage: 9,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Monk', tier: 5, speed: 5, initiative: 9, hp: 70,
    attack: 12, defense: 7, minDamage: 10, maxDamage: 12,
    shots: 8, range: 10, isLarge: false, abilities: ['no_retaliation'],
  },
  {
    name: 'Cavalier', tier: 6, speed: 8, initiative: 11, hp: 100,
    attack: 15, defense: 15, minDamage: 15, maxDamage: 20,
    shots: 0, range: 0, isLarge: true, abilities: ['jousting'],
  },
  {
    name: 'Champion', tier: 7, speed: 7, initiative: 12, hp: 130,
    attack: 20, defense: 20, minDamage: 20, maxDamage: 25,
    shots: 0, range: 0, isLarge: true, abilities: ['jousting'],
  },
];

export const PEASANT = KNIGHT_UNITS[0];
export const ARCHER = KNIGHT_UNITS[1];
export const GRIFFIN = KNIGHT_UNITS[2];
export const SWORDSMAN = KNIGHT_UNITS[3];
export const MONK = KNIGHT_UNITS[4];
export const CAVALIER = KNIGHT_UNITS[5];
export const CHAMPION = KNIGHT_UNITS[6];
