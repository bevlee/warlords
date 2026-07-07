import type { ArmySlot, FactionClass, UnitDef } from '../engine/types';
import { FACTION_UNITS } from '../engine/factions';
import { UNIT_COSTS } from '../engine/recruit';
import { mulberry32 } from '../engine/rng';

export const CHAPTER_TITLES: Record<number, string> = {
  1: 'The Hunt',
  2: 'Raiders',
  3: 'The Fortress',
  4: 'Dark Forces',
  5: 'The Warlord',
};

export interface Encounter {
  id: string;
  name: string;
  chapter: number;
  description: string;
  enemyFaction: FactionClass;
  enemyLevel: number;   // scales enemy hero/army strength
  enemyTiers: number[]; // which unit tiers can appear
  goldReward: number;
  xpReward: number;
  special?: string;     // flavour note for UI
}

export const ENCOUNTERS: Encounter[] = [
  // Chapter 1 — The Hunt: easy wolf/goblin enemies, teaches mechanics.
  { id: 'ch1-1', name: 'Wolves at the Door', chapter: 1, description: 'A pack of wolf riders harries the border villages.', enemyFaction: 'barbarian', enemyLevel: 1, enemyTiers: [1, 2], goldReward: 80, xpReward: 60 },
  { id: 'ch1-2', name: 'Goblin Skirmish', chapter: 1, description: 'Goblins raid a supply caravan on the north road.', enemyFaction: 'barbarian', enemyLevel: 1, enemyTiers: [1, 2], goldReward: 100, xpReward: 80 },
  { id: 'ch1-3', name: 'The Orc Camp', chapter: 1, description: 'An orc warband has made camp in the foothills.', enemyFaction: 'barbarian', enemyLevel: 2, enemyTiers: [1, 2, 3], goldReward: 130, xpReward: 110, special: 'First tier-3 enemies' },

  // Chapter 2 — Raiders: medium enemies, first ranged threats.
  { id: 'ch2-1', name: 'Bandit Ambush', chapter: 2, description: 'Knight deserters turned bandit ambush travelers on the pass.', enemyFaction: 'knight', enemyLevel: 3, enemyTiers: [1, 2], goldReward: 150, xpReward: 140 },
  { id: 'ch2-2', name: 'Archers on the Ridge', chapter: 2, description: 'Ranged raiders hold the high ground above the road.', enemyFaction: 'knight', enemyLevel: 3, enemyTiers: [2, 3], goldReward: 170, xpReward: 160, special: 'First serious ranged threat' },
  { id: 'ch2-3', name: 'The Griffin Nest', chapter: 2, description: 'Griffins guard a mountain pass you must cross.', enemyFaction: 'knight', enemyLevel: 4, enemyTiers: [3, 4], goldReward: 200, xpReward: 190 },

  // Chapter 3 — The Fortress: tough melee, obstacle-heavy maps.
  { id: 'ch3-1', name: 'Outer Walls', chapter: 3, description: "Swordsmen hold the fortress's outer walls.", enemyFaction: 'knight', enemyLevel: 5, enemyTiers: [3, 4, 5], goldReward: 230, xpReward: 220 },
  { id: 'ch3-2', name: 'The Gatehouse', chapter: 3, description: 'A collapsed gatehouse, thick with rubble and defenders.', enemyFaction: 'knight', enemyLevel: 6, enemyTiers: [4, 5], goldReward: 260, xpReward: 250, special: 'Obstacle-heavy map' },
  { id: 'ch3-3', name: "Cavaliers' Charge", chapter: 3, description: 'Mounted cavaliers wait in the courtyard.', enemyFaction: 'knight', enemyLevel: 7, enemyTiers: [5, 6], goldReward: 300, xpReward: 290 },
  { id: 'ch3-4', name: "The Champion's Stand", chapter: 3, description: "The fortress's champion makes a final stand.", enemyFaction: 'knight', enemyLevel: 8, enemyTiers: [5, 6, 7], goldReward: 340, xpReward: 330, special: 'Chapter boss' },

  // Chapter 4 — Dark Forces: undead/demon enemies.
  { id: 'ch4-1', name: 'Restless Dead', chapter: 4, description: 'Skeletons rise from an old battlefield.', enemyFaction: 'necromancer', enemyLevel: 8, enemyTiers: [1, 2, 3], goldReward: 320, xpReward: 320 },
  { id: 'ch4-2', name: "The Vampire's Crypt", chapter: 4, description: 'A vampire lord commands the undead horde within.', enemyFaction: 'necromancer', enemyLevel: 9, enemyTiers: [3, 4, 5], goldReward: 360, xpReward: 360 },
  { id: 'ch4-3', name: 'Demonic Incursion', chapter: 4, description: 'A tear in reality lets demons pour through.', enemyFaction: 'demon', enemyLevel: 10, enemyTiers: [2, 3, 4], goldReward: 400, xpReward: 400 },
  { id: 'ch4-4', name: "The Efreet's Wrath", chapter: 4, description: 'An Efreet leads a burning raid on the last outpost.', enemyFaction: 'demon', enemyLevel: 11, enemyTiers: [4, 5, 6], goldReward: 440, xpReward: 440, special: 'Chapter boss' },

  // Chapter 5 — The Warlord: boss gauntlet, final encounter.
  { id: 'ch5-1', name: 'The Vanguard', chapter: 5, description: "The Warlord's vanguard tests your mettle.", enemyFaction: 'ranger', enemyLevel: 12, enemyTiers: [4, 5, 6], goldReward: 480, xpReward: 480 },
  { id: 'ch5-2', name: "The Warlord's Legion", chapter: 5, description: 'Elite units from every corner of the realm bar your way.', enemyFaction: 'demon', enemyLevel: 14, enemyTiers: [5, 6, 7], goldReward: 600, xpReward: 600 },
  { id: 'ch5-3', name: 'The Warlord', chapter: 5, description: 'Face the Warlord himself in single combat.', enemyFaction: 'demon', enemyLevel: 16, enemyTiers: [6, 7], goldReward: 1000, xpReward: 1000, special: 'Final boss' },
];

