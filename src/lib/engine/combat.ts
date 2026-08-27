import type { BattleEvent, UnitStack, Hero } from './types.ts';
import { abilityLevel, defenseReductionMult, BLOOD_FRENZY_DAMAGE } from './abilityCatalog.ts';
import type { Rng } from './rng.ts';
import { chebyshevDistance } from './grid.ts';
import { addModifierSource } from './unitModifiers.ts';

/**
 * A stack's attack and defense as the damage formula sees them: base, plus the
 * battle-long buffs, plus the hero's attack for player stacks.
 *
 * Buffs can be negative (Zombie infecting_strike), so both floor at 0 — a stack
 * stripped past zero defense must not start feeding its attacker unbounded
 * bonus damage. Exported because the unit info panel shows these numbers, and a
 * panel that disagreed with the formula would be worse than no panel.
 */
export function effectiveAttack(stack: UnitStack, heroAttack = 0): number {
  return Math.max(
    0,
    stack.definition.attack + (stack.attackBuff ?? 0) + (stack.side === 'player' ? heroAttack : 0)
  );
}

export function effectiveDefense(stack: UnitStack): number {
  return Math.max(0, stack.definition.defense + (stack.defenseBuff ?? 0));
}

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
  const atk = effectiveAttack(attacker, heroAttack);
  let def = effectiveDefense(defender);

  // Defensive stance: +30% defense until the stack's own next turn
  if (defender.isDefending) {
    def = Math.floor(def * 1.3);
  }

  // Defense reduction: −5% target defense per level (legacy Behemoth = level 8 = 40%).
  const drLevel = abilityLevel(attacker.definition, 'defense_reduction');
  if (drLevel > 0) {
    def = Math.floor(def * defenseReductionMult(drLevel));
  }

  // blood_frenzy's accrued bonus raises the roll itself, so it lands in
  // damagePreview's tooltip as well as in the hit — both read this function.
  let totalDamage = (dmgPerCreature + (attacker.damageBonus ?? 0)) * attacker.count;

  // Attack/defense modifier: +5% damage per point of attack over defense,
  // −5%-equivalent per point under. Uncapped in both directions.
  if (atk > def) {
    totalDamage *= 1 + 0.05 * (atk - def);
  } else if (def > atk) {
    totalDamage /= 1 + 0.05 * (def - atk);
  }

  // Knight Jousting: cavalry deals +5% damage per cell moved before this attack.
  if (attacker.definition.abilities.includes('jousting') && attacker.lastMovedFrom) {
    const cellsMoved = chebyshevDistance(attacker.pos, attacker.lastMovedFrom);
    if (cellsMoved > 0) totalDamage *= 1 + 0.05 * cellsMoved;
  }

  return totalDamage;
}

/** Whether a hit's luck roll fired, for callers that want to narrate it.
 *  Passed in rather than returned so the damage return type — and the rng call
 *  order every seeded test depends on — stay exactly as they were. */
export interface LuckSink {
  luck: 'good' | 'bad' | null;
}

