import type { UnitDef } from './types';

// Demon faction — high damage, reckless units
export const DEMON_UNITS: UnitDef[] = [
  {
    name: 'Imp', tier: 1, speed: 6, initiative: 10, hp: 5,
    attack: 3, defense: 2, minDamage: 1, maxDamage: 3,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Gog', tier: 2, speed: 5, initiative: 9, hp: 22,
    attack: 6, defense: 4, minDamage: 3, maxDamage: 6,
    shots: 4, range: 7, isLarge: false, abilities: [],
  },
  {
    name: 'Hell Hound', tier: 3, speed: 8, initiative: 12, hp: 30,
    attack: 9, defense: 6, minDamage: 5, maxDamage: 7,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Demon', tier: 4, speed: 5, initiative: 9, hp: 60,
    attack: 11, defense: 8, minDamage: 8, maxDamage: 12,
    shots: 0, range: 0, isLarge: false, abilities: ['gate'],
  },
  {
    name: 'Pit Fiend', tier: 5, speed: 5, initiative: 9, hp: 80,
    attack: 16, defense: 12, minDamage: 13, maxDamage: 20,
    shots: 0, range: 0, isLarge: false, abilities: ['cast_haste'],
  },
  {
    name: 'Efreet', tier: 6, speed: 9, initiative: 11, hp: 110,
    attack: 19, defense: 13, minDamage: 18, maxDamage: 28,
    shots: 0, range: 0, isLarge: false, abilities: ['flying', 'fire_immunity', 'burn'],
  },
  {
    name: 'Devil', tier: 7, speed: 10, initiative: 13, hp: 220,
    attack: 30, defense: 22, minDamage: 30, maxDamage: 50,
    shots: 0, range: 0, isLarge: false, abilities: ['flying', 'no_retaliation', 'teleport'],
  },
];

export const IMP = DEMON_UNITS[0];
export const GOG = DEMON_UNITS[1];
export const HELL_HOUND = DEMON_UNITS[2];
export const DEMON = DEMON_UNITS[3];
export const PIT_FIEND = DEMON_UNITS[4];
export const EFREET = DEMON_UNITS[5];
export const DEVIL = DEMON_UNITS[6];
