// Human-readable name + explanation for every ability string used across the
// faction unit definitions (src/lib/engine/*.ts). Keep in sync with new
// abilities added there — this is the only place they're described for the UI.
export const ABILITY_INFO: Record<string, { label: string; description: string }> = {
  no_retaliation: {
    label: 'No retaliation',
    description: 'Targets this unit hits cannot [[retaliation|retaliate]].',
  },
  unlimited_retaliation: {
    label: 'Unlimited retaliation',
    description: 'Can [[retaliation|retaliate]] against every attack in a turn, not just the first.',
  },
  flying: {
    label: 'Flying',
    description: 'Moves over obstacles and other units in a straight line to any reachable cell.',
  },
  jousting: {
    label: 'Jousting',
    description: 'Deals bonus melee damage for each cell moved before striking.',
  },
  death_blow: {
    label: 'Death blow',
    description: 'Chance to deal double damage on a melee hit.',
  },
  defense_reduction: {
    label: 'Defense reduction',
    description: "Ignores a portion of the target's defense when calculating damage.",
  },
  double_shot: {
    label: 'Double shot',
    description: 'Fires twice per shooting attack, consuming two shots.',
  },
  curse_shot: {
    label: 'Curse shot',
    description: 'Every shot curses its target for −5 attack for the rest of the battle, stacking.',
  },
  life_drain: {
    label: 'Life drain',
    description: 'Heals this stack for a portion of the damage it deals.',
  },
  slow_on_hit: {
    label: 'Slow on hit',
    description: 'Chance to reduce the target’s movement range until its next turn.',
  },
  infecting_strike: {
    label: 'Infecting strike',
    description: 'Every hit rots the target for −5 attack and −5 defense for the rest of the battle, stacking.',
  },
  soul_reaper: {
    label: 'Soul reaper',
    description: 'Every melee blow claims one creature beyond what its damage would kill.',
  },
  blood_frenzy: {
    label: 'Blood frenzy',
    description: 'Each wound it survives raises its minimum and maximum damage by 2 for the rest of the battle.',
  },
  absorb_skeleton: {
    label: 'Absorb skeleton',
    description:
      'Active: devours your largest Skeleton stack, each Skeleton healing a full Bone Dragon’s ' +
      'worth of health. Takes only as many as it can use, up to one per Bone Dragon in the ' +
      'stack. Uses the turn.',
  },
  drain_morale: {
    label: 'Drain morale',
    description: "Lowers the target's [[morale]], making it more likely to freeze and skip a turn.",
  },
  blind_on_hit: {
    label: 'Blind on hit',
    description: 'Chance to blind the target, causing it to skip its next turn.',
  },
  burn: {
    label: 'Burn',
    description: 'Sets the target on fire — it takes ongoing damage at the start of its turns.',
  },
  bind: {
    label: 'Bind',
    description: "Roots the target in place, preventing it from moving on its next turn.",
  },
  no_melee_penalty: {
    label: 'No melee penalty',
    description: 'Shoots at full damage even when an enemy is adjacent.',
  },
  magic_resistance: {
    label: 'Magic resistance',
    description: 'Reduced chance to be affected by enemy spells.',
  },
  fire_immunity: {
    label: 'Fire immunity',
    description: 'Takes no damage from fire-based attacks or burning.',
  },
  undead: {
    label: 'Undead',
    description: 'Immune to [[morale]] effects and mind-affecting spells; cannot be healed normally.',
  },
  gate: {
    label: 'Gate',
    description: 'Can summon reinforcements from its home dimension during battle.',
  },
  teleport: {
    label: 'Teleport',
    description: 'Can move to any reachable cell on the battlefield in a single step.',
  },
  cast_haste: {
    label: 'Cast haste',
    description: 'Occasionally casts Haste on a friendly stack.',
  },
  // Run-taught unit skills (gauntlet skill drafts).
  double_strike: {
    label: 'Double strike',
    description: 'Melee attacks land a second blow after the retaliation.',
  },
  fleet_footwork: {
    label: 'Fleet footwork',
    description: '+1 speed.',
  },
  bravery: {
    label: 'Bravery',
    description: '+1 morale.',
  },
  militia: { label: 'Militia', description: '+1 Attack and Defense per 10 living Peasants, uncapped.' },
  spearwall: { label: 'Spearwall', description: 'Enemy [[grand_joust]] bonuses do not apply against this stack.' },
  area_shot: { label: 'Area Shot', description: 'Each shot hits every stack in the target 3×3 area for 50% damage, including friendlies.' },
  large_shield: { label: 'Large Shield', description: 'Takes 50% less damage from ranged creature attacks.' },
  focus: { label: 'Focus', description: 'Active: spend the turn to permanently gain +1 Initiative and +1 minimum/maximum damage.' },
  cleanse: { label: 'Cleanse', description: 'Active: remove every removable negative effect from a friendly stack. No cooldown.' },
  claim_blessing: { label: 'Claim Blessing', description: 'Damaging hits steal one of the target’s temporary buffs. Abilities it was born with cannot be taken.' },
  gallop: { label: 'Gallop', description: 'A move-only action of at least 3 cells costs half a turn.' },
  ride_by_attack: { label: 'Ride-By Attack', description: 'Active: [[charge]] at least 3 cells, deal 50% more damage without [[retaliation]], then return. Cooldown 2.' },
  grand_joust: { label: 'Grand Joust', description: '+20% melee damage per cell moved; a [[charge]] of 3+ cells prevents [[retaliation]].' },
  overrun: { label: 'Overrun', description: 'Melee attacks also hit the enemy directly behind the [[primary_target|primary target]], for 50% of the damage.' },
  darting_assault: { label: 'Darting Assault', description: 'Move and attack without [[retaliation]], then return to the starting cell.' },
  pinning_shot: { label: 'Pinning Shot', description: 'Shots apply −2 Speed until the target finishes its next turn, stacking to −6.' },
  first_strike: { label: 'First Strike', description: 'Deals 75% more melee damage to an enemy that has not taken a turn.' },
  sheltering_boughs: { label: 'Sheltering Boughs', description: 'Adjacent shooters take 30% less damage and may shoot while [[engaged]].' },
  soaring_strike: { label: 'Soaring Strike', description: 'After a turn with no enemy adjacent, Pegasus is Soaring: its next attack deals 75% more damage without [[retaliation]].' },
  focus_fire: { label: 'Focus Fire', description: 'Consecutive arrows against one target gain 25% damage, up to 100%.' },
  executioner: { label: 'Executioner', description: 'Deals double damage to a [[stack]] at or below half its starting count.' },
  relentless: { label: 'Relentless', description: 'A [[primary_target|primary]] melee kill returns this stack at 50% [[atb]] — its next turn comes twice as soon.' },
  fortunes_herald: { label: "Fortune's Herald", description: 'Friendly Ranger stacks gain +1 [[luck]]; a lucky strike also cleanses that stack and brings its next turn 25% sooner.' },
  mob_rule: { label: 'Mob Rule', description: '+15% melee damage per friendly stack adjacent to the target, up to 45%.' },
  blood_rush: { label: 'Blood Rush', description: 'A [[primary_target|primary]] melee kill returns Goblin at 50% [[atb]].' },
  pounce: { label: 'Pounce', description: 'A [[charge]] of at least 3 cells prevents [[retaliation]].' },
  marking_shot: { label: 'Marking Shot', description: 'Surviving targets become Marked for all friendly ranged attackers, who then deal 30% more ranged damage to them.' },
  quickdraw: { label: 'Quickdraw', description: 'A first-turn ranged attack returns Orc at 50% [[atb]].' },
  bully: { label: 'Bully', description: 'Deals 50% more melee damage to stacks of a lower [[tier]].' },
  follow_through: { label: 'Follow Through', description: 'A [[primary_target|primary]] kill passes half its [[overkill]] to a nearby enemy.' },
  battering_ram: { label: 'Battering Ram', description: 'A 3-cell [[charge]] deals 50% more damage and pushes the target 1 cell. A target with nowhere to go takes 25% collision damage instead.' },
  boulder_burst: { label: 'Boulder Burst', description: 'Shots splash 50% damage to surrounding enemies.' },
  marked_quarry: { label: 'Marked Quarry', description: 'Cyclops gains stronger primary and splash damage against [[marking_shot|Marked]] targets.' },
  thunder_dive: { label: 'Thunder Dive', description: 'A 4-cell [[charge]] splashes Lightning damage and prevents [[retaliation]].' },
  rampage: { label: 'Rampage', description: 'A [[primary_target|primary]] melee kill returns Behemoth at 100% [[atb]] — it acts again immediately.' },
  repair: { label: 'Repair', description: 'Active: restore health and revive creatures in a wounded friendly [[construct]].' },
  scrap_frenzy: { label: 'Scrap Frenzy', description: 'A shot that kills a creature returns Gremlin at 50% [[atb]].' },
  weakness_aura: { label: 'Weakness Aura', description: 'Magic damage is doubled for units in all 8 adjacent cells.' },
  arcane_conduit: { label: 'Arcane Conduit', description: 'While alive, the Wizard hero deals 10% more spell damage. Does not stack.' },
  combat_casting: { label: 'Combat Casting', description: 'May shoot while [[engaged]], at half damage.' },
  caustic_breath: { label: 'Caustic Breath', description: 'Active: a 3-cell Acid line for 75% damage with friendly fire; applies [[corrosive_carapace|Corroded]] for 3 turns. Cooldown 2.' },
  corrosive_carapace: { label: 'Corrosive Carapace', description: 'A melee attacker that survives becomes Corroded for 3 turns, taking 50% more magic damage.' },
  crushing_blows: { label: 'Crushing Blows', description: 'Reduces target Defense by 30% when attacking.' },
  shockwave: { label: 'Shockwave', description: 'Melee hits deal 50% damage to enemies adjacent to the target.' },
  boulder_throw: { label: 'Boulder Throw', description: 'Has 2 ranged shots with range 8.' },
  armour_piercing: { label: 'Armour-Piercing', description: 'Defense cannot reduce this stack’s damage; the attacker’s Attack still helps.' },
  lightning_strike: { label: 'Lightning Strike', description: 'Shots splash 75% Lightning damage in 3×3, including friendlies.' },
  kindling: { label: 'Kindling', description: 'Successful primary melee attacks apply [[burn]].' },
  cinderburst: { label: 'Cinderburst', description: 'When this stack [[perished|perishes]], nearby enemies take Fire damage equal to 25% of its starting total HP.' },
  hellfire_shot: { label: 'Hellfire Shot', description: 'Shots splash 50% Fire damage in 3×3, including friendlies.' },
  ignition: { label: 'Ignition', description: '[[hellfire_shot]] survivors receive [[burn]].' },
  three_headed_strike: { label: 'Three-Headed Strike', description: 'Melee attacks bite up to two surrounding enemies for 50%.' },
  infernal_rebirth: { label: 'Infernal Rebirth', description: 'The first time this stack [[perished|perishes]], it returns with 30% of its starting creatures.' },
  overfeed: { label: 'Overfeed', description: 'Excess [[life_drain]] healing becomes damage for the next primary attack.' },
  haste_ritual: { label: 'Haste Ritual', description: 'Active once: friendly Demon stacks permanently gain +2 Initiative.' },
  torment_aura: { label: 'Torment Aura', description: '[[burn|Burning]] enemies deal 20% less damage while a friendly Pit Fiend lives.' },
  living_flame: { label: 'Living Flame', description: 'Immune to Fire and [[burn]]; primary melee attacks apply it in turn.' },
  doomstep: { label: 'Doomstep', description: 'Primary melee attacks against [[burn|burning]] targets deal double damage without retaliation.' },
  weapon_training: { label: 'Weapon Training', description: 'Adds the gauntlet node number to this stack’s Attack — +1 at the first node, +10 at the last.' },
  armour_training: { label: 'Armour Training', description: 'Adds the gauntlet node number to this stack’s Defense — +1 at the first node, +10 at the last.' },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

/** Level-aware label + magnitude text for the leveled abilities
 *  (engine/abilityCatalog.ts). Ids not listed here render statically. */
const LEVELED_TEXT: Record<string, { label: string; describe: (level: number) => string }> = {
  life_drain: {
    label: 'Lifesteal',
    describe: l => `Heals ${l * 10}% of the damage this stack deals.`,
  },
  defense_reduction: {
    label: 'Defense reduction',
    describe: l => `Reduces the target's defense by ${l * 5}%.`,
  },
  bravery: { label: 'Bravery', describe: l => `+${l} morale.` },
  fleet_footwork: { label: 'Fleet footwork', describe: l => `+${l} speed.` },
};

export function abilityInfo(ability: string, level?: number): { label: string; description: string } {
  const leveled = LEVELED_TEXT[ability];
  if (leveled && level && level > 0) {
    return {
      label: level > 1 ? `${leveled.label} ${ROMAN[level] ?? level}` : leveled.label,
      description: leveled.describe(level),
    };
  }
  return (
    ABILITY_INFO[ability] ?? {
      label: ability.replaceAll('_', ' '),
      description: 'No description available.',
    }
  );
}
