import type { BattleAction, BattleEvent, BattleState, CombatEffect, UnitStack } from './types.ts';
import { addEffect } from './effects.ts';
import { addMark } from './marks.ts';
import { alliedTeamId, controllerOfUnit, hasArtifact } from './artifacts.ts';
import { applyDamage, applyHeal } from './combat.ts';
import { resolveDamagePacket } from './combat.ts';
import { rngFor } from './rng.ts';

export interface HeroActionResolution { state: BattleState; events: BattleEvent[]; reentry?: number }
const sameController = (a: UnitStack, b: UnitStack) => controllerOfUnit(a) === controllerOfUnit(b);
const effect = (id: string, kind: string, data: CombatEffect['data'], expires?: CombatEffect['expires']): CombatEffect => ({
  id, kind, positive: true, innate: true, removable: false, stacks: 1, data, expires,
});

function updateControllerState(state: BattleState, controller: string, patch: Record<string, unknown>): BattleState {
  return {
    ...state,
    heroActionState: {
      ...(state.heroActionState ?? {}),
      [controller]: { ...(state.heroActionState?.[controller] ?? {}), ...patch } as Record<string, never>,
    },
  };
}

function skeletonStack(state: BattleState, actor: UnitStack): UnitStack | undefined {
  return state.units.filter(unit => unit.count > 0 && unit.definition.name === 'Skeleton' && sameController(actor, unit))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0];
}

function consumeSkeletons(state: BattleState, stack: UnitStack, count: number): BattleState {
  const left = Math.max(0, stack.count - count);
  return { ...state, units: state.units.map(unit => unit.id === stack.id ? {
    ...unit,
    count: left,
    hp: left ? unit.hp : 0,
    ...(left === 0 ? { abilityState: { ...(unit.abilityState ?? {}), consumedDeath: true } } : {}),
  } : unit) };
}

