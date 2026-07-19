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
    // Speed already includes the innate Fleet Footwork II (+2) — defs carry
    // their final speed; the ability entry is for display and identity.
    name: 'Outrider', tier: 2, speed: 8, initiative: 10, hp: 18,
    attack: 5, defense: 4, minDamage: 2, maxDamage: 4,
    shots: 0, range: 0, isLarge: false, abilities: ['fleet_footwork'],
    abilityLevels: { fleet_footwork: 2 },
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

// Name-based lookups: roster order/size may change (multiple units per tier).
const byName = (n: string) => RANGER_UNITS.find(u => u.name === n)!;
export const SPRITE = byName('Sprite');
export const WOOD_ELF = byName('Wood Elf');
export const DENDROID = byName('Dendroid');
export const PEGASUS = byName('Pegasus');
export const GRAND_ELF = byName('Grand Elf');
export const BATTLE_DWARF = byName('Battle Dwarf');
export const UNICORN = byName('Unicorn');
