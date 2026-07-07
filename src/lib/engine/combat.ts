import type { UnitStack, Hero } from './types';
import type { Rng } from './rng';
import { chebyshevDistance } from './grid';

/**
 * HoMM3-style damage formula.
 * effectiveAttack = attacker.definition.attack + attacker bonuses + hero.attack
 * effectiveDefense = defender.definition.defense (hero.defense doesn't apply to enemies)
 */
/** Stack damage for a given per-creature roll, through the attack/defense modifier. */
export function modifiedDamage(
  attacker: UnitStack,
  defender: UnitStack,
  heroAttack: number,
  dmgPerCreature: number
): number {
  const atk =
    attacker.definition.attack +
    (attacker.attackBuff ?? 0) +
    (attacker.side === 'player' ? heroAttack : 0);
  let def = defender.definition.defense + (defender.defenseBuff ?? 0);

  // Defensive stance: +30% defense until the stack's own next turn
  if (defender.isDefending) {
    def = Math.floor(def * 1.3);
  }

  // Behemoth defense reduction: reduces target defense by 40%
  if (attacker.definition.abilities.includes('defense_reduction')) {
    def = Math.floor(def * 0.6);
  }

  let totalDamage = dmgPerCreature * attacker.count;

  // Attack/defense modifier
  if (atk > def) {
    const bonus = Math.min(atk - def, 20);
    totalDamage *= 1 + 0.05 * bonus;
  } else if (def > atk) {
    const penalty = Math.min(def - atk, 20);
    totalDamage /= 1 + 0.05 * penalty;
  }

  // Knight Jousting: cavalry deals +5% damage per cell moved before this attack.
  if (attacker.definition.abilities.includes('jousting') && attacker.lastMovedFrom) {
    const cellsMoved = chebyshevDistance(attacker.pos, attacker.lastMovedFrom);
    if (cellsMoved > 0) totalDamage *= 1 + 0.05 * cellsMoved;
  }

  return totalDamage;
}

export function calculateDamage(
  attacker: UnitStack,
  defender: UnitStack,
  heroAttack: number,
  rng: Rng
): number {
  // Base damage per creature
  const dmgPerCreature = attacker.definition.minDamage +
    Math.floor(rng() * (attacker.definition.maxDamage - attacker.definition.minDamage + 1));
  let totalDamage = modifiedDamage(attacker, defender, heroAttack, dmgPerCreature);

  // Luck: 12.5% * luck chance to double
  if (attacker.luck > 0 && rng() < 0.125 * attacker.luck) {
    totalDamage *= 2;
  }
  // Bad luck: 12.5% * abs(luck) chance to halve
  if (attacker.luck < 0 && rng() < 0.125 * Math.abs(attacker.luck)) {
    totalDamage *= 0.5;
  }

  // Wizard Gorgon Death Stare: 10% chance to instantly kill the top defending creature.
  if (attacker.definition.abilities.includes('death_stare') && rng() < 0.1) {
    totalDamage += defender.definition.hp;
  }

  return Math.max(1, Math.round(totalDamage));
}

export interface DamageResult {
  killed: number;
  remaining: UnitStack;
}

export function applyDamage(defender: UnitStack, damage: number): DamageResult {
  if (defender.count <= 0) return { killed: 0, remaining: defender };

  const fullHp = defender.definition.hp;

  // damage first hits the top creature's current hp
  let dmgLeft = damage;
  let killed = 0;
  let topHp = defender.hp;

  if (dmgLeft >= topHp) {
    dmgLeft -= topHp;
    killed += 1;
    // now kill full-hp creatures
    const moreKilled = Math.min(Math.floor(dmgLeft / fullHp), defender.count - 1);
    killed += moreKilled;
    dmgLeft -= moreKilled * fullHp;
    topHp = fullHp - dmgLeft; // new top creature's remaining hp
    if (topHp <= 0) { topHp = 0; killed = Math.min(killed + 1, defender.count); }
  } else {
    topHp -= dmgLeft;
  }

  const newCount = Math.max(0, defender.count - killed);
  const newHp = newCount > 0 ? Math.max(1, topHp) : 0;

  return {
    killed,
    remaining: { ...defender, count: newCount, hp: newHp },
  };
}

/**
 * Whether `defender` can retaliate against `attacker`'s hit.
 * Two independent abilities gate this: the defender's own `no_retaliation`
 * (it never retaliates, regardless of who hit it) and the attacker's
 * `no_retaliation` (nothing it hits can retaliate — e.g. Monk/Naga/Titan).
 * Griffin's `unlimited_retaliation` bypasses the once-per-turn limit.
 */
export function canRetaliate(defender: UnitStack, attacker?: UnitStack): boolean {
  const unlimited = defender.definition.abilities.includes('unlimited_retaliation');
  const attackerBlocks = attacker?.definition.abilities.includes('no_retaliation') ?? false;
  return (unlimited || !defender.hasRetaliated)
    && defender.count > 0
    && !defender.definition.abilities.includes('no_retaliation')
    && !attackerBlocks;
}

/** Returns 'boost' (extra turn), 'freeze' (skip turn), or null */
export function checkMorale(stack: UnitStack, rng: Rng): 'boost' | 'freeze' | null {
  if (stack.morale > 0 && rng() < (1 / 24) * stack.morale) return 'boost';
  if (stack.morale < 0 && rng() < (1 / 24) * Math.abs(stack.morale)) return 'freeze';
  return null;
}
