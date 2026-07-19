import type { ArmySlot } from './types';
import type { Rng } from './rng';
import { BARBARIAN_UNITS, GOBLIN } from './barbarian';

/** Gold price per creature, by unit name. */
export const UNIT_COSTS: Record<string, number> = {
  Goblin: 3,
  'Wolf Rider': 8,
  Orc: 12,
  Ogre: 25,
  'Ram Rider': 30,
  Cyclops: 40,
  Thunderbird: 60,
  Behemoth: 100,

  Peasant: 2,
  Archer: 8,
  Griffin: 30,
  'Standard Bearer': 26,
  Swordsman: 35,
  Monk: 45,
  Cavalier: 90,
  Champion: 150,

  Gremlin: 3,
  'Stone Golem': 20,
  Mage: 25,
  Gorgon: 40,
  Naga: 65,
  'Siege Golem': 68,
  Giant: 90,
  Titan: 150,

  Skeleton: 3,
  Zombie: 10,
  Ghost: 25,
  'Blood Acolyte': 24,
  Vampire: 45,
  Lich: 65,
  'Black Knight': 100,
  'Bone Dragon': 170,

  Sprite: 4,
  'Wood Elf': 12,
  Outrider: 14,
  Dendroid: 28,
  Pegasus: 42,
  'Grand Elf': 70,
  'Battle Dwarf': 95,
  Unicorn: 175,

  Imp: 3,
  Gog: 11,
  'Hell Hound': 22,
  Demon: 45,
  'Blood Fiend': 46,
  'Pit Fiend': 65,
  Efreet: 105,
  Devil: 180,
};

export const DEFAULT_BUDGET = 300;
export const MAX_STACKS = 6;

export function armyCost(slots: ArmySlot[]): number {
  return slots.reduce((sum, s) => sum + s.count * (UNIT_COSTS[s.unit.name] ?? 0), 0);
}

/**
 * Seeded enemy roster: 3–5 stack picks spending random shares of the budget,
 * then a goblin top-up so at least ~70% of the gold is always fielded.
 * Duplicate picks merge, so the result stays within MAX_STACKS.
 * `maxTier` mirrors the player's own recruiting cap so practice fights stay fair.
 */
export function generateEnemyArmy(budget: number, rng: Rng, maxTier = 7): ArmySlot[] {
  const roster = BARBARIAN_UNITS.filter(u => u.tier <= maxTier);
  const slots: ArmySlot[] = [];
  let remaining = budget;

  const addTo = (name: string, count: number) => {
    const unit = roster.find(u => u.name === name)!;
    const existing = slots.find(s => s.unit.name === name);
    if (existing) existing.count += count;
    else slots.push({ unit, count });
    remaining -= count * UNIT_COSTS[name];
  };

  const picks = 3 + Math.floor(rng() * 3); // 3–5
  for (let i = 0; i < picks; i++) {
    const affordable = roster.filter(u => UNIT_COSTS[u.name] <= remaining);
    if (affordable.length === 0) break;
    const unit = affordable[Math.floor(rng() * affordable.length)];
    const cost = UNIT_COSTS[unit.name];
    const share = remaining * (i === picks - 1 ? 0.9 : 0.3 + rng() * 0.4);
    const count = Math.max(1, Math.min(Math.floor(remaining / cost), Math.round(share / cost)));
    addTo(unit.name, count);
  }

  // Top up with goblins so the army never comes in badly under budget.
  const goblinCost = UNIT_COSTS[GOBLIN.name];
  if (remaining >= goblinCost && (slots.length < MAX_STACKS || slots.some(s => s.unit.name === GOBLIN.name))) {
    addTo(GOBLIN.name, Math.floor(remaining / goblinCost));
  }

  return slots;
}
