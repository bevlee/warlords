import type { ArmyBonuses } from '../engine/types';
import { mulberry32 } from '../engine/rng';
import { mixSeed, type RunState } from './run';

export type ItemStat = keyof ArmyBonuses;
export type ItemRarity = 'common' | 'rare' | 'epic';

export interface ItemDef {
  id: ItemId;
  name: string;
  rarity: ItemRarity;
  effects: Partial<Record<ItemStat, number>>;
}

export type ItemId =
  | 'blade_of_the_vanguard'
  | 'aegis_charm'
  | 'warhorn_of_haste'
  | 'rabbits_foot'
  | 'banner_of_courage'
  | 'greatsword_of_ruin'
  | 'tower_shield_sigil'
  | 'drums_of_war'
  | 'horseshoe_of_fortune'
  | 'standard_of_heroes'
  | 'berserkers_brew'
  | 'stalwart_doctrine'
  | 'reckless_standard'
  | 'crown_of_the_warlord'
  | 'relic_of_the_ancients';

export const ITEMS: Record<ItemId, ItemDef> = {
  blade_of_the_vanguard: {
    id: 'blade_of_the_vanguard', name: 'Blade of the Vanguard',
    rarity: 'common', effects: { attack: 4 },
  },
  aegis_charm: {
    id: 'aegis_charm', name: 'Aegis Charm',
    rarity: 'common', effects: { defense: 4 },
  },
  warhorn_of_haste: {
    id: 'warhorn_of_haste', name: 'Warhorn of Haste',
    rarity: 'common', effects: { initiative: 1 },
  },
  rabbits_foot: {
    id: 'rabbits_foot', name: "Rabbit's Foot",
    rarity: 'common', effects: { luck: 1 },
  },
  banner_of_courage: {
    id: 'banner_of_courage', name: 'Banner of Courage',
    rarity: 'common', effects: { morale: 1 },
  },
  greatsword_of_ruin: {
    id: 'greatsword_of_ruin', name: 'Greatsword of Ruin',
    rarity: 'rare', effects: { attack: 8 },
  },
  tower_shield_sigil: {
    id: 'tower_shield_sigil', name: 'Tower Shield Sigil',
    rarity: 'rare', effects: { defense: 8 },
  },
  drums_of_war: {
    id: 'drums_of_war', name: 'Drums of War',
    rarity: 'rare', effects: { initiative: 2 },
  },
  horseshoe_of_fortune: {
    id: 'horseshoe_of_fortune', name: 'Horseshoe of Fortune',
    rarity: 'rare', effects: { luck: 2 },
  },
  standard_of_heroes: {
    id: 'standard_of_heroes', name: 'Standard of Heroes',
    rarity: 'rare', effects: { morale: 2 },
  },
  berserkers_brew: {
    id: 'berserkers_brew', name: "Berserker's Brew",
    rarity: 'rare', effects: { attack: 10, defense: -4 },
  },
  stalwart_doctrine: {
    id: 'stalwart_doctrine', name: 'Stalwart Doctrine',
    rarity: 'rare', effects: { defense: 10, initiative: -1 },
  },
  reckless_standard: {
    id: 'reckless_standard', name: 'Reckless Standard',
    rarity: 'rare', effects: { morale: 2, luck: -1 },
  },
  crown_of_the_warlord: {
    id: 'crown_of_the_warlord', name: 'Crown of the Warlord',
    rarity: 'epic', effects: { attack: 5, defense: 5, morale: 1 },
  },
  relic_of_the_ancients: {
    id: 'relic_of_the_ancients', name: 'Relic of the Ancients',
    rarity: 'epic', effects: { attack: 4, defense: 4, initiative: 1, luck: 1, morale: 1 },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

const RARITY_WEIGHT: Record<ItemRarity, number> = { common: 60, rare: 35, epic: 5 };

const STAT_LABEL: Record<ItemStat, string> = {
  attack: 'Atk', defense: 'Def', initiative: 'Init', luck: 'Luck', morale: 'Morale',
};
const STAT_ORDER: ItemStat[] = ['attack', 'defense', 'initiative', 'luck', 'morale'];

/** Human-readable effect line, e.g. "+10 Atk · −4 Def". */
export function itemEffectText(item: ItemDef): string {
  return STAT_ORDER
    .filter(stat => item.effects[stat] !== undefined)
    .map(stat => {
      const v = item.effects[stat]!;
      return `${v > 0 ? '+' : '−'}${Math.abs(v)} ${STAT_LABEL[stat]}`;
    })
    .join(' · ');
}

/** Engine cap on per-stack morale and luck. */
const PROC_STAT_CAP = 3;
const CAPPED_STATS: ItemStat[] = ['luck', 'morale'];

export function itemBonuses(itemIds: ItemId[]): ArmyBonuses {
  const total: ArmyBonuses = { attack: 0, defense: 0, initiative: 0, luck: 0, morale: 0 };
  for (const id of itemIds) {
    for (const [stat, value] of Object.entries(ITEMS[id].effects)) {
      total[stat as ItemStat] += value;
    }
  }
  return total;
}

/** An item is pointless when every stat it improves is already capped. */
function isDeadPick(item: ItemDef, owned: ArmyBonuses): boolean {
  const positive = Object.entries(item.effects).filter(([, v]) => v > 0);
  return positive.every(
    ([stat]) => CAPPED_STATS.includes(stat as ItemStat) && owned[stat as ItemStat] >= PROC_STAT_CAP
  );
}

export const ITEM_OFFER_COUNT = 2;

/** Seeded, rarity-weighted pick of items to offer alongside a unit draft. */
export function itemDraftOptions(run: RunState): ItemId[] {
  const owned = new Set(run.items ?? []);
  const bonuses = itemBonuses(run.items ?? []);
  const pool = ITEM_IDS.filter(id => !owned.has(id) && !isDeadPick(ITEMS[id], bonuses));

  const rng = mulberry32(mixSeed(run.seed, run.battlesWon * 7919 + 13));
  const picks: ItemId[] = [];
  while (picks.length < ITEM_OFFER_COUNT && pool.length > 0) {
    const totalWeight = pool.reduce((sum, id) => sum + RARITY_WEIGHT[ITEMS[id].rarity], 0);
    let roll = rng() * totalWeight;
    let chosen = pool[pool.length - 1];
    for (const id of pool) {
      roll -= RARITY_WEIGHT[ITEMS[id].rarity];
      if (roll <= 0) {
        chosen = id;
        break;
      }
    }
    picks.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return picks;
}
