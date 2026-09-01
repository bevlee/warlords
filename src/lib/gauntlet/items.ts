import type { ArmyBonuses, FactionClass } from '../engine/types';
import { mulberry32 } from '../engine/rng';
import { mixSeed, type RunState } from './run';

export type ItemStat = keyof ArmyBonuses;
export type ItemRarity = 'common' | 'rare' | 'epic';
export type ItemId = string;

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  rarity: ItemRarity;
  faction?: FactionClass;
  requiresUnit?: string[];
  starterForFaction?: FactionClass;
  upgrades?: ItemId;
  legacy?: boolean;
  stats?: Partial<Record<ItemStat, number>>;
  /** Compatibility alias used by the existing stat-strip UI. */
  effects: Partial<Record<ItemStat, number>>;
}

type Spec = Omit<ItemDef, 'id' | 'effects'>;
const item = (id: string, spec: Spec): ItemDef => ({ id, ...spec, effects: spec.stats ?? {} });
const f = (
  faction: FactionClass,
  id: string,
  name: string,
  rarity: ItemRarity,
  description: string,
  requiresUnit?: string[],
): ItemDef => item(id, { name, rarity, description, faction, ...(requiresUnit ? { requiresUnit } : {}) });

const legacy = [
  ['blade_of_the_vanguard', 'Blade of the Vanguard', 'common', '+4 Attack.', { attack: 4 }],
  ['aegis_charm', 'Aegis Charm', 'common', '+4 Defence.', { defense: 4 }],
  ['warhorn_of_haste', 'Warhorn of Haste', 'common', '+1 Initiative.', { initiative: 1 }],
  ['rabbits_foot', "Rabbit's Foot", 'common', '+1 Luck.', { luck: 1 }],
  ['banner_of_courage', 'Banner of Courage', 'common', '+1 Morale.', { morale: 1 }],
  ['greatsword_of_ruin', 'Greatsword of Ruin', 'rare', '+8 Attack.', { attack: 8 }],
  ['tower_shield_sigil', 'Tower Shield Sigil', 'rare', '+8 Defence.', { defense: 8 }],
  ['drums_of_war', 'Drums of War', 'rare', '+2 Initiative.', { initiative: 2 }],
  ['horseshoe_of_fortune', 'Horseshoe of Fortune', 'rare', '+2 Luck.', { luck: 2 }],
  ['standard_of_heroes', 'Standard of Heroes', 'rare', '+2 Morale.', { morale: 2 }],
  ['berserkers_brew', "Berserker's Brew", 'rare', '+10 Attack, −4 Defence.', { attack: 10, defense: -4 }],
  ['stalwart_doctrine', 'Stalwart Doctrine', 'rare', '+10 Defence, −1 Initiative.', { defense: 10, initiative: -1 }],
  ['reckless_standard', 'Reckless Standard', 'rare', '+2 Morale, −1 Luck.', { morale: 2, luck: -1 }],
  ['crown_of_the_warlord', 'Crown of the Warlord', 'epic', '+5 Attack, +5 Defence, +1 Morale.', { attack: 5, defense: 5, morale: 1 }],
  ['relic_of_the_ancients', 'Relic of the Ancients', 'epic', '+4 Attack/Defence and +1 Initiative/Luck/Morale.', { attack: 4, defense: 4, initiative: 1, luck: 1, morale: 1 }],
] as const;

