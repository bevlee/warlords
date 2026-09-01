// Activated unit abilities: things a stack spends its own turn doing, as
// opposed to the passive abilities that ride along on an attack.
//
// Deliberately separate from SPELLS (engine/battle.ts). A spell is hero-only,
// paid for in hero mana, and targeted by side; an activated unit ability is
// none of those — it belongs to the stack, spends whatever resource it likes,
// and picks its own target. Folding these into SpellId would mean bypassing the
// isHero gate, the mana check and the friendly/hostile flag one by one, which
// is the spell system in name only.
//
// Resolution returns a units patch plus log entries rather than a whole
// BattleState: grid bookkeeping, deaths and turn advance stay in applyAction,
// so an ability can never forget to clear a vacated cell.

import type { BattleEvent, BattleState, Pos, UnitStack } from './types.ts';
import { applyHeal } from './combat.ts';
import { abilityReady } from './cooldowns.ts';
import { addModifierSource } from './unitModifiers.ts';
import { addEffect, cleanse } from './effects.ts';
import { hasArtifact } from './artifacts.ts';
import { getReachableCells } from './selectors.ts';

export interface AbilityResolution {
  /** Replacement stacks, keyed by id. Stacks left out are untouched. */
  units: UnitStack[];
  events: BattleEvent[];
}

export interface UnitAbility {
  /** Whether the situation allows it — resources, targets, wounds. Assumes the
   *  actor is a stack that owns this ability; callers go through canActivate,
   *  which checks that first. */
  canUse(state: BattleState, actor: UnitStack, targetId?: string, to?: Pos): boolean;
  resolve(state: BattleState, actor: UnitStack, targetId?: string, to?: Pos): AbilityResolution;
}

/**
 * Whether `actor` may activate `abilityId` right now — the whole rule, in one
 * place, for the engine, the co-op server and the battle UI alike.
 *
 * `canUse` on its own is not enough: it answers "does the situation allow it",
 * and trusts that the ability belongs to a stack that owns it. The three checks
 * ahead of it establish that trust, and each catches a different kind of bad
 * request — a hero acting like a stack, an id no ability answers to, and a unit
 * claiming an ability its definition never granted.
 */
export function canActivate(state: BattleState, actor: UnitStack, abilityId: string, targetId?: string, to?: Pos): boolean {
  const ability = UNIT_ABILITIES[abilityId];
  return (
    !actor.isHero &&
    !!ability &&
    actor.definition.abilities.includes(abilityId) &&
    abilityReady(actor, abilityId) &&
    ability.canUse(state, actor, targetId, to)
  );
}

/** Stacks under the same banner as `actor`: same side, same summoned-ally
 *  status, same co-op controller. A Bone Dragon eats its own side's Skeletons,
 *  never its partner's. */
function sameBanner(a: UnitStack, b: UnitStack): boolean {
  return a.side === b.side && !!a.isAlly === !!b.isAlly && a.controllerId === b.controllerId;
}

/** The fullest friendly Skeleton stack — absorb always drains the biggest one
 *  so the player never has to shop around for the right pile of bones. */
function largestSkeletonStack(state: BattleState, actor: UnitStack): UnitStack | undefined {
  return state.units
    .filter(u => u.count > 0 && !u.isHero && u.definition.name === 'Skeleton' && sameBanner(actor, u))
    .reduce<UnitStack | undefined>((best, u) => (best && best.count >= u.count ? best : u), undefined);
}

/** Whether the stack has anything to heal: creatures lost, or a wounded leader. */
function isWounded(stack: UnitStack): boolean {
  return stack.count < stack.startCount || stack.hp < stack.definition.hp;
}

