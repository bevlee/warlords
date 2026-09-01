import type { BattleState, CombatEffect, UnitStack } from './types.ts';
import type { Rng } from './rng.ts';

function applyEffectStats(stack: UnitStack, effect: CombatEffect, direction: 1 | -1): UnitStack {
  const stats = effect.stats ?? {};
  return {
    ...stack,
    attackBuff: (stack.attackBuff ?? 0) + direction * (stats.attack ?? 0),
    defenseBuff: (stack.defenseBuff ?? 0) + direction * (stats.defense ?? 0),
    damageBonus: (stack.damageBonus ?? 0) + direction * (stats.damage ?? 0),
    initiativeBonus: (stack.initiativeBonus ?? 0) + direction * (stats.initiative ?? 0),
    speedBonus: (stack.speedBonus ?? 0) + direction * (stats.speed ?? 0),
    morale: Math.max(-3, Math.min(3, stack.morale + direction * (stats.morale ?? 0))),
    luck: Math.max(-3, Math.min(3, stack.luck + direction * (stats.luck ?? 0))),
  };
}

function removeOneModifierSource(stack: UnitStack, effectId: string): UnitStack {
  const sources = [...(stack.modifierSources ?? [])];
  const index = sources.findIndex(source => source.id === effectId);
  if (index >= 0) sources.splice(index, 1);
  return { ...stack, modifierSources: sources };
}

export function addEffect(stack: UnitStack, effect: CombatEffect, refresh = true): UnitStack {
  const effects = [...(stack.effects ?? [])];
  const index = effects.findIndex(current => current.id === effect.id && current.sourceStackId === effect.sourceStackId);
  if (index >= 0 && refresh) effects[index] = effect;
  else effects.push(effect);
  return { ...stack, effects };
}

export function removeEffect(stack: UnitStack, id: string): UnitStack {
  return { ...stack, effects: (stack.effects ?? []).filter(effect => effect.id !== id) };
}

export function cleanse(stack: UnitStack): { stack: UnitStack; removed: CombatEffect[] } {
  const removed = (stack.effects ?? []).filter(effect => !effect.positive && effect.removable);
  const effects = (stack.effects ?? []).filter(effect => effect.positive || !effect.removable);
  let cleaned = removed.reduce(
    (current, effect) => removeOneModifierSource(applyEffectStats(current, effect, -1), effect.id),
    stack,
  );
  cleaned = {
    ...cleaned,
    effects,
    boundUntilRound: undefined,
    blindedUntilRound: undefined,
    burnDamage: undefined,
    burnRoundsLeft: undefined,
    burnSourceId: undefined,
  };
  return { stack: cleaned, removed };
}

/** Remove the oldest removable negative effect. Array order is application
 * order, which is stable in the serialized battle state. */
export function cleanseOldest(stack: UnitStack): { stack: UnitStack; removed?: CombatEffect } {
  const removed = (stack.effects ?? []).find(effect => !effect.positive && effect.removable);
  if (!removed) return { stack };
  let cleaned = removeOneModifierSource(applyEffectStats(stack, removed, -1), removed.id);
  cleaned = { ...cleaned, effects: (stack.effects ?? []).filter(effect => effect !== removed) };
  if (removed.kind === 'burn') cleaned = { ...cleaned, burnDamage: undefined, burnRoundsLeft: undefined, burnSourceId: undefined };
  if (removed.kind === 'blind') cleaned = { ...cleaned, blindedUntilRound: undefined };
  if (removed.kind === 'bind') cleaned = { ...cleaned, boundUntilRound: undefined };
  return { stack: cleaned, removed };
}

export function stealRandomBuff(target: UnitStack, recipient: UnitStack, rng: Rng): {
  target: UnitStack;
  recipient: UnitStack;
  stolen?: CombatEffect;
} {
  const candidates = (target.effects ?? []).filter(effect => effect.positive && !effect.innate);
  if (!candidates.length) return { target, recipient };
  const stolen = candidates[Math.floor(rng() * candidates.length)];
  const stripped = applyEffectStats(target, stolen, -1);
  const granted = applyEffectStats(recipient, stolen, 1);
  return {
    target: { ...stripped, effects: (target.effects ?? []).filter(effect => effect !== stolen), modifierSources: (target.modifierSources ?? []).filter(source => source.id !== stolen.id) },
    recipient: addEffect({ ...granted, modifierSources: [...(granted.modifierSources ?? []), { id: stolen.id, label: `Stolen ${stolen.kind}`, stats: stolen.stats ?? {}, stacks: 1 }] }, { ...stolen, sourceStackId: recipient.id }),
    stolen,
  };
}

export function tickTargetEffects(stack: UnitStack, phase: 'start' | 'end' = 'end'): UnitStack {
  let updated = stack;
  const effects = (stack.effects ?? []).flatMap(effect => {
    const remaining = effect.expires?.targetTurnsRemaining;
    if (remaining === undefined) return [effect];
    if ((effect.expires?.phase ?? 'end') !== phase) return [effect];
    if (remaining <= 1) {
      updated = removeOneModifierSource(applyEffectStats(updated, effect, -1), effect.id);
      return [];
    }
    return [{ ...effect, expires: { ...effect.expires, targetTurnsRemaining: remaining - 1 } }];
  });
  return { ...updated, effects };
}

export function replaceUnit(state: BattleState, stack: UnitStack): BattleState {
  return { ...state, units: state.units.map(unit => unit.id === stack.id ? stack : unit) };
}
