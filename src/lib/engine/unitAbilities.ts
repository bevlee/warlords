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

import type { BattleEvent, BattleState, UnitStack } from './types.ts';
import { applyHeal } from './combat.ts';

export interface AbilityResolution {
  /** Replacement stacks, keyed by id. Stacks left out are untouched. */
  units: UnitStack[];
  events: BattleEvent[];
}

export interface UnitAbility {
  /** Whether the situation allows it — resources, targets, wounds. Assumes the
   *  actor is a stack that owns this ability; callers go through canActivate,
   *  which checks that first. */
  canUse(state: BattleState, actor: UnitStack): boolean;
  resolve(state: BattleState, actor: UnitStack): AbilityResolution;
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
export function canActivate(state: BattleState, actor: UnitStack, abilityId: string): boolean {
  const ability = UNIT_ABILITIES[abilityId];
  return (
    !actor.isHero &&
    !!ability &&
    actor.definition.abilities.includes(abilityId) &&
    ability.canUse(state, actor)
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
      };

      return {
        units: [healedActor, eaten],
        events: [
          { type: 'status', data: { effect: 'absorbed', unitId: eaten.id, consumed } },
          {
            type: 'status',
            data: { effect: 'absorb', unitId: healedActor.id, consumed, heal: healed, revived, topHp: revived > 0 ? healedActor.hp : healedActor.hp - actor.hp },
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