const factionItems: ItemDef[] = [
  // Knight
  f('knight', 'muster_bell', 'Muster Bell', 'common', 'Militia gains +1 Attack and Defence per 8 Peasants instead of 10.', ['Peasant']),
  f('knight', 'blackpowder_fletching', 'Blackpowder Fletching', 'common', 'Area Shot deals 65% damage, including to friendlies.', ['Archer']),
  f('knight', 'drillmasters_manual', "Drillmaster's Manual", 'common', 'Focus also grants +1 Attack and Defence.', ['Swordsman']),
  f('knight', 'silver_spurs', 'Silver Spurs', 'common', 'Ride-By Attack cooldown is reduced to 1.', ['Cavalier']),
  f('knight', 'shieldwall_standard', 'Shieldwall Standard', 'rare', 'Stacks adjacent to a Swordsman inherit Large Shield.', ['Swordsman']),
  f('knight', 'barbed_volley', 'Barbed Volley', 'rare', 'Area Shot survivors lose 2 Defence until their next turn.', ['Archer']),
  f('knight', 'gryphon_talon_bracers', 'Gryphon Talon Bracers', 'rare', 'Griffin retaliations deal 50% more damage and grant 10% ATB.', ['Griffin']),
  f('knight', 'martyrs_banner', "Martyr's Banner", 'rare', 'The first destroyed Peasant stack empowers every surviving Knight stack.', ['Peasant']),
  f('knight', 'consecrated_censer', 'Consecrated Censer', 'rare', 'Cleanse grants negative-effect immunity until the target’s next turn.', ['Monk']),
  f('knight', 'stormlance', 'Stormlance', 'epic', 'Overrun continues through every enemy in line.', ['Champion']),
  f('knight', 'manual_of_perfect_form', 'Manual of Perfect Form', 'epic', 'Focus grants a stack to every living Swordsman.', ['Swordsman']),
  f('knight', 'royal_muster', 'Royal Muster', 'epic', 'Stacks adjacent to Peasants gain half their Militia bonus.', ['Peasant']),

  // Ranger
  f('ranger', 'needlepoint', 'Needlepoint', 'common', 'Darting Assault deals 30% more damage.', ['Sprite']),
  f('ranger', 'barbed_fletching', 'Barbed Fletching', 'common', 'Pinning Shot applies −3 Speed.', ['Wood Elf']),
  f('ranger', 'stag_spurs', 'Stag Spurs', 'common', 'First Strike deals 100% more damage.', ['Outrider']),
  f('ranger', 'canopy_idol', 'Canopy Idol', 'common', 'Sheltering Boughs reduces damage by 50%.', ['Dendroid']),
  f('ranger', 'cloud_reins', 'Cloud Reins', 'common', 'Soaring Strike deals 100% more damage and retains Soaring on a primary kill.', ['Pegasus']),
  f('ranger', 'yewstring', 'Yewstring', 'common', 'Focus Fire arrows gain 35% damage, up to 140%.', ['Grand Elf']),
  f('ranger', 'grudge_axe', 'Grudge Axe', 'common', 'Executioner applies below 75% starting count.', ['Battle Dwarf']),
  f('ranger', 'silver_horseshoe', 'Silver Horseshoe', 'common', "Fortune's Herald grants +2 Luck and 40% ATB.", ['Unicorn']),
  f('ranger', 'quicksilver_dew', 'Quicksilver Dew', 'rare', 'Sprite has +4 Initiative.', ['Sprite']),
  f('ranger', 'pollen_veil', 'Pollen Veil', 'rare', 'Long movement gives Sprite 50% ranged protection until its next turn.', ['Sprite']),
  f('ranger', 'fleeting_shadow', 'Fleeting Shadow', 'rare', 'A safe Darting return gives Sprite 25% ATB.', ['Sprite']),
  f('ranger', 'endless_quiver', 'Endless Quiver', 'rare', 'Shooters gain 6 shots and qualifying Compass movement gives 65% ATB.', ['Wood Elf', 'Grand Elf']),
  f('ranger', 'predators_focus', "Predator's Focus", 'rare', 'Consecutive ranged hits build a shared 10% damage bonus, up to 100%.', ['Wood Elf', 'Grand Elf']),
  f('ranger', 'thornwall_seed', 'Thornwall Seed', 'rare', 'Sheltering Boughs protects shooters within 2 cells.', ['Dendroid']),
  f('ranger', 'ambushers_map', "Ambusher's Map", 'rare', 'Ranger melee stacks deal 30% more damage to enemies yet to act.'),
  f('ranger', 'horn_of_the_wild_hunt', 'Horn of the Wild Hunt', 'rare', 'Each melee stack’s first kill grants other melee stacks 15% ATB.'),
  f('ranger', 'rainbow_mane', 'Rainbow Mane', 'rare', 'Friendly good luck grants other Ranger stacks 10% ATB.', ['Unicorn']),
  f('ranger', 'dew_of_the_first_dawn', 'Dew of the First Dawn', 'epic', 'Safe Darting returns permanently grant Sprite +1 Initiative.', ['Sprite']),
  f('ranger', 'blinkwing_mantle', 'Blinkwing Mantle', 'epic', 'Darting Assault may retreat within unused movement range.', ['Sprite']),
  f('ranger', 'bow_of_echoes', 'Bow of Echoes', 'epic', 'Wood Elf gains a second 75% arrow and Grand Elf a third.', ['Wood Elf', 'Grand Elf']),
  f('ranger', 'the_wild_hunt', 'The Wild Hunt', 'epic', 'Each Ranger stack’s first melee attack against an enemy yet to act deals 200% and returns at 50% ATB.'),
  f('ranger', 'fateweavers_horn', "Fateweaver's Horn", 'epic', 'Each Ranger stack’s first primary attack guarantees good luck.', ['Unicorn']),

  // Barbarian
  f('barbarian', 'redcap_knives', 'Redcap Knives', 'common', 'Mob Rule grants 20% per adjacent friendly, up to 60%.', ['Goblin']),
  f('barbarian', 'split_fang_bridle', 'Split-Fang Bridle', 'common', 'Double Strike’s second hit deals 75%.', ['Wolf Rider']),
  f('barbarian', 'red_fletched_arrows', 'Red-Fletched Arrows', 'common', 'Ranged Mark causes 45% more ranged damage.', ['Orc']),
  f('barbarian', 'headsmans_cleaver', "Headsman's Cleaver", 'common', 'Follow Through transfers all unused overkill.', ['Ogre']),
  f('barbarian', 'ironbound_horns', 'Ironbound Horns', 'common', 'Battering Ram needs 2 cells and collision deals 50%.', ['Ram Rider']),
  f('barbarian', 'shaped_stones', 'Shaped Stones', 'common', 'Boulder Burst deals 75%, or 100% against a Marked primary.', ['Cyclops']),
  f('barbarian', 'storm_spurs', 'Storm Spurs', 'common', 'Thunder Dive needs 3 cells and deals 75% secondary damage.', ['Thunderbird']),
  f('barbarian', 'broken_maw_chain', 'Broken Maw Chain', 'common', 'Rampage kills stack 25% damage until a failed kill.', ['Behemoth']),
  f('barbarian', 'map_of_the_first_raid', 'Map of the First Raid', 'rare', 'Banner of the First Raid grants +4 Speed.'),
  f('barbarian', 'banner_of_no_return', 'Banner of No Return', 'rare', 'Banner of the First Raid grants 50% more damage.'),
  f('barbarian', 'butchers_pennant', "Butcher's Pennant", 'rare', 'An empowered-turn kill also empowers that stack’s next turn.'),
  f('barbarian', 'black_fletched_quiver', 'Black-Fletched Quiver', 'rare', 'Shooters gain 3 shots and ignore distance penalties.', ['Orc', 'Cyclops']),
  f('barbarian', 'spotters_monocle', "Spotter's Monocle", 'rare', 'Marking Shot also Marks surrounding enemies.', ['Orc']),
  f('barbarian', 'horde_drum', 'Horde Drum', 'rare', 'Enemy deaths grant waiting friendly units 10% ATB.'),
  f('barbarian', 'bronze_war_horn', 'Bronze War Horn', 'rare', 'Charge! grants +4 Speed and 40% melee damage.'),
  f('barbarian', 'horn_of_the_hunt', 'Horn of the Hunt', 'rare', 'Loose! grants 75% ranged damage and Marks before damage.'),
  f('barbarian', 'skull_trumpet', 'Skull Trumpet', 'rare', 'Blood for Blood! grants 75% outgoing damage.'),
  f('barbarian', 'bloodletter_axe', 'Bloodletter Axe', 'rare', 'The Barbarian hero’s normal attack deals 300% damage.'),
  f('barbarian', 'red_sunrise', 'Red Sunrise', 'epic', 'Banner of the First Raid empowers the first 2 turns.'),
  f('barbarian', 'endless_hunt', 'Endless Hunt', 'epic', 'A primary-attack kill returns the attacker at 50% ATB.'),
  f('barbarian', 'rain_of_iron', 'Rain of Iron', 'epic', 'Ranged attacks splash 50%, or 75% against a Marked primary.', ['Orc', 'Cyclops']),
  f('barbarian', 'voice_of_the_warchief', 'Voice of the Warchief', 'epic', 'Battle Cries have 2 uses and return the hero at 50% ATB.'),
  f('barbarian', 'worldsplitter', 'Worldsplitter', 'epic', 'The hero deals 500% damage and surviving targets become Marked for Death.'),

  // Wizard
  f('wizard', 'ratchet_loader', 'Ratchet Loader', 'common', 'Scrap Frenzy returns Gremlin at 65% ATB.', ['Gremlin']),
  f('wizard', 'tinkers_kit', "Tinker's Kit", 'common', 'Repair may target any friendly stack.', ['Gremlin']),
  f('wizard', 'hexfield_core', 'Hexfield Core', 'common', 'Weakness Aura triples adjacent magic damage.', ['Stone Golem']),
  f('wizard', 'pressurised_bile_sac', 'Pressurised Bile Sac', 'common', 'Caustic Breath travels 5 cells.', ['Bilehorn']),
  f('wizard', 'storm_fletching', 'Storm Fletching', 'common', 'Lightning Strike splash deals 90%.', ['Titan']),
  f('wizard', 'conduit_array', 'Conduit Array', 'rare', 'Stacks adjacent to a Mage inherit Armour-Piercing.', ['Mage']),
  f('wizard', 'prism_of_the_fallen', 'Prism of the Fallen', 'rare', 'Hero damage rises 20% per dead non-hero stack.'),
  f('wizard', 'overcharged_rods', 'Overcharged Rods', 'rare', 'Lightning Strike removes retaliation until the target’s next turn.', ['Titan']),
  f('wizard', 'vitriol_catalyst', 'Vitriol Catalyst', 'rare', 'Corroded stacks take 50% more magic damage.', ['Bilehorn']),
  f('wizard', 'serpents_coil', "Serpent's Coil", 'rare', 'Naga Double Strike applies to retaliations.', ['Naga']),
  f('wizard', 'stormcrown', 'Stormcrown', 'epic', 'Lightning Strike becomes a friendly-fire 5×5 area.', ['Titan']),
  f('wizard', 'animus_engine', 'The Animus Engine', 'epic', 'Repair may rebuild a destroyed construct once.', ['Gremlin']),
  f('wizard', 'codex_of_the_unbound', 'Codex of the Unbound', 'epic', 'Half Arcane Conduit’s bonus boosts Armour-Piercing attacks.', ['Mage']),
  f('wizard', 'scroll_of_slowing', 'Scroll of Slowing', 'common', 'Grants Slow.'),
  f('wizard', 'tome_of_chain_lightning', 'Tome of Chain Lightning', 'rare', 'Grants Chain Lightning.'),
  f('wizard', 'sigil_of_resurrection', 'Sigil of Resurrection', 'epic', 'Grants Resurrect.'),
  f('wizard', 'tome_of_the_blizzard', 'Tome of the Blizzard', 'epic', 'Grants Blizzard.'),

  // Demon
  f('demon', 'powder_keg', 'Powder Keg', 'common', 'Cinderburst deals 40% of starting HP.', ['Imp']),
  f('demon', 'sulfurous_pitch', 'Sulfurous Pitch', 'common', 'Hellfire Shot secondary damage is 75%.', ['Gog']),
  f('demon', 'brass_collar', 'Brass Collar', 'common', 'Three-Headed Strike secondary bites deal 75%.', ['Hell Hound']),
  f('demon', 'brimstone_key', 'Brimstone Key', 'common', 'Gate summons 5 Imps per Demon.', ['Demon']),
  f('demon', 'blood_chalice', 'Blood Chalice', 'common', 'Overfeed stores excess healing at 200%.', ['Blood Fiend']),
  f('demon', 'cracked_hourglass', 'Cracked Hourglass', 'common', 'Haste Ritual grants +3 Initiative.', ['Pit Fiend']),
  f('demon', 'furnace_heart', 'Furnace Heart', 'rare', 'A dead burning stack transfers Burn to surrounding stacks.'),
  f('demon', 'blackened_wick', 'Blackened Wick', 'rare', 'Burn ticks deal double damage.'),
  f('demon', 'gatekeepers_chain', "Gatekeeper's Chain", 'rare', 'Gate may be used twice.', ['Demon']),
  f('demon', 'feastmasters_hook', "Feastmaster's Hook", 'rare', 'Life Drain heals 100% against burning targets.', ['Blood Fiend']),
  f('demon', 'tormentors_brand', "Tormentor's Brand", 'rare', 'Torment Aura reduces damage by 35% and Speed by 1.', ['Pit Fiend']),
  f('demon', 'ashen_covenant', 'Ashen Covenant', 'rare', 'Demon-faction deaths grant survivors 10% ATB.'),
  f('demon', 'devils_contract', "Devil's Contract", 'rare', 'A Doomstep kill returns Devil at 50% ATB.', ['Devil']),
  f('demon', 'mouth_of_hell', 'Mouth of Hell', 'epic', 'Every non-summoned Demon-faction stack gains Gate.'),
  f('demon', 'crown_of_wildfire', 'Crown of Wildfire', 'epic', 'Burn applications stack and refresh.'),
  f('demon', 'brand_of_damnation', 'Brand of Damnation', 'epic', 'Burning stacks take double direct damage.'),
  f('demon', 'seal_of_the_ninth_circle', 'Seal of the Ninth Circle', 'epic', 'Each starting Demon stack returns once after death.'),
  f('demon', 'hells_verdict', "Hell's Verdict", 'epic', 'Doomstep splashes 50% fire damage.', ['Devil']),

  // Necromancer
  f('necromancer', 'marrow_crown', 'Marrow Crown', 'common', 'Grimoire Skeletons enter at 50% ATB.'),
  f('necromancer', 'plague_bell', 'Plague Bell', 'common', 'Infected enemies raise twice as many Skeletons.', ['Zombie']),
  f('necromancer', 'wailing_lantern', 'Wailing Lantern', 'common', 'Drain Morale removes 2 Morale.', ['Ghost']),
  f('necromancer', 'crimson_needle', 'Crimson Needle', 'common', 'Blood Frenzy grants +4 damage.', ['Blood Acolyte']),
  f('necromancer', 'chalice_of_night', 'Chalice of Night', 'common', 'Vampire Life Drain heals 150% against afflicted targets.', ['Vampire']),
  f('necromancer', 'withered_quiver', 'Withered Quiver', 'common', 'Curse Shot also applies −5 Defence.', ['Lich']),
  f('necromancer', 'reapers_tack', "Reaper's Tack", 'common', 'Soul Reaper claims 2 additional creatures.', ['Black Knight']),
  f('necromancer', 'vertebral_key', 'Vertebral Key', 'common', 'Absorb Skeleton returns Bone Dragon at 50% ATB.', ['Bone Dragon']),
  f('necromancer', 'book_of_grudges', 'Book of Grudges', 'rare', 'Necromancer damage rises 15% per target affliction.'),
  f('necromancer', 'blighted_soil', 'Blighted Soil', 'rare', 'Dead infected enemies spread Infection.', ['Zombie']),
  f('necromancer', 'blood_tithe', 'Blood Tithe', 'rare', 'Every 6 excess Life Drain healing creates a Skeleton.', ['Blood Acolyte', 'Vampire']),
  f('necromancer', 'funeral_drum', 'Funeral Drum', 'rare', 'Every 5 lost Skeletons grants other units 10% ATB.'),
  f('necromancer', 'empty_throne', 'Empty Throne', 'rare', 'Enemies at −3 Morale cannot retaliate and take 50% more damage.', ['Ghost']),
  f('necromancer', 'knights_reliquary', "Knight's Reliquary", 'rare', 'Soul Reaper kills rise as Skeletons.', ['Black Knight']),
  f('necromancer', 'shroud_of_preservation', 'Shroud of Preservation', 'rare', 'Half a killed Skeleton stack joins another.', ['Skeleton']),
  item('dragon_ossuary', { name: 'Dragon Ossuary', description: 'Grimoire raises Bone Dragons instead of Skeletons.', rarity: 'epic', faction: 'necromancer', upgrades: 'gravewrights_grimoire' }),
  f('necromancer', 'crown_of_ruin', 'Crown of Ruin', 'epic', 'Infection, Curse and Morale Drain apply twice.'),
  f('necromancer', 'red_moon_covenant', 'Red Moon Covenant', 'epic', 'Blood Frenzy and Life Drain are doubled.', ['Blood Acolyte', 'Vampire']),
  f('necromancer', 'the_black_procession', 'The Black Procession', 'epic', 'Raised Skeletons gain Infecting Strike and Drain Morale.'),
];

