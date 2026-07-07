import type { UnitDef } from './types';

// Ranger faction — fast, mobile, ranged/nature units
export const RANGER_UNITS: UnitDef[] = [
  {
    name: 'Sprite', tier: 1, speed: 7, initiative: 12, hp: 3,
    attack: 2, defense: 2, minDamage: 1, maxDamage: 2,
    shots: 0, range: 0, isLarge: false, abilities: ['flying'],
  },
  {
    name: 'Wood Elf', tier: 2, speed: 5, initiative: 9, hp: 15,
    attack: 6, defense: 3, minDamage: 2, maxDamage: 4,
    shots: 15, range: 10, isLarge: false, abilities: ['no_melee_penalty'],
  },
  {
    name: 'Dendroid', tier: 3, speed: 2, initiative: 6, hp: 55,
    attack: 7, defense: 13, minDamage: 6, maxDamage: 10,
    shots: 0, range: 0, isLarge: false, abilities: ['bind'],
  },
  {
    name: 'Pegasus', tier: 4, speed: 9, initiative: 12, hp: 40,
    attack: 9, defense: 9, minDamage: 7, maxDamage: 9,
    shots: 0, range: 0, isLarge: false, abilities: ['flying'],
  },
  {
    name: 'Grand Elf', tier: 5, speed: 6, initiative: 9, hp: 60,
    attack: 13, defense: 9, minDamage: 12, maxDamage: 16,
    shots: 12, range: 10, isLarge: false, abilities: ['double_shot'],
  },
  {
    name: 'Battle Dwarf', tier: 6, speed: 5, initiative: 8, hp: 100,
    attack: 14, defense: 16, minDamage: 15, maxDamage: 23,
    shots: 0, range: 0, isLarge: false, abilities: [],
  },
  {
    name: 'Unicorn', tier: 7, speed: 8, initiative: 11, hp: 180,
    attack: 22, defense: 18, minDamage: 20, maxDamage: 30,
    shots: 0, range: 0, isLarge: false, abilities: ['flying', 'magic_resistance', 'blind_on_hit'],
  },
];

export const SPRITE = RANGER_UNITS[0];
export const WOOD_ELF = RANGER_UNITS[1];
export const DENDROID = RANGER_UNITS[2];
export const PEGASUS = RANGER_UNITS[3];
export const GRAND_ELF = RANGER_UNITS[4];
export const BATTLE_DWARF = RANGER_UNITS[5];
export const UNICORN = RANGER_UNITS[6];