export function resolveHeroAction(state: BattleState, actor: UnitStack, action: Extract<BattleAction, { type: 'hero_action' }>): HeroActionResolution {
  const controller = controllerOfUnit(actor);
  const hero = actor.controllerId ? state.heroes?.[actor.controllerId] ?? state.hero : state.hero;
  let next = state;
  const events: BattleEvent[] = [];
  const target = action.targetId ? state.units.find(unit => unit.id === action.targetId && unit.count > 0 && !unit.isHero) : undefined;

  if (hero.class === 'knight') {
    next = updateControllerState(next, controller, { activeOrder: action.actionId });
    if (action.actionId === 'ready_the_counterattack') {
      next = { ...next, units: next.units.map(unit => sameController(actor, unit) && !unit.isHero
        ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), counterattackUsed: false } }
        : unit) };
    }
  } else if (hero.class === 'ranger') {
    if (action.actionId === 'name_the_quarry' && target) {
      const marked = addMark(target, { kind: 'quarry', ownerTeamId: alliedTeamId(state, actor), sourceControllerId: controller, sourceId: actor.id, triggeredBy: [], expires: { sourceTurnsRemaining: 1 } });
      next = { ...next, units: next.units.map(unit => unit.id === target.id ? marked : unit) };
    }
    next = updateControllerState(next, controller, { activePlan: action.actionId, targetId: action.targetId ?? null, area: action.area ?? [], planId: state.actionSeq ?? 0 });
  } else if (hero.class === 'barbarian') {
    const current = next.heroActionState?.[controller] ?? {};
    const uses = Number(current[`${action.actionId}Uses`] ?? 0);
    const maxUses = hasArtifact(state, actor, 'voice_of_the_warchief') ? 2 : 1;
    if (uses >= maxUses) return { state, events: [] };
    const allies = next.units.filter(unit => unit.count > 0 && !unit.isHero && sameController(actor, unit));
    next = { ...next, units: next.units.map(unit => {
      if (!allies.some(ally => ally.id === unit.id)) return unit;
      if (action.actionId === 'charge' && unit.definition.shots === 0) return addEffect(unit, { ...effect('cry_charge', 'cry_charge', { speed: hasArtifact(state, actor, 'bronze_war_horn') ? 4 : 2, damageMultiplier: hasArtifact(state, actor, 'bronze_war_horn') ? 1.4 : 1.25 }, { targetTurnsRemaining: 1 }), sourceStackId: actor.id, sourceControllerId: controller });
      if (action.actionId === 'loose' && unit.definition.shots > 0) return addEffect(unit, { ...effect('cry_loose', 'cry_loose', { damageMultiplier: hasArtifact(state, actor, 'horn_of_the_hunt') ? 1.75 : 1.4, freeAmmo: true }), sourceStackId: actor.id, sourceControllerId: controller });
      if (action.actionId === 'blood_for_blood') return addEffect(unit, { ...effect('cry_blood_for_blood', 'cry_blood_for_blood', { outgoing: hasArtifact(state, actor, 'skull_trumpet') ? 1.75 : 1.5, incoming: 1.5 }, { sourceTurnsRemaining: 1 }), sourceStackId: actor.id, sourceControllerId: controller });
      return unit;
    }) };
    next = updateControllerState(next, controller, { [`${action.actionId}Uses`]: uses + 1, lastCry: action.actionId });
  } else if (hero.class === 'demon' && target) {
    if (action.actionId === 'blood_offering' && sameController(actor, target)) {
      const sacrificed = Math.max(1, Math.ceil(target.count * 0.1));
      const hit = applyDamage(target, target.hp + Math.max(0, sacrificed - 1) * target.definition.hp);
      next = { ...next, units: next.units.map(unit => unit.id === target.id ? hit.remaining : sameController(actor, unit) && !unit.isHero ? { ...unit, atb: Math.min(1, unit.atb + (target.origin?.type === 'summoned' ? 0.05 : 0.1)) } : unit) };
      events.push({ type: 'status', data: { effect: 'blood_offering', unitId: target.id, sacrificed } });
    } else if (action.actionId === 'feed_the_fire' && (target.burnRoundsLeft ?? 0) > 0) {
      const burnSource = target.burnSourceId ? next.units.find(unit => unit.id === target.burnSourceId) : undefined;
      const multiplier = burnSource && hasArtifact(next, burnSource, 'blackened_wick') ? 2 : 1;
      const hit = resolveDamagePacket(next, {
        sourceId: target.burnSourceId ?? actor.id, targetId: target.id,
        amount: (target.burnDamage ?? 3 * (state.gauntletRound ?? 1)) * multiplier,
        type: 'magic', attributes: ['fire'], delivery: 'dot', ranged: false,
        direct: false, canTriggerOnHit: false, canLifeDrain: false,
      }, rngFor(state.seed, state.actionSeq ?? 0, 'damage', 'feed_the_fire', target.id));
      const remainingTicks = Math.max(0, (target.burnRoundsLeft ?? 0) - 1);
      const consumed = {
        ...hit.target,
        burnRoundsLeft: remainingTicks || undefined,
        burnDamage: remainingTicks ? target.burnDamage : undefined,
        burnSourceId: remainingTicks ? target.burnSourceId : undefined,
      };
      const spreadDamage = 3 * (state.gauntletRound ?? 1);
      next = { ...next, units: next.units.map(unit => {
        if (unit.id === target.id) return consumed;
        const adjacent = unit.count > 0 && !unit.isHero && Math.max(Math.abs(unit.pos.col - target.pos.col), Math.abs(unit.pos.row - target.pos.row)) === 1;
        if (!adjacent || unit.definition.abilities.includes('fire_immunity')) return unit;
        return { ...unit, burnDamage: hasArtifact(state, actor, 'crown_of_wildfire') ? (unit.burnDamage ?? 0) + spreadDamage : spreadDamage, burnRoundsLeft: 2, burnSourceId: actor.id };
      }) };
      events.push({ type: 'status', data: { effect: 'feed_the_fire', unitId: target.id, damage: hit.outcome.finalDamage, resisted: hit.outcome.resisted } });
    } else if (action.actionId === 'demonic_bargain' && sameController(actor, target)) {
      const damage = Math.ceil(target.startCount * target.definition.hp * 0.2);
      const hit = applyDamage(target, damage);
      const bargained = hit.remaining.count > 0 ? addEffect(hit.remaining, effect('demonic_bargain', 'demonic_bargain', { damageMultiplier: 2, noRetaliation: true }, { targetTurnsRemaining: 1 })) : hit.remaining;
      next = { ...next, units: next.units.map(unit => unit.id === target.id ? bargained : unit) };
    }
  } else if (hero.class === 'necromancer') {
    const skeletons = skeletonStack(next, actor);
    if (!skeletons) return { state, events: [] };
    if (action.actionId === 'reknit_the_dead' && target && sameController(actor, target) && target.definition.name !== 'Skeleton') {
      const missing = target.startCount * target.definition.hp - ((target.count - 1) * target.definition.hp + target.hp);
      const perSkeleton = Math.max(1, Math.round(target.definition.hp * 0.25));
      const used = Math.min(5, skeletons.count, Math.ceil(missing / perSkeleton));
      const healed = applyHeal(target, used * perSkeleton);
      next = consumeSkeletons(next, skeletons, used);
      next = { ...next, units: next.units.map(unit => unit.id === target.id ? healed.stack : unit) };
    } else if (action.actionId === 'grasping_dead' && target && target.side !== actor.side && skeletons.count >= 5) {
      next = consumeSkeletons(next, skeletons, 5);
      const grasped = addEffect(target, { ...effect('grasping_dead', 'grasping_dead', { noMove: true, noRetaliation: true }, { targetTurnsRemaining: 1 }), positive: false, removable: true });
      next = { ...next, units: next.units.map(unit => unit.id === target.id ? grasped : unit) };
    } else if (action.actionId === 'death_march' && skeletons.count >= 10) {
      next = consumeSkeletons(next, skeletons, 10);
      next = { ...next, units: next.units.map(unit => sameController(actor, unit) && !unit.isHero && unit.definition.name !== 'Skeleton' ? { ...unit, atb: Math.min(1, unit.atb + 0.2) } : unit) };
    } else return { state, events: [] };
  }

  events.push({ type: 'status', data: { effect: 'hero_action', actionId: action.actionId, casterId: actor.id, targetId: action.targetId } });
  return { state: next, events, reentry: hasArtifact(state, actor, 'voice_of_the_warchief') && hero.class === 'barbarian' ? 0.5 : 0 };
}
