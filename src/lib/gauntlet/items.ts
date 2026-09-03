import type { ArmyBonuses, FactionClass } from '../engine/types';
import { mulberry32 } from '../engine/rng';
import { mixSeed, type RunState } from './run';

export type ItemStat = keyof ArmyBonuses;
export type ItemRarity = 'default' | 'common' | 'rare' | 'epic';
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
  ['aegis_charm', 'Aegis Charm', 'common', '+4 Defense.', { defense: 4 }],
  ['warhorn_of_haste', 'Warhorn of Haste', 'common', '+1 Initiative.', { initiative: 1 }],
  ['rabbits_foot', "Rabbit's Foot", 'common', '+1 Luck.', { luck: 1 }],
  ['banner_of_courage', 'Banner of Courage', 'common', '+1 Morale.', { morale: 1 }],
  ['greatsword_of_ruin', 'Greatsword of Ruin', 'rare', '+8 Attack.', { attack: 8 }],
  ['tower_shield_sigil', 'Tower Shield Sigil', 'rare', '+8 Defense.', { defense: 8 }],
  ['drums_of_war', 'Drums of War', 'rare', '+2 Initiative.', { initiative: 2 }],
  ['horseshoe_of_fortune', 'Horseshoe of Fortune', 'rare', '+2 Luck.', { luck: 2 }],
  ['standard_of_heroes', 'Standard of Heroes', 'rare', '+2 Morale.', { morale: 2 }],
  ['berserkers_brew', "Berserker's Brew", 'rare', '+10 Attack, −4 Defense.', { attack: 10, defense: -4 }],
  ['stalwart_doctrine', 'Stalwart Doctrine', 'rare', '+10 Defense, −1 Initiative.', { defense: 10, initiative: -1 }],
  ['reckless_standard', 'Reckless Standard', 'rare', '+2 Morale, −1 Luck.', { morale: 2, luck: -1 }],
  ['crown_of_the_warlord', 'Crown of the Warlord', 'epic', '+5 Attack, +5 Defense, +1 Morale.', { attack: 5, defense: 5, morale: 1 }],
  ['relic_of_the_ancients', 'Relic of the Ancients', 'epic', '+4 Attack/Defense and +1 Initiative/Luck/Morale.', { attack: 4, defense: 4, initiative: 1, luck: 1, morale: 1 }],
] as const;