const starters = [
  item('wayfarers_compass', { name: "Wayfarer's Compass", description: 'A Ranger stack moving at least 3 cells without attacking returns at 50% ATB.', rarity: 'common', faction: 'ranger', starterForFaction: 'ranger' }),
  item('banner_of_the_first_raid', { name: 'Banner of the First Raid', description: 'Starting stacks gain +2 Speed and 30% damage during their first turn.', rarity: 'common', faction: 'barbarian', starterForFaction: 'barbarian' }),
  item('gravewrights_grimoire', { name: "Gravewright's Grimoire", description: 'Destroyed enemy stacks raise temporary Skeletons from 10% of starting HP.', rarity: 'common', faction: 'necromancer', starterForFaction: 'necromancer' }),
];

export const ITEMS: Record<ItemId, ItemDef> = Object.fromEntries([
  ...legacy.map(([id, name, rarity, description, stats]) => [id, item(id, { name, description, rarity, stats, legacy: true })]),
  ...starters.map(def => [def.id, def]),
  ...factionItems.map(def => [def.id, def]),
]);

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const RARITY_WEIGHT: Record<ItemRarity, number> = { common: 60, rare: 35, epic: 5 };
const STAT_LABEL: Record<ItemStat, string> = { attack: 'Atk', defense: 'Def', initiative: 'Init', speed: 'Speed', luck: 'Luck', morale: 'Morale' };
const STAT_ORDER: ItemStat[] = ['attack', 'defense', 'initiative', 'speed', 'luck', 'morale'];

