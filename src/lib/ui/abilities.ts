// Human-readable name + explanation for every ability string used across the
// faction unit definitions (src/lib/engine/*.ts). Keep in sync with new
// abilities added there — this is the only place they're described for the UI.
export const ABILITY_INFO: Record<string, { label: string; description: string }> = {
  no_retaliation: {
    label: 'No retaliation',
    description: 'Targets this unit hits cannot retaliate.',
  },
  unlimited_retaliation: {
    label: 'Unlimited retaliation',
    description: 'Can retaliate against every attack in a turn, not just the first.',
  },
  flying: {
    label: 'Flying',
    description: 'Moves over obstacles and other units in a straight line to any reachable tile.',
  },
  jousting: {
    label: 'Jousting',
    description: 'Deals bonus melee damage for each tile moved before striking.',
  },
  death_blow: {
    label: 'Death blow',
    description: 'Chance to deal double damage on a melee hit.',
  },
  death_stare: {
    label: 'Death stare',
    description: 'Small chance to instantly destroy several creatures in the target stack.',
  },
  defense_reduction: {
    label: 'Defense reduction',
    description: "Ignores a portion of the target's defense when calculating damage.",
  },
  double_shot: {
    label: 'Double shot',
    description: 'Fires twice per shooting attack, consuming two shots.',
  },
  area_shot: {
    label: 'Area shot',
    description: 'Splash damage: nearby enemy stacks take partial damage too.',
  },
  life_drain: {
    label: 'Life drain',
    description: 'Heals this stack for a portion of the damage it deals.',
  },
  slow_on_hit: {
    label: 'Slow on hit',
    description: 'Chance to reduce the target’s movement range until its next turn.',
  },
  drain_morale: {
    label: 'Drain morale',
    description: "Lowers the target's morale, making it more likely to freeze and skip a turn.",
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
    description: 'Immune to morale effects and mind-affecting spells; cannot be healed normally.',
  },
  gate: {
    label: 'Gate',
    description: 'Can summon reinforcements from its home dimension during battle.',
  },
  teleport: {
    label: 'Teleport',
    description: 'Can move to any reachable tile on the battlefield in a single step.',
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
};

export function abilityInfo(ability: string): { label: string; description: string } {
  return (
    ABILITY_INFO[ability] ?? {
      label: ability.replaceAll('_', ' '),
      description: 'No description available.',
    }
  );
}