export function calculateDamage(
  attacker: UnitStack,
  defender: UnitStack,
  heroAttack: number,
  rng: Rng,
  luckSink?: LuckSink
): number {
  // Base damage per creature
  const dmgPerCreature = attacker.definition.minDamage +
    Math.floor(rng() * (attacker.definition.maxDamage - attacker.definition.minDamage + 1));
  let totalDamage = modifiedDamage(attacker, defender, heroAttack, dmgPerCreature);

  // Luck: 12.5% * luck chance to double
  if (attacker.luck > 0 && rng() < 0.125 * attacker.luck) {
    totalDamage *= 2;
    if (luckSink) luckSink.luck = 'good';
  }
  // Bad luck: 12.5% * abs(luck) chance to halve
  if (attacker.luck < 0 && rng() < 0.125 * Math.abs(attacker.luck)) {
    totalDamage *= 0.5;
    if (luckSink) luckSink.luck = 'bad';
  }

  // Wizard Gorgon Death Stare: 10% chance to instantly kill the top defending creature.
  if (attacker.definition.abilities.includes('death_stare') && rng() < 0.1) {
    totalDamage += defender.definition.hp;
  }

  // Necromancer Black Knight Death Blow: 20% chance to deal double damage.
  if (attacker.definition.abilities.includes('death_blow') && rng() < 0.2) {
    totalDamage *= 2;
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

/** A DamageResult plus the log entries the defender's own reactive abilities
 *  produced. Callers already build a log array per hit, so they just spread it. */
export interface StrikeResult extends DamageResult {
  events: BattleEvent[];
}

/**
 * Blood Acolyte blood_frenzy: every wound it survives permanently raises its
 * min and max damage for the rest of the battle. Fires once per damage
 * instance, whatever the source — melee, retaliation, shot, splash, burn or
 * spell — which is why it lives on the shared damage wrappers below rather
 * than in applyOnHitEffects (that only sees attacks).
 */
function frenzy(stack: UnitStack, damage: number): { stack: UnitStack; events: BattleEvent[] } {
  if (damage <= 0 || stack.count <= 0) return { stack, events: [] };
  if (!stack.definition.abilities.includes('blood_frenzy')) return { stack, events: [] };
  const grown = addModifierSource(
    { ...stack, damageBonus: (stack.damageBonus ?? 0) + BLOOD_FRENZY_DAMAGE },
    { id: 'blood_frenzy', label: 'Blood Frenzy', stats: { damage: BLOOD_FRENZY_DAMAGE } },
  );
  return {
    stack: grown,
    events: [{ type: 'status', data: { effect: 'blood_frenzy', unitId: grown.id, bonus: grown.damageBonus } }],
  };
}

/**
 * The single entry point for "this stack took damage": applyDamage plus the
 * defender's on-damaged abilities. applyDamage itself stays a pure HP-pool
 * function because damagePreview and the animation replay call it too, and
 * neither may accrue battle state.
 */
export function damageStack(defender: UnitStack, damage: number): StrikeResult {
  const hit = applyDamage(defender, damage);
  const { stack, events } = frenzy(hit.remaining, damage);
  return { killed: hit.killed, remaining: stack, events };
}

/**
 * A melee hit: damageStack plus the attacker's kill-count abilities.
 *
 * Black Knight soul_reaper claims one creature beyond whatever the damage
 * alone would kill — 140 damage that fells 2 fells 3, and a hit too weak to
 * kill anything still takes one. The extra creature dies whole, so the next
 * one steps up at full HP rather than inheriting the leftover damage.
 */
export function applyStrike(attacker: UnitStack, defender: UnitStack, damage: number): StrikeResult {
  const hit = applyDamage(defender, damage);
  let { killed, remaining } = hit;
  if (attacker.definition.abilities.includes('soul_reaper') && remaining.count > 0) {
    const reaped = applyDamage(remaining, remaining.hp);
    killed += reaped.killed;
    remaining = reaped.remaining;
  }
  const { stack, events } = frenzy(remaining, damage);
  return { killed, remaining: stack, events };
}

export interface HealResult {
  stack: UnitStack;
  healed: number;   // HP actually restored (after clamping to startCount)
  revived: number;  // creatures brought back (newCount - oldCount)
}

/**
 * Heal a stack's HP pool as the mirror of applyDamage: fill the top creature,
 * then revive whole creatures below it, never past the count the stack started
 * the battle with (startCount). `heal` is the requested amount; the returned
 * `healed` is what was actually restored after clamping.
 */
export function applyHeal(stack: UnitStack, heal: number): HealResult {
  if (stack.count <= 0 || heal <= 0) return { stack, healed: 0, revived: 0 };

  const fullHp = stack.definition.hp;
  const currentTotal = (stack.count - 1) * fullHp + stack.hp;
  const maxTotal = stack.startCount * fullHp;
  const newTotal = Math.min(maxTotal, currentTotal + heal);

  const newCount = Math.min(stack.startCount, Math.ceil(newTotal / fullHp));
  const newHp = newTotal - (newCount - 1) * fullHp;

  return {
    stack: { ...stack, count: newCount, hp: newHp },
    healed: newTotal - currentTotal,
    revived: newCount - stack.count,
  };
}

/**
 * Whether `defender` can retaliate against `attacker`'s hit.
 * `no_retaliation` is an offensive ability: it only stops the targets its
 * owner hits (e.g. Monk/Naga/Titan). It never stops its owner from
 * retaliating when something else attacks it.
 * Griffin's `unlimited_retaliation` bypasses the once-per-turn limit.
 */
export function canRetaliate(defender: UnitStack, attacker?: UnitStack): boolean {
  const unlimited = defender.definition.abilities.includes('unlimited_retaliation');
  const attackerBlocks = attacker?.definition.abilities.includes('no_retaliation') ?? false;
  return (unlimited || !defender.hasRetaliated)
    && defender.count > 0
    && !attackerBlocks;
}

/** Returns 'boost' (extra turn), 'freeze' (skip turn), or null */
export function checkMorale(stack: UnitStack, rng: Rng): 'boost' | 'freeze' | null {
  if (stack.morale > 0 && rng() < (1 / 24) * stack.morale) return 'boost';
  if (stack.morale < 0 && rng() < (1 / 24) * Math.abs(stack.morale)) return 'freeze';
  return null;
}