/** Deterministic per-encounter RNG seed, so the same encounter/level pairing always fields the same army. */
function encounterSeed(id: string, salt: number): number {
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h;
}

/**
 * Procedurally generated enemy army for an encounter: 2–3 unit types drawn
 * from its allowed tiers, with counts scaling with the player's level so the
 * campaign keeps pace with hero progression.
 */
export function generateEnemyArmy(encounter: Encounter, playerLevel: number): ArmySlot[] {
  const roster = FACTION_UNITS[encounter.enemyFaction].filter(u => encounter.enemyTiers.includes(u.tier));
  if (roster.length === 0) return [];

  const rng = mulberry32(encounterSeed(encounter.id, playerLevel));
  const budget = 120 + 35 * encounter.enemyLevel + 25 * playerLevel;

  const pool = [...roster];
  const pickCount = Math.min(pool.length, 2 + Math.floor(rng() * 2)); // 2–3 unit types
  const chosen: UnitDef[] = [];
  for (let i = 0; i < pickCount; i++) {
    const idx = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }

  const slots: ArmySlot[] = [];
  let remaining = budget;
  chosen.forEach((unit, i) => {
    const cost = UNIT_COSTS[unit.name] ?? 10;
    if (cost > remaining) return;
    const share = remaining * (i === chosen.length - 1 ? 0.9 : 0.3 + rng() * 0.4);
    const count = Math.max(1, Math.min(Math.floor(remaining / cost), Math.round(share / cost)));
    slots.push({ unit, count });
    remaining -= count * cost;
  });

  return slots.length > 0 ? slots : [{ unit: chosen[0], count: 3 }];
}