export function itemEffectText(def: ItemDef): string {
  if (!def.legacy) return def.description;
  return STAT_ORDER.filter(stat => def.effects[stat] !== undefined).map(stat => {
    const value = def.effects[stat]!;
    return `${value > 0 ? '+' : '−'}${Math.abs(value)} ${STAT_LABEL[stat]}`;
  }).join(' · ');
}

export function itemBonuses(ids: ItemId[]): ArmyBonuses {
  const total: ArmyBonuses = { attack: 0, defense: 0, initiative: 0, speed: 0, luck: 0, morale: 0 };
  for (const id of ids) for (const [stat, value] of Object.entries(ITEMS[id]?.effects ?? {})) total[stat as ItemStat] += value;
  return total;
}

export const starterItemsForFaction = (faction: FactionClass): ItemId[] =>
  ITEM_IDS.filter(id => ITEMS[id].starterForFaction === faction);

/** Multi-unit requirements are alternatives (for example Orc or Cyclops). */
export function isItemEligible(def: ItemDef, run: RunState): boolean {
  if (def.legacy || def.starterForFaction) return false;
  if (def.faction && def.faction !== run.faction) return false;
  if (def.requiresUnit?.length) {
    const owned = new Set(run.army.map(slot => slot.unit.name));
    if (!def.requiresUnit.some(name => owned.has(name))) return false;
  }
  return true;
}

export const ITEM_OFFER_COUNT = 2;
export function itemDraftOptions(run: RunState): ItemId[] {
  const owned = new Set(run.items ?? []);
  const pool = ITEM_IDS.filter(id => !owned.has(id) && isItemEligible(ITEMS[id], run));
  const rng = mulberry32(mixSeed(run.seed, run.battlesWon * 7919 + 13));
  const picks: ItemId[] = [];
  while (picks.length < ITEM_OFFER_COUNT && pool.length) {
    const total = pool.reduce((sum, id) => sum + RARITY_WEIGHT[ITEMS[id].rarity], 0);
    let roll = rng() * total;
    let chosen = pool.at(-1)!;
    for (const id of pool) {
      roll -= RARITY_WEIGHT[ITEMS[id].rarity];
      if (roll <= 0) { chosen = id; break; }
    }
    picks.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return picks;
}

export function addItem(ids: ItemId[], id: ItemId): ItemId[] {
  const upgraded = ITEMS[id]?.upgrades;
  return [...ids.filter(owned => owned !== id && owned !== upgraded), id];
}