export const UNIT_ABILITIES: Record<string, UnitAbility> = {
  focus: {
    canUse: (_state, actor) => actor.count > 0,
    resolve(_state, actor) {
      const applyFocus = (unit: UnitStack): UnitStack => {
        const unitAttackDefense = hasArtifact(_state, unit, 'drillmasters_manual') ? 1 : 0;
        const base = addModifierSource(
        {
          ...unit,
          attackBuff: (unit.attackBuff ?? 0) + unitAttackDefense,
          defenseBuff: (unit.defenseBuff ?? 0) + unitAttackDefense,
          initiativeBonus: (unit.initiativeBonus ?? 0) + 1,
          damageBonus: (unit.damageBonus ?? 0) + 1,
          abilityState: { ...(unit.abilityState ?? {}), focusStacks: Number(unit.abilityState?.focusStacks ?? 0) + 1 },
        },
        { id: 'focus', label: 'Focus', stats: { initiative: 1, damage: 1, ...(unitAttackDefense ? { attack: 1, defense: 1 } : {}) } },
        );
        return addEffect(base, {
        id: 'focus', kind: 'focus', sourceStackId: unit.id, sourceControllerId: unit.controllerId,
        positive: true, innate: false, removable: true, stacks: 1,
        stats: { initiative: 1, damage: 1, ...(unitAttackDefense ? { attack: 1, defense: 1 } : {}) },
      }, false);
      };
      const units = hasArtifact(_state, actor, 'manual_of_perfect_form')
        ? _state.units.filter(unit => unit.count > 0 && unit.definition.name === 'Swordsman' && sameBanner(actor, unit)).map(applyFocus)
        : [applyFocus(actor)];
      return { units, events: [{ type: 'status', data: { effect: 'focus', unitId: actor.id, affected: units.map(unit => unit.id) } }] };
    },
  },
  cleanse: {
    canUse(state, actor, targetId) {
      const target = state.units.find(unit => unit.id === targetId);
      return !!target && target.count > 0 && !target.isHero && sameBanner(actor, target);
    },
    resolve(state, actor, targetId) {
      const target = state.units.find(unit => unit.id === targetId)!;
      const result = cleanse(target);
      const protectedTarget: UnitStack = hasArtifact(state, actor, 'consecrated_censer')
        ? { ...result.stack, effects: [...(result.stack.effects ?? []), { id: 'consecrated_censer', kind: 'negative_immunity', positive: true, innate: true, removable: false, stacks: 1, expires: { targetTurnsRemaining: 1, phase: 'start' } }] }
        : result.stack;
      return {
        units: [protectedTarget],
        events: [{ type: 'status', data: { effect: 'cleanse', unitId: target.id, removed: result.removed.map(effect => effect.kind) } }],
      };
    },
  },
  repair: {
    canUse(state, actor, targetId) {
      const constructs = ['Stone Golem', 'Siege Golem', 'Giant', 'Titan'];
      const target = targetId
        ? state.units.find(unit => unit.id === targetId)
        : state.units.filter(unit => unit.count > 0 && sameBanner(actor, unit) && constructs.includes(unit.definition.name))
          .sort((a, b) => (a.count * a.definition.hp + a.hp) - (b.count * b.definition.hp + b.hp))[0];
      if (!target || target.isHero || !sameBanner(actor, target) || (!hasArtifact(state, actor, 'tinkers_kit') && !constructs.includes(target.definition.name))) return false;
      if (target.count <= 0) {
        return constructs.includes(target.definition.name) && hasArtifact(state, actor, 'animus_engine') && !target.abilityState?.animusRebuilt &&
          !state.grid.cells[target.pos.row]?.[target.pos.col]?.occupantId;
      }
      return isWounded(target);
    },
    resolve(state, actor, targetId) {
      const constructs = ['Stone Golem', 'Siege Golem', 'Giant', 'Titan'];
      const target = targetId
        ? state.units.find(unit => unit.id === targetId)!
        : state.units.filter(unit => unit.count > 0 && sameBanner(actor, unit) && constructs.includes(unit.definition.name) && isWounded(unit))
          .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (target.count <= 0 && hasArtifact(state, actor, 'animus_engine')) {
        const rebuilt: UnitStack = {
          ...target,
          count: 1,
          hp: target.definition.hp,
          atb: 0,
          abilityState: { ...(target.abilityState ?? {}), animusRebuilt: true, deathProcessed: false },
        };
        return { units: [rebuilt], events: [{ type: 'status', data: { effect: 'animus_engine', unitId: target.id, rebuilt: 1 } }] };
      }
      const healed = applyHeal(target, actor.count * 5);
      return { units: [healed.stack], events: [{ type: 'status', data: { effect: 'repair', unitId: target.id, heal: healed.healed, revived: healed.revived } }] };
    },
  },
  ride_by_attack: {
    canUse(state, actor, targetId, to) {
      const target = state.units.find(unit => unit.id === targetId && unit.count > 0 && unit.side !== actor.side && !unit.isHero);
      if (!target || !to) return false;
      const distance = Math.max(Math.abs(to.col - actor.pos.col), Math.abs(to.row - actor.pos.row));
      return distance >= 3 && Math.max(Math.abs(to.col - target.pos.col), Math.abs(to.row - target.pos.row)) === 1 &&
        getReachableCells(state.grid, actor, state).some(cell => cell.col === to.col && cell.row === to.row);
    },
    resolve: (_state, actor) => ({ units: [actor], events: [] }),
  },
  caustic_breath: {
    canUse(state, actor, _targetId, to) {
      return !!to && !!state.grid.cells[to.row]?.[to.col] && Math.max(Math.abs(to.col - actor.pos.col), Math.abs(to.row - actor.pos.row)) === 1;
    },
    resolve: (_state, actor) => ({ units: [actor], events: [] }),
  },
  gate: {
    canUse(state, actor, _targetId, to) {
      const cell = to && state.grid.cells[to.row]?.[to.col];
      const baseUses = actor.definition.abilities.includes('infernal_rebirth') ? (hasArtifact(state, actor, 'gatekeepers_chain') ? 2 : 1) : 0;
      const mouthUses = hasArtifact(state, actor, 'mouth_of_hell') && actor.origin?.type !== 'summoned' ? 1 : 0;
      return !!cell && !cell.blocked && !cell.occupantId && Math.max(Math.abs(to!.col - actor.pos.col), Math.abs(to!.row - actor.pos.row)) === 1 &&
        Number(actor.abilityState?.gateUses ?? 0) < baseUses + mouthUses;
    },
    resolve: (_state, actor) => ({ units: [actor], events: [] }),
  },
  haste_ritual: {
    canUse: (_state, actor) => !actor.abilityState?.hasteRitualUsed,
    resolve(state, actor) {
      const bonus = hasArtifact(state, actor, 'cracked_hourglass') ? 3 : 2;
      const units = state.units.filter(unit => unit.count > 0 && sameBanner(actor, unit) && !unit.isHero).map(unit => addModifierSource(
        { ...unit, initiativeBonus: (unit.initiativeBonus ?? 0) + bonus, ...(unit.id === actor.id ? { abilityState: { ...(unit.abilityState ?? {}), hasteRitualUsed: true } } : {}) },
        { id: 'haste_ritual', label: 'Haste Ritual', stats: { initiative: bonus } },
      ));
      return { units, events: [{ type: 'status', data: { effect: 'haste_ritual', unitId: actor.id, bonus } }] };
    },
  },
  /**
   * Bone Dragon absorb_skeleton: devour Skeletons to knit itself back together,
   * each one worth a whole Bone Dragon's HP, drawn from the largest friendly
   * Skeleton stack. A fully mauled flight can be restored in a single turn.
   *
   * It eats what it can use and no more: at most one Skeleton per Bone Dragon
   * in the starting stack, and never more than it takes to reach full health.
   * One survivor of ten therefore swallows nine, not ten.
   */
  absorb_skeleton: {
    canUse(state, actor) {
      return (
        actor.count > 0 &&
        isWounded(actor) &&
        largestSkeletonStack(state, actor) !== undefined
      );
    },
    resolve(state, actor) {
      const skeletons = largestSkeletonStack(state, actor);
      if (!skeletons) return { units: [], events: [] };

      const fullHp = actor.definition.hp;
      const missing = actor.startCount * fullHp - ((actor.count - 1) * fullHp + actor.hp);
      const consumed = Math.min(actor.startCount, skeletons.count, Math.ceil(missing / fullHp));
      const { stack: healedActor, healed, revived } = applyHeal(actor, consumed * fullHp);
      // Creatures are eaten off the bottom of the pile, so the lead Skeleton's
      // partial HP survives — unless the whole stack goes.
      const remainingCount = skeletons.count - consumed;
      const eaten: UnitStack = {
        ...skeletons,
        count: remainingCount,
        hp: remainingCount > 0 ? skeletons.hp : 0,
        ...(remainingCount === 0 ? { abilityState: { ...(skeletons.abilityState ?? {}), consumedDeath: true } } : {}),
      };

      const returningActor = hasArtifact(state, actor, 'vertebral_key') ? { ...healedActor, atb: 0.5 } : healedActor;
      return {
        units: [returningActor, eaten],
        events: [
          { type: 'status', data: { effect: 'absorbed', unitId: eaten.id, consumed } },
          {
            type: 'status',
            data: { effect: 'absorb', unitId: returningActor.id, consumed, heal: healed, revived, topHp: revived > 0 ? returningActor.hp : returningActor.hp - actor.hp },
          },
        ],
      };
    },
  },
};

/** Activated abilities this stack could use at all, ignoring current state.
 *  Drives which buttons the battle UI offers for the acting unit. */
export function activatedAbilitiesOf(unit: UnitStack): string[] {
  return unit.definition.abilities.filter(id => id in UNIT_ABILITIES);
}
