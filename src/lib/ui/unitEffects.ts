import type {
  BattleState,
  CombatEffect,
  Hero,
  TargetMark,
  UnitModifierStat,
  UnitStack,
} from '$lib/engine/types';
import { chebyshevDistance } from '$lib/engine/grid';
import { artifactIdsFor, controllerOfUnit } from '$lib/engine/artifacts';

export type EffectTone = 'buff' | 'debuff' | 'status';

export interface UnitEffect {
  id: string;
  label: string;
  value?: string;
  detail?: string;
  tone: EffectTone;
}

export function signedModifier(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

function numericEffect(id: string, label: string, value: number, detail?: string): UnitEffect | null {
  if (value === 0) return null;
  return {
    id,
    label,
    value: signedModifier(value),
    detail,
    tone: value < 0 ? 'debuff' : 'buff',
  };
}

const STAT_LABEL: Record<UnitModifierStat, string> = {
  attack: 'ATK',
  defense: 'DEF',
  damage: 'DMG',
  initiative: 'INIT',
  speed: 'SPEED',
  morale: 'MORALE',
  luck: 'LUCK',
};

const STAT_ORDER: UnitModifierStat[] = [
  'attack', 'defense', 'damage', 'initiative', 'speed', 'morale', 'luck',
];

interface EffectCopy {
  label: string;
  detail: string;
  value?: (effect: CombatEffect, unit: UnitStack) => string | undefined;
}

const COMBAT_EFFECT_COPY: Record<string, EffectCopy> = {
  barbed_volley: {
    label: 'Barbed Volley',
    detail: 'Defence is reduced until this unit’s next turn.',
  },
  bind: {
    label: 'Dendroid — Bind',
    detail: 'Cannot move while the Dendroid that bound it remains in place.',
  },
  blind: {
    label: 'Unicorn — Blind on Hit',
    detail: 'This unit will skip its next turn.',
  },
  bloodlust: {
    label: 'Bloodlust',
    detail: 'Attack is increased for the rest of this combat.',
  },
  braced: {
    label: 'Braced',
    value: () => 'DMG TAKEN −30%',
    detail: 'Takes 30% less damage until its next turn.',
  },
  burn: {
    label: 'Burning',
    value: (_effect, unit) => `−${unit.burnDamage ?? 0} HP`,
    detail: 'Takes fire magic damage at the start of each turn.',
  },
  corroded: {
    label: 'Corroded',
    value: () => 'MAGIC DEF IGNORED',
    detail: 'Defence cannot reduce incoming magic damage.',
  },
  cry_blood_for_blood: {
    label: 'Battle Cry — Blood for Blood',
    value: effect => {
      const outgoing = percentAboveOne(effect.data?.outgoing);
      const incoming = percentAboveOne(effect.data?.incoming);
      return `OUT +${outgoing}% · IN +${incoming}%`;
    },
    detail: 'Deals more damage and takes more damage until the Barbarian hero’s next turn.',
  },
  cry_charge: {
    label: 'Battle Cry — Charge!',
    value: effect => `SPEED ${signedModifier(asNumber(effect.data?.speed))} · DMG +${percentAboveOne(effect.data?.damageMultiplier)}%`,
    detail: 'Empowers this melee unit until its next turn.',
  },
  cry_loose: {
    label: 'Battle Cry — Loose!',
    value: effect => `RANGED DMG +${percentAboveOne(effect.data?.damageMultiplier)}%`,
    detail: 'Its next ranged attack costs no ammunition.',
  },
  curse: {
    label: 'Lich — Curse Shot',
    detail: 'Attack and Defence reductions last for the rest of this combat.',
  },
  demonic_bargain: {
    label: 'Demonic Bargain',
    value: () => 'DMG ×2',
    detail: 'Its next attack deals double damage and cannot be retaliated against.',
  },
  drain_morale: {
    label: 'Ghost — Drain Morale',
    detail: 'Morale is reduced for the rest of this combat.',
  },
  focus: {
    label: 'Focus',
    detail: 'A permanent combat buff earned by spending this unit’s turn.',
  },
  grasping_dead: {
    label: 'Grasping Dead',
    detail: 'Cannot move or retaliate until its next turn.',
  },
  infect: {
    label: 'Zombie — Infecting Strike',
    detail: 'Attack and Defence reductions last for the rest of this combat.',
  },
  negative_immunity: {
    label: 'Consecrated Censer',
    detail: 'Cannot receive new negative effects until its next turn.',
  },
  overcharged_rods: {
    label: 'Overcharged Rods',
    detail: 'Cannot retaliate until its next turn.',
  },
  pinning_shot: {
    label: 'Pinning Shot',
    value: effect => `SPEED ${signedModifier(asNumber(effect.data?.speed))}`,
    detail: 'Speed is reduced until this unit’s next turn; repeated hits stack to −6.',
  },
  pollen_veil: {
    label: 'Pollen Veil',
    value: () => 'RANGED TAKEN −50%',
    detail: 'Takes 50% less ranged damage until its next turn.',
  },
  slow: {
    label: 'Slowed',
    detail: 'Speed and/or Initiative is reduced until this unit’s next turn.',
  },
  stoneskin: {
    label: 'Stoneskin',
    detail: 'Defence is increased for the rest of this combat.',
  },
};

const MARK_COPY: Record<TargetMark['kind'], { label: string; detail: string }> = {
  quarry: {
    label: 'Name the Quarry',
    detail: 'Each allied unit’s first damaging attack against this target brings that attacker’s next turn 10% sooner.',
  },
  ranged_mark: {
    label: 'Ranged Mark',
    detail: 'Takes increased ranged damage from every unit allied with the marking unit.',
  },
  marked_for_death: {
    label: 'Marked for Death',
    detail: 'Takes 20% more damage from every unit allied with the marking unit.',
  },
};

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function percentAboveOne(value: unknown): number {
  return Math.round((asNumber(value, 1) - 1) * 100);
}

function remainingDetail(effect: CombatEffect): string | undefined {
  const targetTurns = effect.expires?.targetTurnsRemaining;
  if (targetTurns !== undefined) {
    return `${targetTurns} ${targetTurns === 1 ? 'turn' : 'turns'} remaining.`;
  }
  const sourceTurns = effect.expires?.sourceTurnsRemaining;
  if (sourceTurns !== undefined) {
    return `${sourceTurns} source ${sourceTurns === 1 ? 'turn' : 'turns'} remaining.`;
  }
  return undefined;
}

function joinDetail(...parts: Array<string | undefined>): string | undefined {
  const present = parts.filter((part): part is string => !!part);
  return present.length ? present.join(' ') : undefined;
}

function statsValue(stats: Partial<Record<UnitModifierStat, number>> | undefined): string | undefined {
  const values = STAT_ORDER
    .filter(stat => stats?.[stat] !== undefined && stats[stat] !== 0)
    .map(stat => `${STAT_LABEL[stat]} ${signedModifier(stats![stat]!)}`);
  return values.length ? values.join(' · ') : undefined;
}

function sourceEffect(
  source: NonNullable<UnitStack['modifierSources']>[number],
  combatEffect: CombatEffect | undefined,
): UnitEffect {
  const values = STAT_ORDER
    .filter(stat => source.stats[stat] !== undefined && source.stats[stat] !== 0)
    .map(stat => `${STAT_LABEL[stat]} ${signedModifier(source.stats[stat]!)}`);
  const numeric = Object.values(source.stats).filter(value => value !== undefined && value !== 0);
  const tone: EffectTone = numeric.every(value => value > 0)
    ? 'buff'
    : numeric.every(value => value < 0)
      ? 'debuff'
      : 'status';
  return {
    id: `source:${source.id}`,
    label: `${COMBAT_EFFECT_COPY[combatEffect?.kind ?? '']?.label ?? source.label}${source.stacks > 1 ? ` ×${source.stacks}` : ''}`,
    value: values.join(' · '),
    detail: combatEffect
      ? joinDetail(COMBAT_EFFECT_COPY[combatEffect.kind]?.detail, remainingDetail(combatEffect))
      : undefined,
    tone,
  };
}

function combatEffect(effect: CombatEffect, unit: UnitStack): UnitEffect {
  const copy = COMBAT_EFFECT_COPY[effect.kind];
  const label = copy?.label ?? effect.kind.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return {
    id: `effect:${effect.id}:${effect.sourceStackId ?? 'none'}`,
    label: `${label}${effect.stacks > 1 ? ` ×${effect.stacks}` : ''}`,
    value: copy?.value?.(effect, unit) ?? statsValue(effect.stats),
    detail: joinDetail(copy?.detail, remainingDetail(effect)),
    tone: effect.positive ? 'buff' : 'debuff',
  };
}

function markEffect(mark: TargetMark, battle: BattleState | null): UnitEffect {
  const artifacts = battle?.artifacts?.[mark.sourceControllerId] ?? [];
  const value = mark.kind === 'ranged_mark'
    ? `RANGED TAKEN +${artifacts.includes('red_fletched_arrows') ? 45 : 30}%`
    : mark.kind === 'marked_for_death'
      ? 'DMG TAKEN +20%'
      : undefined;
  const triggered = mark.kind === 'quarry' && (mark.triggeredBy?.length ?? 0) > 0
    ? `${mark.triggeredBy!.length} ${mark.triggeredBy!.length === 1 ? 'attacker has' : 'attackers have'} claimed the advance.`
    : undefined;
  return {
    id: `mark:${mark.kind}:${mark.ownerTeamId}`,
    label: MARK_COPY[mark.kind].label,
    value,
    detail: joinDetail(MARK_COPY[mark.kind].detail, triggered),
    tone: 'debuff',
  };
}

/**
 * Every live, battle-scoped change represented on a UnitStack. This is kept as
 * a pure projection of engine state so the info panel cannot drift from the
 * values combat and turn order actually use.
 */
export function activeEffects(
  unit: UnitStack,
  hero: Hero | null = null,
  battle: BattleState | null = null,
): UnitEffect[] {
  if (unit.isHero) return [];

  const effects: UnitEffect[] = [];
  const add = (effect: UnitEffect | null) => {
    if (effect) effects.push(effect);
  };

  if (unit.side === 'player' && hero) {
    if (hero.attack !== 0) {
      effects.push({
        id: 'hero-attack',
        label: 'Hero — Attack bonus',
        value: `ATK ${signedModifier(hero.attack)}`,
        detail: 'Your hero adds their Attack stat to every friendly stack.',
        tone: hero.attack < 0 ? 'debuff' : 'buff',
      });
    }
  }

  const controllerStats = battle?.controllerStats?.[controllerOfUnit(unit)];
  if (controllerStats && (controllerStats.attack !== 0 || controllerStats.defense !== 0)) {
    const values = [
      controllerStats.attack !== 0 ? `ATK ${signedModifier(controllerStats.attack)}` : null,
      controllerStats.defense !== 0 ? `DEF ${signedModifier(controllerStats.defense)}` : null,
    ].filter((value): value is string => value !== null);
    const numeric = [controllerStats.attack, controllerStats.defense].filter(value => value !== 0);
    effects.push({
      id: `controller-stats:${controllerOfUnit(unit)}`,
      label: controllerStats.label ?? 'Controller bonus',
      value: values.join(' · '),
      detail: 'Encounter-wide bonus included in this stack’s effective Attack and Defence.',
      tone: numeric.every(value => value > 0)
        ? 'buff'
        : numeric.every(value => value < 0)
          ? 'debuff'
          : 'status',
    });
  }

  const combatEffects = unit.effects ?? [];
  const sources = unit.modifierSources ?? [];
  effects.push(...sources.map(source => sourceEffect(
    source,
    combatEffects.find(effect => effect.id === source.id),
  )));
  const representedEffectIds = new Set(sources.map(source => source.id));
  effects.push(...combatEffects
    .filter(effect => !representedEffectIds.has(effect.id))
    .map(effect => combatEffect(effect, unit)));
  effects.push(...(unit.marks ?? []).map(mark => markEffect(mark, battle)));

  const empoweredTurns = unit.empoweredTurnsRemaining ?? 0;
  const bannerSpeed = asNumber(unit.abilityState?.bannerSpeed);
  if (empoweredTurns > 0) {
    const artifacts = battle ? artifactIdsFor(battle, unit) : [];
    const damage = artifacts.includes('banner_of_no_return') ? 50 : 30;
    effects.push({
      id: 'banner-of-the-first-raid',
      label: 'Banner of the First Raid',
      value: `SPEED +${bannerSpeed || 2} · DMG +${damage}%`,
      detail: `Active during this unit’s opening ${empoweredTurns === 1 ? 'turn' : `${empoweredTurns} turns`}; ${empoweredTurns} ${empoweredTurns === 1 ? 'turn' : 'turns'} remaining.`,
      tone: 'buff',
    });
  }

  // Old saved battles and hand-authored test states may predate the source
  // ledger. Keep their modifiers visible, clearly marked as an unknown cause,
  // without duplicating stats already explained by a named source.
  const hasSourceFor = (stat: UnitModifierStat) =>
    sources.some(source => (source.stats[stat] ?? 0) !== 0) ||
    (stat === 'speed' && empoweredTurns > 0 && bannerSpeed !== 0);
  if (!hasSourceFor('attack')) add(numericEffect('attack', 'Other attack modifier', unit.attackBuff ?? 0));
  if (!hasSourceFor('defense')) add(numericEffect('defense', 'Other defense modifier', unit.defenseBuff ?? 0));
  if (!hasSourceFor('damage')) add(numericEffect('damage', 'Other damage modifier', unit.damageBonus ?? 0));
  if (!hasSourceFor('initiative')) add(numericEffect('initiative', 'Other initiative modifier', unit.initiativeBonus ?? 0));
  if (!hasSourceFor('speed')) {
    add(numericEffect('speed-bonus', 'Other speed modifier', unit.speedBonus ?? 0));
    add(numericEffect('speed-penalty', 'Other speed penalty', -(unit.speedPenalty ?? 0)));
  }
  if (!hasSourceFor('morale')) add(numericEffect('morale', 'Other morale modifier', unit.morale));
  if (!hasSourceFor('luck')) add(numericEffect('luck', 'Other luck modifier', unit.luck));

  if (unit.isDefending) {
    effects.push({
      id: 'defending',
      label: 'Defending',
      value: '+30% DEF',
      detail: 'Active until this stack’s next turn.',
      tone: 'buff',
    });
  }

  if (unit.definition.abilities.includes('jousting') && unit.lastMovedFrom) {
    const distance = unit.lastMovedDistance ?? chebyshevDistance(unit.pos, unit.lastMovedFrom);
    if (distance > 0) {
      effects.push({
        id: 'jousting',
        label: 'Jousting momentum',
        value: `+${distance * 5}% DMG`,
        detail: `${distance} ${distance === 1 ? 'tile' : 'tiles'} moved before the next attack.`,
        tone: 'buff',
      });
    }
  }

  if (unit.blindedUntilRound !== undefined && !combatEffects.some(effect => effect.kind === 'blind')) {
    effects.push({
      id: 'blind',
      label: 'Unicorn — Blind on Hit',
      detail: 'This stack will skip its next turn.',
      tone: 'debuff',
    });
  }
  if ((unit.burnRoundsLeft ?? 0) > 0 && !combatEffects.some(effect => effect.kind === 'burn')) {
    const turns = unit.burnRoundsLeft ?? 0;
    effects.push({
      id: 'burn',
      label: 'Efreet — Burn',
      value: `−${unit.burnDamage ?? 0} HP`,
      detail: `Damage at turn start; ${turns} ${turns === 1 ? 'turn' : 'turns'} remaining.`,
      tone: 'debuff',
    });
  }
  if (unit.boundUntilRound !== undefined && !combatEffects.some(effect => effect.kind === 'bind')) {
    effects.push({
      id: 'bound',
      label: 'Dendroid — Bind',
      detail: 'Cannot move on its next turn.',
      tone: 'debuff',
    });
  }

  return effects;
}