const factionItems: ItemDef[] = [
  // Knight
  f('knight', 'muster_bell', 'Muster Bell', 'common', '[[militia]] gains its +1 Attack and Defense per 8 Peasants instead of per 10.', ['Peasant']),
  f('knight', 'blackpowder_fletching', 'Blackpowder Fletching', 'common', '[[area_shot]] hits only enemies and deals 65% of a normal shot instead of 50%.', ['Archer']),
  f('knight', 'drillmasters_manual', "Drillmaster's Manual", 'common', '[[focus]] additionally grants +1 Attack and +1 Defense alongside its usual +1 Initiative and +1 minimum and maximum damage.', ['Swordsman']),
  f('knight', 'silver_spurs', 'Silver Spurs', 'common', '[[ride_by_attack]] cooldown falls from 2 turns to 1.', ['Cavalier']),
  f('knight', 'shieldwall_standard', 'Shieldwall Standard', 'rare', 'Stacks adjacent to a Swordsman inherit [[large_shield]].', ['Swordsman']),
  f('knight', 'barbed_volley', 'Barbed Volley', 'rare', '[[area_shot]] hits only enemies, and survivors lose 2 Defense until their next turn.', ['Archer']),
  f('knight', 'gryphon_talon_bracers', 'Gryphon Talon Bracers', 'rare', 'Griffin retaliations deal 50% more damage and advance Griffin 10% [[atb]].', ['Griffin']),
  f('knight', 'martyrs_banner', "Martyr's Banner", 'rare', 'The first time a friendly Peasant stack [[perished|perishes]], every living Knight stack gains +1 Initiative and +1 minimum and maximum damage for the rest of the battle.', ['Peasant']),
  f('knight', 'consecrated_censer', 'Consecrated Censer', 'rare', '[[cleanse]] also blocks new negative effects until the target’s next turn.', ['Monk']),
  f('knight', 'stormlance', 'Stormlance', 'epic', '[[overrun]] runs through every enemy in line rather than only the one behind the target, each taking 50% of the hit.', ['Champion']),
  f('knight', 'manual_of_perfect_form', 'Manual of Perfect Form', 'epic', 'One Swordsman using [[focus]] applies it to every living Swordsman you own.', ['Swordsman']),
  f('knight', 'royal_muster', 'Royal Muster', 'epic', 'A friendly stack beside a Peasant gains half that Peasant’s [[militia]] Attack and Defense bonuses, rounded down. Only one adjacent Peasant counts.', ['Peasant']),

  // Ranger
  f('ranger', 'needlepoint', 'Needlepoint', 'common', '[[darting_assault]] deals 30% more damage.', ['Sprite']),
  f('ranger', 'barbed_fletching', 'Barbed Fletching', 'common', '[[pinning_shot]] slows by 3 Speed per hit instead of 2.', ['Wood Elf']),
  f('ranger', 'stag_spurs', 'Stag Spurs', 'common', '[[first_strike]] deals 100% more damage instead of 75%.', ['Outrider']),
  f('ranger', 'canopy_idol', 'Canopy Idol', 'common', '[[sheltering_boughs]] reduces damage by 50% instead of 30%.', ['Dendroid']),
  f('ranger', 'cloud_reins', 'Cloud Reins', 'common', '[[soaring_strike]] deals 100% more damage instead of 75%, and keeps Soaring on a primary kill.', ['Pegasus']),
  f('ranger', 'yewstring', 'Yewstring', 'common', '[[focus_fire]] arrows gain 35% per consecutive hit instead of 25%, up to 140% instead of 100%.', ['Grand Elf']),
  f('ranger', 'grudge_axe', 'Grudge Axe', 'common', '[[executioner]] applies at or below 75% of starting count instead of 50%.', ['Battle Dwarf']),
  f('ranger', 'silver_horseshoe', 'Silver Horseshoe', 'common', "[[fortunes_herald]] grants +2 Luck instead of +1. After a lucky strike, that Ranger stack returns at 40% [[atb]] instead of 25%.", ['Unicorn']),
  f('ranger', 'quicksilver_dew', 'Quicksilver Dew', 'rare', 'Sprite has +4 Initiative.', ['Sprite']),
  f('ranger', 'pollen_veil', 'Pollen Veil', 'rare', 'After Sprite takes a move-only action of at least 3 cells, it takes 50% less ranged damage until its next turn.', ['Sprite']),
  f('ranger', 'fleeting_shadow', 'Fleeting Shadow', 'rare', 'After Sprite completes [[darting_assault]] with no enemy adjacent to its return position, it returns at 25% [[atb]].', ['Sprite']),
  f('ranger', 'endless_quiver', 'Endless Quiver', 'rare', 'Every shooter you own gains 6 extra shots. When a shooter triggers [[wayfarers_compass]], it returns at 65% [[atb]] instead of 50%.', ['Wood Elf', 'Grand Elf']),
  f('ranger', 'predators_focus', "Predator's Focus", 'rare', 'Consecutive ranged hits against the same target gain 10% damage, up to 100%. Wood Elf and Grand Elf stacks share the bonus; changing targets resets it.', ['Wood Elf', 'Grand Elf']),
  f('ranger', 'thornwall_seed', 'Thornwall Seed', 'rare', '[[sheltering_boughs]] protects shooters within 2 cells instead of 1.', ['Dendroid']),
  f('ranger', 'ambushers_map', "Ambusher's Map", 'rare', 'Ranger melee stacks deal 30% more damage to enemies yet to act.'),
  f('ranger', 'horn_of_the_wild_hunt', "Packleader's Horn", 'rare', 'The first time each Ranger melee stack kills its primary target, every other living Ranger melee stack advances 15% [[atb]].'),
  f('ranger', 'rainbow_mane', 'Rainbow Mane', 'rare', 'While a friendly Unicorn lives, a Ranger stack’s lucky strike advances every other living Ranger stack 10% [[atb]].', ['Unicorn']),
  f('ranger', 'dew_of_the_first_dawn', 'Dew of the First Dawn', 'epic', 'Each [[darting_assault]] returning with no enemy adjacent permanently grants Sprite +1 Initiative, uncapped.', ['Sprite']),
  f('ranger', 'blinkwing_mantle', 'Blinkwing Mantle', 'epic', '[[darting_assault]] may return to any cell within the movement it has not spent, not only its starting cell.', ['Sprite']),
  f('ranger', 'bow_of_echoes', 'Bow of Echoes', 'epic', 'Wood Elf and Grand Elf each fire one extra arrow at full damage, spending one more shot.', ['Wood Elf', 'Grand Elf']),
  f('ranger', 'the_wild_hunt', 'Firstblood Hunt', 'epic', 'Each Ranger stack’s first melee attack against an enemy that has not acted deals double damage, then returns that Ranger stack at 50% [[atb]].'),
  f('ranger', 'fateweavers_horn', "Fateweaver's Horn", 'epic', 'Each Ranger stack’s first primary attack guarantees good luck.', ['Unicorn']),

  // Barbarian
  f('barbarian', 'redcap_knives', 'Redcap Knives', 'common', '[[mob_rule]] grants 20% per friendly adjacent to the target instead of 15%, up to 60% instead of 45%.', ['Goblin']),
  f('barbarian', 'split_fang_bridle', 'Split-Fang Bridle', 'common', '[[double_strike]]’s second hit deals 75% of a normal hit instead of 50%.', ['Wolf Rider']),
  f('barbarian', 'red_fletched_arrows', 'Red-Fletched Arrows', 'common', 'A [[marking_shot|Marked]] target takes 45% more ranged damage instead of 30%.', ['Orc']),
  f('barbarian', 'headsmans_cleaver', "Headsman's Cleaver", 'common', '[[follow_through]] passes on all of the overkill instead of half, to the weakest enemy beside the attacker.', ['Ogre']),
  f('barbarian', 'ironbound_horns', 'Ironbound Horns', 'common', '[[battering_ram]] charges from 2 cells instead of 3, and a target with nowhere to be pushed takes 50% of the hit instead of 25%.', ['Ram Rider']),
  f('barbarian', 'shaped_stones', 'Shaped Stones', 'common', '[[boulder_burst]] splashes for 75% instead of 50%, or 100% against a [[marking_shot|Marked]] primary.', ['Cyclops']),
  f('barbarian', 'storm_spurs', 'Storm Spurs', 'common', '[[thunder_dive]] charges from 3 cells instead of 4, and splashes 75% instead of 50%.', ['Thunderbird']),
  f('barbarian', 'broken_maw_chain', 'Broken Maw Chain', 'common', 'Each consecutive [[rampage]] kill adds 25% damage, uncapped. A turn without a kill clears it.', ['Behemoth']),
  f('barbarian', 'map_of_the_first_raid', 'Map of the First Raid', 'rare', '[[banner_of_the_first_raid]] grants +4 Speed instead of +2.'),
  f('barbarian', 'banner_of_no_return', 'Banner of No Return', 'rare', '[[banner_of_the_first_raid]] grants 50% more damage instead of 30%.'),
  f('barbarian', 'butchers_pennant', "Butcher's Pennant", 'rare', 'A kill on an [[banner_of_the_first_raid|empowered]] turn buys that stack one more empowered turn, and chains while it keeps killing.'),
  f('barbarian', 'black_fletched_quiver', 'Black-Fletched Quiver', 'rare', 'Orc and Cyclops gain 3 extra shots and stop taking the half-damage penalty for shooting beyond their range.', ['Orc', 'Cyclops']),
  f('barbarian', 'spotters_monocle', "Spotter's Monocle", 'rare', '[[marking_shot]] also Marks the enemies surrounding its target.', ['Orc']),
  f('barbarian', 'horde_drum', 'Horde Drum', 'rare', 'Whenever an enemy stack [[perished|perishes]], every friendly stack except the one currently acting advances 10% [[atb]].'),
  f('barbarian', 'bronze_war_horn', 'Bronze War Horn', 'rare', 'Charge! grants +4 Speed instead of +2, and 40% more melee damage instead of 25%.'),
  f('barbarian', 'horn_of_the_hunt', 'Volley Horn', 'rare', 'Loose! grants 75% more ranged damage instead of 40%, and [[marking_shot|Marks]] the target before the damage lands.'),
  f('barbarian', 'skull_trumpet', 'Skull Trumpet', 'rare', 'Blood for Blood! grants 75% more outgoing damage instead of 50%. You still take 50% more in return.'),
  f('barbarian', 'bloodletter_axe', 'Bloodletter Axe', 'rare', 'The Barbarian hero’s normal attack deals 300% damage.'),
  f('barbarian', 'red_sunrise', 'Red Sunrise', 'epic', '[[banner_of_the_first_raid]] empowers the first 2 turns instead of 1.'),
  f('barbarian', 'endless_hunt', "Killer's Momentum", 'epic', 'When a Barbarian melee stack kills its primary target, it returns at 50% [[atb]].'),
  f('barbarian', 'rain_of_iron', 'Rain of Iron', 'epic', 'Ranged attacks splash 50%, or 75% against a [[marking_shot|Marked]] primary.', ['Orc', 'Cyclops']),
  f('barbarian', 'voice_of_the_warchief', 'Voice of the Warchief', 'epic', 'Each Battle Cry has 2 uses. After using one, the Barbarian hero returns at 50% [[atb]].'),
  f('barbarian', 'worldsplitter', 'Worldsplitter', 'epic', 'The Barbarian hero’s normal attack deals 500% damage. If the target survives, it becomes Marked for Death and takes 20% more damage from all sources.'),

  // Wizard
  f('wizard', 'ratchet_loader', 'Ratchet Loader', 'common', 'When [[scrap_frenzy]] triggers, Gremlin returns at 65% [[atb]] instead of 50%.', ['Gremlin']),
  f('wizard', 'tinkers_kit', "Tinker's Kit", 'common', '[[repair]] may target any wounded friendly stack, not only [[construct|Constructs]]. It cannot revive a [[perished]] stack.', ['Gremlin']),
  f('wizard', 'hexfield_core', 'Hexfield Core', 'common', '[[weakness_aura]] triples adjacent magic damage instead of doubling it.', ['Stone Golem']),
  f('wizard', 'pressurised_bile_sac', 'Pressurised Bile Sac', 'common', '[[caustic_breath]] hits only enemies and travels 5 cells instead of 3.', ['Bilehorn']),
  f('wizard', 'storm_fletching', 'Storm Conductor', 'common', '[[lightning_strike]] hits only enemies and its splash deals 90% instead of 75%.', ['Titan']),
  f('wizard', 'conduit_array', 'Conduit Array', 'rare', 'Stacks adjacent to a Mage inherit [[armour_piercing]].', ['Mage']),
  f('wizard', 'prism_of_the_fallen', 'Prism of the Fallen', 'rare', 'At the start of its turn, the hero gains 20% damage for every [[perished]] stack from either army.'),
  f('wizard', 'overcharged_rods', 'Overcharged Rods', 'rare', '[[lightning_strike]] hits only enemies, and surviving targets cannot retaliate until their next turn.', ['Titan']),
  f('wizard', 'vitriol_catalyst', 'Vitriol Catalyst', 'rare', 'Corroded stacks take 50% more magic damage.', ['Bilehorn']),
  f('wizard', 'serpents_coil', "Serpent's Coil", 'rare', 'Naga [[double_strike]] applies to retaliations too.', ['Naga']),
  f('wizard', 'stormcrown', 'Stormcrown', 'epic', '[[lightning_strike]] hits only enemies in a 5×5 area instead of 3×3; its splash deals 50% damage.', ['Titan']),
  f('wizard', 'animus_engine', 'The Animus Engine', 'epic', 'Once per battle for each [[perished]] friendly [[construct]], [[repair]] may revive 1 creature in that stack.', ['Gremlin']),
  f('wizard', 'codex_of_the_unbound', 'Codex of the Unbound', 'epic', '[[armour_piercing]] attacks deal 5% more damage.', ['Mage']),
  f('wizard', 'scroll_of_slowing', 'Scroll of Slowing', 'common', 'Adds [[slow]] to the hero’s spellbook.'),
  f('wizard', 'tome_of_chain_lightning', 'Tome of Chain Lightning', 'rare', 'Adds [[chain_lightning]] to the hero’s spellbook.'),
  f('wizard', 'sigil_of_resurrection', 'Sigil of Resurrection', 'epic', 'Adds [[resurrect]] to the hero’s spellbook.'),
  f('wizard', 'tome_of_the_blizzard', 'Tome of the Blizzard', 'epic', 'Adds [[blizzard]] to the hero’s spellbook.'),

  // Demon
  f('demon', 'powder_keg', 'Powder Keg', 'common', '[[cinderburst]] deals 40% of the stack’s starting total HP to nearby enemies instead of 25%.', ['Imp']),
  f('demon', 'sulfurous_pitch', 'Sulfurous Pitch', 'common', '[[hellfire_shot]] hits only enemies and its splash deals 75% instead of 50%.', ['Gog']),
  f('demon', 'brass_collar', 'Brass Collar', 'common', '[[three_headed_strike]] side bites deal 75% instead of 50%.', ['Hell Hound']),
  f('demon', 'brimstone_key', 'Brimstone Key', 'common', 'The Demon unit’s normal [[gate]] summons 5 Imps per living creature instead of 3.', ['Demon']),
  f('demon', 'blood_chalice', 'Overflowing Chalice', 'common', '[[overfeed]] stores twice the [[life_drain]] healing received beyond full health as damage for Blood Fiend’s next primary attack.', ['Blood Fiend']),
  f('demon', 'cracked_hourglass', 'Cracked Hourglass', 'common', '[[haste_ritual]] grants +3 Initiative instead of +2.', ['Pit Fiend']),
  f('demon', 'furnace_heart', 'Furnace Heart', 'rare', 'When a burning enemy stack [[perished|perishes]], its [[burn]] spreads to adjacent enemies that are not immune to Fire.'),
  f('demon', 'blackened_wick', 'Blackened Wick', 'rare', '[[burn]] ticks deal double damage.'),
  f('demon', 'gatekeepers_chain', "Gatekeeper's Chain", 'rare', 'The Demon unit’s normal [[gate]] gains a second use. The second summon contains half as many Imps, rounded up.', ['Demon']),
  f('demon', 'feastmasters_hook', "Feastmaster's Hook", 'rare', '[[life_drain]] heals 100% of the damage dealt against burning targets.', ['Blood Fiend']),
  f('demon', 'tormentors_brand', "Tormentor's Brand", 'rare', '[[torment_aura]] reduces enemy damage by 35% instead of 20%, and Speed by 1.', ['Pit Fiend']),
  f('demon', 'ashen_covenant', 'Ashen Covenant', 'rare', 'The first time each friendly Demon-faction stack [[perished|perishes]], every other living friendly stack advances 10% [[atb]].'),
  f('demon', 'devils_contract', "Devil's Contract", 'rare', 'When Devil’s [[doomstep]] kills its primary target, Devil returns at 50% [[atb]].', ['Devil']),
  f('demon', 'mouth_of_hell', 'Mouth of Hell', 'epic', 'Every non-summoned Demon-faction stack gains one use of [[gate]], summoning Imps whose combined HP equals 25% of that stack’s starting total HP, rounded up. The Demon unit gains this use in addition to its normal Gate.'),
  f('demon', 'crown_of_wildfire', 'Crown of Wildfire', 'epic', '[[burn]] damage from repeated applications adds up rather than replacing, uncapped, and each one resets it to 2 rounds.'),
  f('demon', 'brand_of_damnation', 'Brand of Damnation', 'epic', 'Your army’s [[direct_attack|direct attacks]] deal double damage to [[burn|burning]] stacks.'),
  f('demon', 'seal_of_the_ninth_circle', 'Seal of the Ninth Circle', 'epic', 'The first time each starting Demon-faction stack [[perished|perishes]], it returns with 30% of its starting creatures, or 60% if it has [[infernal_rebirth]].'),
  f('demon', 'hells_verdict', "Hell's Verdict", 'epic', '[[doomstep]] against a burning target deals 50% of the primary attack’s damage as Fire damage to every adjacent enemy.', ['Devil']),

  // Necromancer
  f('necromancer', 'marrow_crown', 'Marrow Crown', 'common', '[[gravewrights_grimoire]] Skeletons arrive halfway to their first turn instead of waiting the full cycle.'),
  f('necromancer', 'plague_bell', 'Plague Bell', 'common', 'Gravewright’s Grimoire raises twice as many creatures from enemies afflicted by [[infecting_strike]].', ['Zombie']),
  f('necromancer', 'wailing_lantern', 'Wailing Lantern', 'common', '[[drain_morale]] removes 2 Morale instead of 1.', ['Ghost']),
  f('necromancer', 'crimson_needle', 'Crimson Needle', 'common', '[[blood_frenzy]] grants +4 damage per wound instead of +2.', ['Blood Acolyte']),
  f('necromancer', 'chalice_of_night', 'Chalice of Night', 'common', 'Vampire [[life_drain]] heals 150% of damage dealt instead of 100% when attacking a target with an [[affliction]].', ['Vampire']),
  f('necromancer', 'withered_quiver', 'Withered Quiver', 'common', '[[curse_shot]] also applies −5 Defense.', ['Lich']),
  f('necromancer', 'reapers_tack', "Reaper's Tack", 'common', '[[soul_reaper]] claims 2 additional creatures.', ['Black Knight']),
  f('necromancer', 'vertebral_key', 'Vertebral Key', 'common', 'After Bone Dragon uses [[absorb_skeleton]], it returns at 50% [[atb]].', ['Bone Dragon']),
  f('necromancer', 'book_of_grudges', 'Book of Grudges', 'rare', 'Every stack you own deals 15% more damage per [[affliction]] on the target.'),
  f('necromancer', 'blighted_soil', 'Blighted Soil', 'rare', 'When an enemy stack carrying [[infecting_strike]] [[perished|perishes]], it spreads Infecting Strike to adjacent enemies.', ['Zombie']),
  f('necromancer', 'blood_tithe', 'Blood Tithe', 'rare', 'Every 6 HP of [[life_drain]] healing beyond full raises a Skeleton.', ['Blood Acolyte', 'Vampire']),
  f('necromancer', 'funeral_drum', 'Funeral Drum', 'rare', 'For every 5 friendly Skeletons lost, every living non-Skeleton Necromancer stack advances 10% [[atb]]. Leftovers carry over.'),
  f('necromancer', 'empty_throne', 'Empty Throne', 'rare', 'Enemies at −3 Morale cannot retaliate and take 50% more damage.', ['Ghost']),
  f('necromancer', 'knights_reliquary', "Knight's Reliquary", 'rare', '[[soul_reaper]] kills rise as Skeletons.', ['Black Knight']),
  f('necromancer', 'shroud_of_preservation', 'Shroud of Preservation', 'rare', 'When a friendly Skeleton stack [[perished|perishes]], half the creatures it had immediately before the killing blow, rounded down, join your largest surviving Skeleton stack.', ['Skeleton']),
  item('dragon_ossuary', { name: 'Dragon Ossuary', description: '[[gravewrights_grimoire]] raises Bone Dragons instead of Skeletons.', rarity: 'epic', faction: 'necromancer', upgrades: 'gravewrights_grimoire' }),
  f('necromancer', 'crown_of_ruin', 'Crown of Ruin', 'epic', '[[infecting_strike]], [[curse_shot|Curse]] and [[drain_morale|Morale Drain]] apply twice.'),
  f('necromancer', 'red_moon_covenant', 'Red Moon Covenant', 'epic', '[[blood_frenzy]]’s per-wound damage bonus and [[life_drain]] healing are doubled.', ['Blood Acolyte', 'Vampire']),
  f('necromancer', 'the_black_procession', 'The Black Procession', 'epic', 'Every friendly Skeleton permanently gains [[infecting_strike]] and [[drain_morale]].'),
];

const starters = [
  item('wayfarers_compass', { name: "Wayfarer's Compass", description: 'After a Ranger stack takes a move-only action of at least 3 cells, it returns at 50% [[atb]].', rarity: 'default', faction: 'ranger', starterForFaction: 'ranger' }),
  item('banner_of_the_first_raid', { name: 'Banner of the First Raid', description: 'Starting stacks gain +2 Speed and 30% more damage during their first turn. That is an empowered turn.', rarity: 'default', faction: 'barbarian', starterForFaction: 'barbarian' }),
  item('gravewrights_grimoire', { name: "Gravewright's Grimoire", description: 'When an enemy stack [[perished|perishes]], it raises temporary Skeletons from 10% of its starting total HP.', rarity: 'default', faction: 'necromancer', starterForFaction: 'necromancer' }),
];

export const ITEMS: Record<ItemId, ItemDef> = Object.fromEntries([
  ...legacy.map(([id, name, rarity, description, stats]) => [id, item(id, { name, description, rarity, stats, legacy: true })]),
  ...starters.map(def => [def.id, def]),
  ...factionItems.map(def => [def.id, def]),
]);

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const RARITY_WEIGHT: Record<ItemRarity, number> = { default: 0, common: 60, rare: 35, epic: 5 };
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
