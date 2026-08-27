import type { Hero, UnitModifierStat, UnitStack } from '$lib/engine/types';
import { chebyshevDistance } from '$lib/engine/grid';

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

function sourceEffect(source: NonNullable<UnitStack['modifierSources']>[number]): UnitEffect {
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
    label: `${source.label}${source.stacks > 1 ? ` ×${source.stacks}` : ''}`,
    value: values.join(' · '),
    tone,
  };
}

/**
 * Every live, battle-scoped change represented on a UnitStack. This is kept as
 * a pure projection of engine state so the info panel cannot drift from the
 * values combat and turn order actually use.
 */
export function activeEffects(unit: UnitStack, hero: Hero | null = null): UnitEffect[] {
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

  const sources = unit.modifierSources ?? [];
  effects.push(...sources.map(sourceEffect));

  // Old saved battles and hand-authored test states may predate the source
  // ledger. Keep their modifiers visible, clearly marked as an unknown cause,
  // without duplicating stats already explained by a named source.
  const hasSourceFor = (stat: UnitModifierStat) => sources.some(source => (source.stats[stat] ?? 0) !== 0);
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
    const distance = chebyshevDistance(unit.pos, unit.lastMovedFrom);
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

  if (unit.blindedUntilRound !== undefined) {
    effects.push({
      id: 'blind',
      label: 'Unicorn — Blind on Hit',
      detail: 'This stack will skip its next turn.',
      tone: 'debuff',
    });
  }
  if ((unit.burnRoundsLeft ?? 0) > 0) {
    const turns = unit.burnRoundsLeft ?? 0;
    effects.push({
      id: 'burn',
      label: 'Efreet — Burn',
      value: `−${unit.burnDamage ?? 0} HP`,
      detail: `Damage at turn start; ${turns} ${turns === 1 ? 'turn' : 'turns'} remaining.`,
      tone: 'debuff',
    });
  }
  if (unit.boundUntilRound !== undefined) {
    effects.push({
      id: 'bound',
      label: 'Dendroid — Bind',
      detail: 'Cannot move on its next turn.',
      tone: 'debuff',
    });
  }

  return effects;
}
