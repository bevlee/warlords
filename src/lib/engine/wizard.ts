import type { UnitDef } from './types';

// Wizard faction — fragile but powerful ranged/magic units
export const WIZARD_UNITS: UnitDef[] = [
  {
    name: 'Gremlin', tier: 1, speed: 4, initiative: 9, hp: 4,
    attack: 2, defense: 2, minDamage: 1, maxDamage: 2,
    shots: 8, range: 6, isLarge: false, abilities: [],
  },
  {
    name: 'Stone Golem', tier: 2, speed: 3, initiative: 6, hp: 50,
    attack: 5, defense: 10, minDamage: 4, maxDamage: 5,
    shots: 0, range: 0, isLarge: false, abilities: ['magic_resistance'],
  },
  {
    name: 'Mage', tier: 3, speed: 5, initiative: 9, hp: 25,
    attack: 10, defense: 4, minDamage: 7, maxDamage: 9,
    shots: 8, range: 10, isLarge: false, abilities: ['no_melee_penalty'],
  },
  {
    name: 'Gorgon', tier: 4, speed: 4, initiative: 8, hp: 70,
    attack: 10, defense: 9, minDamage: 8, maxDamage: 16,
    shots: 0, range: 0, isLarge: true, abilities: ['death_stare'],
  },
  {
    name: 'Naga', tier: 5, speed: 6, initiative: 11, hp: 100,
    attack: 15, defense: 12, minDamage: 15, maxDamage: 20,
    shots: 0, range: 0, isLarge: true, abilities: ['no_retaliation'],
  },
  {
    name: 'Giant', tier: 6, speed: 5, initiative: 8, hp: 200,
    attack: 22, defense: 18, minDamage: 30, maxDamage: 40,
    shots: 0, range: 0, isLarge: true, abilities: [],
  },
  {
    name: 'Titan', tier: 7, speed: 7, initiative: 11, hp: 300,
    attack: 30, defense: 24, minDamage: 50, maxDamage: 65,
    shots: 6, range: 99, isLarge: true, abilities: ['no_retaliation'],
  },
];

export const GREMLIN = WIZARD_UNITS[0];
export const STONE_GOLEM = WIZARD_UNITS[1];
export const MAGE = WIZARD_UNITS[2];
export const GORGON = WIZARD_UNITS[3];
export const NAGA = WIZARD_UNITS[4];
export const GIANT = WIZARD_UNITS[5];
export const TITAN = WIZARD_UNITS[6];
