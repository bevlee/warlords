import type { UnitDef } from './types.ts';

// Wizard faction — fragile but powerful ranged/magic units
export const WIZARD_UNITS: UnitDef[] = [
  {
    name: 'Gremlin', tier: 1, speed: 4, initiative: 9, hp: 4,
    attack: 2, defense: 2, minDamage: 1, maxDamage: 2,
    shots: 8, range: 6, isLarge: false, abilities: ['repair', 'scrap_frenzy'],
  },
  {
    name: 'Stone Golem', tier: 2, speed: 3, initiative: 6, hp: 50,
    attack: 5, defense: 10, minDamage: 4, maxDamage: 5,
    shots: 0, range: 0, isLarge: false, types: ['construct'], abilities: ['weakness_aura', 'unlimited_retaliation'],
  },
  {
    name: 'Mage', tier: 3, speed: 5, initiative: 9, hp: 25,
    attack: 10, defense: 4, minDamage: 7, maxDamage: 9,
    shots: 8, range: 10, isLarge: false, abilities: ['arcane_conduit', 'combat_casting'],
  },
  {
    name: 'Bilehorn', tier: 4, speed: 4, initiative: 8, hp: 70,
    attack: 10, defense: 9, minDamage: 8, maxDamage: 16,
    shots: 0, range: 0, isLarge: true, abilities: ['caustic_breath', 'corrosive_carapace'],
  },
  {
    name: 'Naga', tier: 5, speed: 6, initiative: 11, hp: 100,
    attack: 15, defense: 12, minDamage: 15, maxDamage: 20,
    shots: 0, range: 0, isLarge: true, abilities: ['no_retaliation', 'double_strike'],
  },
  {
    name: 'Siege Golem', tier: 5, speed: 4, initiative: 7, hp: 110,
    attack: 12, defense: 12, minDamage: 8, maxDamage: 12,
    shots: 0, range: 0, isLarge: true, types: ['construct'], abilities: ['crushing_blows', 'shockwave'],
  },
  {
    name: 'Giant', tier: 6, speed: 5, initiative: 8, hp: 200,
    attack: 22, defense: 18, minDamage: 30, maxDamage: 40,
    shots: 2, range: 8, isLarge: true, types: ['construct'], abilities: ['boulder_throw', 'death_blow'],
  },
  {
    name: 'Titan', tier: 7, speed: 7, initiative: 11, hp: 300,
    attack: 30, defense: 24, minDamage: 50, maxDamage: 65,
    shots: 3, range: 99, isLarge: true, types: ['construct'], abilities: ['armour_piercing', 'lightning_strike'],
  },
];

// Name-based lookups: roster order/size may change (multiple units per tier).
const byName = (n: string) => WIZARD_UNITS.find(u => u.name === n)!;
export const GREMLIN = byName('Gremlin');
export const STONE_GOLEM = byName('Stone Golem');
export const MAGE = byName('Mage');
export const BILEHORN = byName('Bilehorn');
/** Read-only source alias for old imports; persisted names migrate to Bilehorn. */
export const GORGON = BILEHORN;
export const NAGA = byName('Naga');
export const SIEGE_GOLEM = byName('Siege Golem');
export const GIANT = byName('Giant');
export const TITAN = byName('Titan');
