import type {
  ArmyBonuses,
  ArmySlot,
  BattleAction,
  BattleEvent,
  BattleState,
  DebugBattleOperation,
  DebugStackTemplate,
  Hero,
  Pos,
  SpellId,
  UnitModifierSource,
  UnitModifierStat,
  UnitStack,
} from './types.ts';
import { createGrid, placeUnits, setBlocked, setOccupant } from './grid.ts';
import { advanceTurn, reentryAtb } from './turnOrder.ts';
import { calculateDamageInBattle, applyDamage, applyHeal, applyStrike, damageStack, resolveDamagePacket, canRetaliate, checkMorale, type LuckSink, type StrikeResult } from './combat.ts';
import { isBeyondRange, isShootingBlocked, type DamagePreview } from './selectors.ts';
import { mulberry32, rngFor, type Rng } from './rng.ts';
import { abilityLevel, lifestealFraction, CURSE_SHOT_PENALTY, INFECT_PENALTY } from './abilityCatalog.ts';
import { canActivate, UNIT_ABILITIES } from './unitAbilities.ts';
import {
  applyOffenseBonus,
  applyArmorerBonus,
  applyArcheryBonus,
  applyDeathMagicBonus,
  applyFireMagicBonus,
  getGatingChance,
  getMoraleBonus,
  getLogisticsBonus,
  getNatureLuckBonus,
  getSorceryMultiplier,
  getMysticismRegen,
  getTacticsShift,
  maxMana,
} from './factionSkills.ts';
import { DEMON_UNITS } from './demon.ts';
import { addModifierSource } from './unitModifiers.ts';
import { validateAction } from './actions.ts';
import { decreaseCooldowns, startCooldown } from './cooldowns.ts';
import { addEffect, cleanseOldest, stealRandomBuff, tickTargetEffects } from './effects.ts';
import { applySavedFormation, type SavedFormation } from './deployment.ts';
import { resolveHeroAction } from './heroActions.ts';
import { areaTargets, lineCells } from './areaDamage.ts';
import { moveStack } from './movement.ts';
import { alliedTeamId, controllerOfUnit, hasArtifact, mechanicParam } from './artifacts.ts';
import { IMP } from './demon.ts';
import { BONE_DRAGON, SKELETON } from './necromancer.ts';
import { addMark, incomingMarkMultiplier, triggerQuarry } from './marks.ts';
import { chebyshevDistance } from './grid.ts';

function controllerClass(state: BattleState, unit: UnitStack): Hero['class'] | undefined {
  const controller = controllerOfUnit(unit);
  return state.heroes?.[controller]?.class ?? (unit.side === 'player' && !unit.isAlly ? state.hero.class : undefined);
}

function factionUnit(state: BattleState, unit: UnitStack, faction: Hero['class']): boolean {
  return !unit.isHero && controllerClass(state, unit) === faction;
}

function heroSystemState(state: BattleState, unit: UnitStack): Record<string, import('./types.ts').JsonValue> {
  return state.heroActionState?.[controllerOfUnit(unit)] ?? {};
}

function inChosenArea(value: import('./types.ts').JsonValue | undefined, pos: Pos): boolean {
  return Array.isArray(value) && value.some(cell => typeof cell === 'object' && cell !== null && !Array.isArray(cell) && cell.col === pos.col && cell.row === pos.row);
}

const demonUnitDefinition = (unit: UnitStack): boolean => DEMON_UNITS.some(definition => definition.name === unit.definition.name);

function battleStrike(state: BattleState, attacker: UnitStack, defender: UnitStack, damage: number): StrikeResult {
  const strike = applyStrike(attacker, defender, damage, state);
  if (!attacker.definition.abilities.includes('soul_reaper') || !hasArtifact(state, attacker, 'reapers_tack') || strike.remaining.count <= 0) return strike;
  const extra = applyDamage(strike.remaining, strike.remaining.hp);
  return {
    ...strike,
    killed: strike.killed + extra.killed,
    soulReaperKills: strike.soulReaperKills + extra.killed,
    remaining: extra.remaining.count === 0
      ? { ...extra.remaining, abilityState: { ...(extra.remaining.abilityState ?? {}), lastDamageStartCount: defender.count } }
      : extra.remaining,
  };
}

function addTemporarySkeletons(
  state: BattleState,
  source: UnitStack,
  count: number,
  origin: 'blood_tithe' | 'knights_reliquary',
): BattleState {
  if (count <= 0) return state;
  const controller = controllerOfUnit(source);
  const existing = state.units.filter(unit => unit.count > 0 && unit.definition.name === 'Skeleton' && controllerOfUnit(unit) === controller)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0];
  if (existing) {
    return {
      ...state,
      units: state.units.map(unit => unit.id === existing.id ? { ...unit, count: unit.count + count, startCount: unit.startCount + count } : unit),
      log: [...state.log, { type: 'status', data: { effect: origin, unitId: existing.id, sourceId: source.id, count } }],
    };
  }
  const position = state.grid.cells.flat()
    .filter(cell => !cell.blocked && !cell.occupantId)
    .map(cell => ({ col: cell.col, row: cell.row }))
    .sort((a, b) => chebyshevDistance(a, source.pos) - chebyshevDistance(b, source.pos) || a.row - b.row || a.col - b.col)[0];
  if (!position) return state;
  const id = `u${state.nextId}`;
  const skeleton: UnitStack = {
    id, definition: SKELETON, count, startCount: count, hp: SKELETON.hp, pos: position,
    side: source.side, controllerId: source.controllerId, isAlly: source.isAlly,
    hasRetaliated: false, shotsLeft: SKELETON.shots, morale: 0, luck: 0, atb: 0,
    tiePriority: rngFor(state.seed, state.actionSeq ?? 0, 'summon', origin, id)(), isDefending: false,
    origin: { type: 'summoned', source: origin, summonerId: source.id }, hasTakenTurn: false,
  };
  return {
    ...state,
    units: [...state.units, skeleton],
    grid: setOccupant(state.grid, position, id),
    nextId: state.nextId + 1,
    log: [...state.log, { type: 'status', data: { effect: origin, unitId: id, sourceId: source.id, count } }],
  };
}

function flushBloodTithe(state: BattleState, sourceId: string): BattleState {
  const source = state.units.find(unit => unit.id === sourceId);
  const pending = Number(source?.abilityState?.bloodTithePending ?? 0);
  if (!source || pending <= 0) return state;
  const cleared = { ...source, abilityState: { ...(source.abilityState ?? {}), bloodTithePending: 0 } };
  return addTemporarySkeletons({ ...state, units: state.units.map(unit => unit.id === source.id ? cleared : unit) }, cleared, pending, 'blood_tithe');
}

function applyFuneralDrumProgress(before: BattleState, after: BattleState): BattleState {
  let next = after;
  for (const [controller, ids] of Object.entries(after.artifacts ?? {})) {
    if (!ids.includes('funeral_drum')) continue;
    const skeletonCount = (battle: BattleState) => battle.units
      .filter(unit => unit.definition.name === 'Skeleton' && controllerOfUnit(unit) === controller)
      .reduce((sum, unit) => sum + Math.max(0, unit.count), 0);
    const lost = Math.max(0, skeletonCount(before) - skeletonCount(after));
    if (!lost) continue;
    const prior = Number(next.heroActionState?.[controller]?.funeralDrumRemainder ?? 0);
    const total = prior + lost;
    const triggers = Math.floor(total / 5);
    next = {
      ...next,
      units: triggers > 0 ? next.units.map(unit => unit.count > 0 && unit.definition.name !== 'Skeleton' && controllerOfUnit(unit) === controller && factionUnit(next, unit, 'necromancer')
        ? { ...unit, atb: Math.min(1, unit.atb + triggers * 0.1) }
        : unit) : next.units,
      heroActionState: {
        ...(next.heroActionState ?? {}),
        [controller]: { ...(next.heroActionState?.[controller] ?? {}), funeralDrumRemainder: total % 5 },
      },
      log: triggers > 0 ? [...next.log, { type: 'status', data: { effect: 'funeral_drum', controller, lost, triggers } }] : next.log,
    };
  }
  return next;
}

/** Barbarian Offense boosts damage a player stack deals; Knight/Barbarian Armorer
 *  reduces damage a player stack takes. Ranger Archery/Necromancer Death Magic/Demon
 *  Fire Magic scale specific attack shapes. All are hero-wide, so they're applied
 *  here rather than inside calculateDamage (which only knows per-unit abilities). */
function withHeroBonus(
  attackerHero: Hero,
  defenderHero: Hero,
  attacker: UnitStack,
  defender: UnitStack,
  damage: number,
  ranged = false
): number {
  let d = damage;
  if (attacker.side === 'player') {
    d = applyOffenseBonus(d, attackerHero);
    if (ranged) d = applyArcheryBonus(d, attackerHero);
    if (attacker.definition.abilities.includes('curse_shot')) d = applyDeathMagicBonus(d, attackerHero);
    if (attacker.definition.abilities.includes('burn')) d = applyFireMagicBonus(d, attackerHero);
  }
  if (defender.side === 'player') d = applyArmorerBonus(d, defenderHero);
  return d;
}

function attackMultiplier(state: BattleState, attacker: UnitStack, defender: UnitStack, ranged: boolean, retaliation: boolean): number {
  let multiplier = 1;
  const abilities = attacker.definition.abilities;
  const moved = attacker.lastMovedFrom
    ? (attacker.lastMovedDistance ?? chebyshevDistance(attacker.pos, attacker.lastMovedFrom))
    : 0;
  if ((attacker.empoweredTurnsRemaining ?? 0) > 0 && !retaliation) multiplier *= mechanicParam(state, attacker, 'banner_of_the_first_raid', 'damage', 1.3);
  if (retaliation && factionUnit(state, attacker, 'knight') && heroSystemState(state, attacker).activeOrder === 'ready_the_counterattack' && !attacker.abilityState?.counterattackUsed) multiplier *= 1.5;
  if (retaliation && attacker.definition.name === 'Griffin' && hasArtifact(state, attacker, 'gryphon_talon_bracers')) multiplier *= 1.5;
  if (attacker.isHero && attacker.definition.name === 'Hero') {
    if (hasArtifact(state, attacker, 'bloodletter_axe')) multiplier *= 3;
    if (hasArtifact(state, attacker, 'worldsplitter')) multiplier *= 5;
    if (hasArtifact(state, attacker, 'prism_of_the_fallen')) {
      const snapshot = Number(heroSystemState(state, attacker).prismDeadSnapshot ?? state.units.filter(unit => !unit.isHero && unit.count <= 0).length);
      multiplier *= 1 + 0.2 * snapshot;
    }
  }
  if (!retaliation && abilities.includes('grand_joust') && !defender.definition.abilities.includes('spearwall')) multiplier *= 1 + moved * 0.2;
  if (!retaliation && abilities.includes('mob_rule')) {
    const adjacent = state.units.filter(unit => unit.count > 0 && !unit.isHero && unit.side === attacker.side && unit.id !== attacker.id && chebyshevDistance(unit.pos, defender.pos) === 1).length;
    const each = hasArtifact(state, attacker, 'redcap_knives') ? 0.2 : 0.15;
    multiplier *= 1 + Math.min(hasArtifact(state, attacker, 'redcap_knives') ? 0.6 : 0.45, adjacent * each);
  }
  if (!retaliation && abilities.includes('first_strike') && !defender.hasTakenTurn) multiplier *= hasArtifact(state, attacker, 'stag_spurs') ? 2 : 1.75;
  if (!retaliation && abilities.includes('darting_assault') && moved > 0 && hasArtifact(state, attacker, 'needlepoint')) multiplier *= 1.3;
  if (!retaliation && !ranged && !defender.hasTakenTurn && hasArtifact(state, attacker, 'ambushers_map')) multiplier *= 1.3;
  const plan = heroSystemState(state, attacker);
  const planId = Number(plan.planId ?? -1);
  const attackStart = attacker.lastMovedFrom ?? attacker.pos;
  if (!retaliation && factionUnit(state, attacker, 'ranger') && plan.activePlan === 'set_the_ambush' &&
      inChosenArea(plan.area, attackStart) && Number(attacker.abilityState?.ambushUsedPlanId ?? -2) !== planId) multiplier *= 1.3;
  if (!retaliation && !ranged && !defender.hasTakenTurn && hasArtifact(state, attacker, 'the_wild_hunt') && !attacker.abilityState?.wildHuntUsed) multiplier *= 2;
  if (!retaliation && abilities.includes('executioner') && defender.count <= defender.startCount * (hasArtifact(state, attacker, 'grudge_axe') ? 0.75 : 0.5)) multiplier *= 2;
  if (!retaliation && abilities.includes('rampage') && hasArtifact(state, attacker, 'broken_maw_chain')) multiplier *= 1 + Number(attacker.abilityState?.rampageDamageStacks ?? 0) * 0.25;
  if (!retaliation && abilities.includes('bully') && defender.definition.tier < attacker.definition.tier) multiplier *= 1.5;
  if (!retaliation && abilities.includes('battering_ram') && moved >= (hasArtifact(state, attacker, 'ironbound_horns') ? 2 : 3)) multiplier *= 1.5;
  if (!retaliation && abilities.includes('soaring_strike') && attacker.abilityState?.soaring) multiplier *= hasArtifact(state, attacker, 'cloud_reins') ? 2 : 1.75;
  if (!retaliation && abilities.includes('doomstep') && (defender.burnRoundsLeft ?? 0) > 0) multiplier *= 2;
  if (attacker.abilityState?.rideByResolving) multiplier *= 1.5;
  for (const active of attacker.effects ?? []) {
    const data = active.data ?? {};
    const value = Number(data.damageMultiplier ?? data.outgoing ?? 1);
    if (Number.isFinite(value) && (active.kind !== 'cry_loose' || ranged) && (active.kind !== 'cry_charge' || !ranged)) multiplier *= value;
  }
  if ((defender.burnRoundsLeft ?? 0) > 0 && hasArtifact(state, attacker, 'brand_of_damnation')) multiplier *= 2;
  if (hasArtifact(state, attacker, 'book_of_grudges')) {
    const afflictions = new Set((defender.effects ?? []).filter(effect => !effect.positive).map(effect => effect.kind));
    if ((defender.burnRoundsLeft ?? 0) > 0) afflictions.add('burn');
    if (defender.morale < 0) afflictions.add('morale');
    multiplier *= 1 + 0.15 * afflictions.size;
  }
  if (defender.morale <= -3 && hasArtifact(state, attacker, 'empty_throne')) multiplier *= 1.5;
  const tormentSource = (attacker.burnRoundsLeft ?? 0) > 0
    ? state.units.find(unit => unit.count > 0 && unit.side === defender.side && unit.definition.abilities.includes('torment_aura'))
    : undefined;
  if (tormentSource) multiplier *= hasArtifact(state, tormentSource, 'tormentors_brand') ? 0.65 : 0.8;
  if (ranged && abilities.includes('marked_quarry') && (defender.marks ?? []).some(mark => mark.kind === 'ranged_mark')) {
    const base = hasArtifact(state, attacker, 'red_fletched_arrows') ? 1.45 : 1.3;
    multiplier *= (base + 0.3) / base;
  }
  const rangedFocus = heroSystemState(state, attacker);
  if (ranged && hasArtifact(state, attacker, 'predators_focus') && rangedFocus.rangedFocusTarget === defender.id) {
    multiplier *= 1 + Math.min(10, Number(rangedFocus.rangedFocusCount ?? 0)) * 0.1;
  }
  multiplier *= incomingMarkMultiplier(state, attacker, defender, ranged);
  return multiplier;
}

function incomingAttackMultiplier(state: BattleState, attacker: UnitStack, defender: UnitStack, ranged: boolean): number {
  let multiplier = 1;
  if (ranged && defender.definition.abilities.includes('large_shield')) multiplier *= 0.5;
  if (ranged && (defender.effects ?? []).some(effect => effect.kind === 'pollen_veil')) multiplier *= 0.5;
  if (ranged && state.units.some(unit => unit.count > 0 && unit.side === defender.side && unit.definition.name === 'Swordsman' && chebyshevDistance(unit.pos, defender.pos) === 1 && hasArtifact(state, unit, 'shieldwall_standard'))) multiplier *= 0.5;
  if (ranged) {
    const shelter = state.units.find(unit => unit.count > 0 && unit.side === defender.side && unit.definition.abilities.includes('sheltering_boughs') && chebyshevDistance(unit.pos, defender.pos) <= (hasArtifact(state, unit, 'thornwall_seed') ? 2 : 1));
    if (shelter) multiplier *= hasArtifact(state, shelter, 'canopy_idol') ? 0.5 : 0.7;
  }
  for (const active of defender.effects ?? []) if (active.kind === 'cry_blood_for_blood') multiplier *= Number(active.data?.incoming ?? 1);
  if ((defender.effects ?? []).some(effect => effect.kind === 'braced')) multiplier *= 0.7;
  return multiplier;
}

/** A hit plus the luck event that preceded it, if the attacker's luck fired.
 *  Emitted as its own entry ahead of the attack so the UI plays it as an
 *  earlier beat — the flash reads as the cause of the damage that follows. */
function rollHit(
  state: BattleState,
  attacker: UnitStack,
  defender: UnitStack,
  rng: Rng,
  heroAttack: number,
  ranged = false,
  retaliation = false,
): { damage: number; luckEvents: BattleEvent[] } {
  const sink: LuckSink = { luck: null };
  const attackerHero = heroFor(state, attacker);
  const defenderHero = heroFor(state, defender);
  const guaranteedGoodLuck = !retaliation && factionUnit(state, attacker, 'ranger') &&
    hasArtifact(state, attacker, 'fateweavers_horn') && !attacker.abilityState?.fateweaverUsed;
  const raw = calculateDamageInBattle(state, guaranteedGoodLuck ? { ...attacker, luck: 0 } : attacker, defender, rng, sink) * (guaranteedGoodLuck ? 2 : 1);
  if (guaranteedGoodLuck) sink.luck = 'good';
  return {
    damage: Math.max(1, Math.round(withHeroBonus(attackerHero, defenderHero, attacker, defender, raw, ranged) * attackMultiplier(state, attacker, defender, ranged, retaliation) * incomingAttackMultiplier(state, attacker, defender, ranged))),
    luckEvents: sink.luck
      ? [{ type: 'luck', data: { unitId: attacker.id, kind: sink.luck } }]
      : [],
  };
}

/**
 * Per-hit status abilities that mutate the striker or the victim rather than
 * just the damage number (those live in combat.ts's calculateDamage instead):
 * Vampire life_drain, Zombie slow_on_hit, Ghost drain_morale, Unicorn
 * blind_on_hit, Efreet burn, Dendroid bind. Called after damage has already
 * been applied via applyDamage.
 */
function applyOnHitEffects(
  rng: Rng,
  striker: UnitStack,
  victim: UnitStack,
  damageDealt: number,
  round: number,
  state: BattleState,
  gauntletRound = 1,
): { striker: UnitStack; victim: UnitStack; events: BattleEvent[] } {
  let a = striker;
  let v = victim;
  const events: BattleEvent[] = [];
  const abilities = striker.definition.abilities;

  const lsLevel = abilityLevel(striker.definition, 'life_drain');
  if (lsLevel > 0 && a.count > 0) {
    // Heal the striking stack by 10%·level of the total damage dealt (legacy
    // Vampire = level 10 = 100%), reviving fallen creatures up to the count it
    // started the battle with. Heals the stack as a whole, never per-creature.
    let fraction = lifestealFraction(lsLevel);
    if ((victim.burnRoundsLeft ?? 0) > 0 && hasArtifact(state, striker, 'feastmasters_hook')) fraction = 1;
    const afflicted = (victim.effects ?? []).some(effect => !effect.positive) || victim.morale < 0 || (victim.burnRoundsLeft ?? 0) > 0;
    if (afflicted && hasArtifact(state, striker, 'chalice_of_night')) fraction = 1.5;
    if (hasArtifact(state, striker, 'red_moon_covenant')) fraction *= 2;
    const heal = Math.round(damageDealt * fraction);
    const oldHp = a.hp;
    const { stack, healed, revived, overheal } = applyHeal(a, heal);
    a = stack;
    if (overheal > 0 && hasArtifact(state, striker, 'blood_tithe')) {
      const carried = Number(a.abilityState?.bloodTitheRemainder ?? 0) + overheal;
      const created = Math.floor(carried / SKELETON.hp);
      a = {
        ...a,
        abilityState: {
          ...(a.abilityState ?? {}),
          bloodTitheRemainder: carried % SKELETON.hp,
          bloodTithePending: Number(a.abilityState?.bloodTithePending ?? 0) + created,
        },
      };
      if (created > 0) events.push({ type: 'status', data: { effect: 'blood_tithe_ready', unitId: a.id, count: created } });
    }
    if (abilities.includes('overfeed') && overheal > 0) {
      const efficiency = hasArtifact(state, striker, 'blood_chalice') ? 2 : 1;
      const charge = Math.round(overheal * efficiency);
      a = { ...a, abilityState: { ...(a.abilityState ?? {}), bloodCharge: Number(a.abilityState?.bloodCharge ?? 0) + charge } };
      events.push({ type: 'status', data: { effect: 'overfeed', unitId: a.id, overheal, charge } });
    }
    if (healed > 0) {
      // Floater split: `revived` creatures shown green, and the current lead
      // creature's partial HP shown red (its fresh HP after a revive, else the
      // plain top-up).
      const topHp = revived > 0 ? a.hp : a.hp - oldHp;
      events.push({ type: 'status', data: { effect: 'life_drain', unitId: a.id, heal: healed, revived, topHp } });
    }
  }

  if (v.count > 0 && !v.isHero) {
    const acceptsNegative = !(v.effects ?? []).some(effect => effect.kind === 'negative_immunity');
    if (acceptsNegative && abilities.includes('slow_on_hit') && rng() < 0.3) {
      v = addModifierSource(
        { ...v, speedBonus: (v.speedBonus ?? 0) - 1 },
        { id: 'slow_on_hit', label: 'Zombie — Slow on Hit', stats: { speed: -1 } },
      );
      v = addEffect(v, { id: 'slow_on_hit', kind: 'slow', sourceStackId: striker.id, sourceControllerId: striker.controllerId, positive: false, innate: false, removable: true, stacks: 1, stats: { speed: -1 }, expires: { targetTurnsRemaining: 1, phase: 'start' } }, false);
      events.push({ type: 'status', data: { effect: 'slow', unitId: v.id } });
    }
    if (acceptsNegative && abilities.includes('drain_morale')) {
      let penalty = hasArtifact(state, striker, 'wailing_lantern') ? 2 : 1;
      if (hasArtifact(state, striker, 'crown_of_ruin')) penalty *= 2;
      const morale = Math.max(-3, v.morale - penalty);
      const appliedPenalty = v.morale - morale;
      if (morale < v.morale) {
        v = addModifierSource(
          { ...v, morale },
          { id: 'drain_morale', label: 'Ghost — Drain Morale', stats: { morale: morale - v.morale } },
        );
      }
      if (appliedPenalty > 0) {
        v = addEffect(v, { id: 'drain_morale', kind: 'drain_morale', sourceStackId: striker.id, sourceControllerId: striker.controllerId, positive: false, innate: false, removable: true, stacks: 1, stats: { morale: -appliedPenalty } }, false);
      }
      events.push({ type: 'status', data: { effect: 'drain_morale', unitId: v.id } });
    }
    if (acceptsNegative && abilities.includes('blind_on_hit') && rng() < 0.2) {
      v = { ...v, blindedUntilRound: round };
      v = addEffect(v, { id: 'blind', kind: 'blind', sourceStackId: striker.id, sourceControllerId: striker.controllerId, positive: false, innate: false, removable: true, stacks: 1, expires: { targetTurnsRemaining: 1 } });
      events.push({ type: 'status', data: { effect: 'blind', unitId: v.id } });
    }
    if (acceptsNegative && (abilities.includes('kindling') || abilities.includes('living_flame')) && !v.definition.abilities.includes('fire_immunity')) {
      const baseBurn = 3 * Math.max(1, gauntletRound);
      const burnDamage = hasArtifact(state, striker, 'crown_of_wildfire') ? (v.burnDamage ?? 0) + baseBurn : baseBurn;
      v = { ...v, burnDamage, burnRoundsLeft: 2, burnSourceId: striker.id };
      v = addEffect(v, { id: 'burn', kind: 'burn', sourceStackId: striker.id, sourceControllerId: striker.controllerId, positive: false, innate: false, removable: true, stacks: 1, expires: { targetTurnsRemaining: 2 } });
      events.push({ type: 'status', data: { effect: 'burn_apply', unitId: v.id } });
    }
    if (acceptsNegative && abilities.includes('bind')) {
      v = addEffect(v, {
        id: `bind:${striker.id}`,
        kind: 'bind',
        sourceStackId: striker.id,
        sourceControllerId: striker.controllerId,
        positive: false,
        innate: false,
        removable: true,
        stacks: 1,
      });
      events.push({ type: 'status', data: { effect: 'bind', unitId: v.id } });
    }
    // Zombie infecting_strike: the rot compounds — every hit takes another
    // 5 attack and 5 defense off the victim for the rest of the battle.
    // modifiedDamage floors both at 0.
    if (acceptsNegative && abilities.includes('infecting_strike')) {
      const infectPenalty = INFECT_PENALTY * (hasArtifact(state, striker, 'crown_of_ruin') ? 2 : 1);
      v = addModifierSource(
        {
          ...v,
          attackBuff: (v.attackBuff ?? 0) - infectPenalty,
          defenseBuff: (v.defenseBuff ?? 0) - infectPenalty,
        },
        {
          id: 'infecting_strike',
          label: 'Zombie — Infecting Strike',
          stats: { attack: -infectPenalty, defense: -infectPenalty },
        },
      );
      v = addEffect(v, { id: 'infecting_strike', kind: 'infect', sourceStackId: striker.id, sourceControllerId: striker.controllerId, positive: false, innate: false, removable: true, stacks: 1, stats: { attack: -infectPenalty, defense: -infectPenalty } }, false);
      events.push({ type: 'status', data: { effect: 'infect', unitId: v.id, penalty: infectPenalty } });
    }
  }

  return { striker: a, victim: v, events };
}

function handleDeath(state: BattleState, dead: UnitStack, rng: Rng): BattleState {
  if (dead.abilityState?.deathProcessed) return state;
  let nextState: BattleState = {
    ...state,
    units: state.units.map(unit => unit.id === dead.id
      ? { ...dead, abilityState: { ...(dead.abilityState ?? {}), deathProcessed: true } }
      : { ...unit, effects: (unit.effects ?? []).filter(effect => !(effect.kind === 'bind' && effect.sourceStackId === dead.id)) }),
    grid: setOccupant(state.grid, dead.pos, null),
    log: [...state.log, { type: 'death', data: { unitId: dead.id } }],
  };

  if (dead.definition.name === 'Unicorn' &&
      !nextState.units.some(unit => unit.count > 0 && unit.definition.name === 'Unicorn' && alliedTeamId(nextState, unit) === alliedTeamId(nextState, dead))) {
    const fortune = hasArtifact(nextState, dead, 'silver_horseshoe') ? 2 : 1;
    nextState = {
      ...nextState,
      units: nextState.units.map(unit => !unit.isHero && alliedTeamId(nextState, unit) === alliedTeamId(nextState, dead) && (unit.modifierSources ?? []).some(source => source.id === 'fortunes_herald')
        ? { ...unit, luck: Math.max(-3, unit.luck - fortune), modifierSources: (unit.modifierSources ?? []).filter(source => source.id !== 'fortunes_herald') }
        : unit),
    };
  }
  if (dead.definition.name === 'Peasant' && hasArtifact(nextState, dead, 'martyrs_banner')) {
    const controller = controllerOfUnit(dead);
    const alreadyUsed = nextState.heroActionState?.[controller]?.martyrsBannerUsed === true;
    if (!alreadyUsed) {
      nextState = {
        ...nextState,
        units: nextState.units.map(unit => unit.count > 0 && controllerOfUnit(unit) === controller && factionUnit(nextState, unit, 'knight')
          ? addModifierSource({ ...unit, initiativeBonus: (unit.initiativeBonus ?? 0) + 1, damageBonus: (unit.damageBonus ?? 0) + 1 }, { id: 'martyrs_banner', label: "Martyr's Banner", stats: { initiative: 1, damage: 1 } })
          : unit),
        heroActionState: { ...(nextState.heroActionState ?? {}), [controller]: { ...(nextState.heroActionState?.[controller] ?? {}), martyrsBannerUsed: true } },
      };
    }
  }
  if (dead.definition.name === 'Skeleton' && !dead.abilityState?.consumedDeath && hasArtifact(nextState, dead, 'shroud_of_preservation')) {
    const preserved = Math.floor(Number(dead.abilityState?.lastDamageStartCount ?? dead.startCount) / 2);
    const recipient = nextState.units.filter(unit => unit.id !== dead.id && unit.count > 0 && unit.definition.name === 'Skeleton' && controllerOfUnit(unit) === controllerOfUnit(dead))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0];
    if (preserved > 0 && recipient) {
      nextState = {
        ...nextState,
        units: nextState.units.map(unit => unit.id === recipient.id ? { ...unit, count: unit.count + preserved, startCount: unit.startCount + preserved } : unit),
        log: [...nextState.log, { type: 'status', data: { effect: 'shroud_of_preservation', unitId: recipient.id, sourceId: dead.id, count: preserved } }],
      };
    }
  }
  const infections = (dead.effects ?? []).filter(effect => effect.kind === 'infect');
  if (infections.length > 0) {
    const blightOwner = Object.entries(nextState.artifacts ?? {}).find(([controller, ids]) => {
      if (!ids.includes('blighted_soil')) return false;
      const representative = nextState.units.find(unit => controllerOfUnit(unit) === controller);
      return representative ? representative.side !== dead.side : controller === 'player' && dead.side === 'enemy';
    });
    if (blightOwner) {
      const attack = infections.reduce((sum, effect) => sum + Number(effect.stats?.attack ?? 0), 0);
      const defense = infections.reduce((sum, effect) => sum + Number(effect.stats?.defense ?? 0), 0);
      nextState = {
        ...nextState,
        units: nextState.units.map(unit => {
          if (unit.count <= 0 || unit.isHero || unit.side !== dead.side || chebyshevDistance(unit.pos, dead.pos) !== 1) return unit;
          return addEffect(addModifierSource(
            { ...unit, attackBuff: (unit.attackBuff ?? 0) + attack, defenseBuff: (unit.defenseBuff ?? 0) + defense },
            { id: 'blighted_soil', label: 'Blighted Soil', stats: { attack, defense } },
          ), {
            id: 'blighted_soil', kind: 'infect', sourceStackId: dead.id, sourceControllerId: blightOwner[0],
            positive: false, innate: false, removable: true, stacks: infections.length, stats: { attack, defense },
          }, false);
        }),
        log: [...nextState.log, { type: 'status', data: { effect: 'blighted_soil', sourceId: dead.id } }],
      };
    }
  }
  const burnOwner = dead.burnSourceId ? state.units.find(unit => unit.id === dead.burnSourceId) : undefined;
  if ((dead.burnRoundsLeft ?? 0) > 0 && burnOwner && hasArtifact(state, burnOwner, 'furnace_heart')) {
    nextState = {
      ...nextState,
      units: nextState.units.map(unit => unit.count > 0 && !unit.isHero && unit.id !== dead.id && chebyshevDistance(unit.pos, dead.pos) === 1 && !unit.definition.abilities.includes('fire_immunity')
        ? { ...unit, burnDamage: hasArtifact(state, burnOwner, 'crown_of_wildfire') ? (unit.burnDamage ?? 0) + (dead.burnDamage ?? 0) : dead.burnDamage, burnRoundsLeft: 2, burnSourceId: burnOwner.id }
        : unit),
    };
  }
  if (demonUnitDefinition(dead) && hasArtifact(nextState, dead, 'ashen_covenant') && !dead.abilityState?.ashenCovenantUsed) {
    const controller = controllerOfUnit(dead);
    nextState = {
      ...nextState,
      units: nextState.units.map(unit => unit.id === dead.id
        ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), ashenCovenantUsed: true } }
        : unit.count > 0 && controllerOfUnit(unit) === controller ? { ...unit, atb: Math.min(1, unit.atb + 0.1) } : unit),
    };
  }
  for (const [controller, ids] of Object.entries(nextState.artifacts ?? {})) {
    if (!ids.includes('horde_drum')) continue;
    const owner = nextState.units.find(unit => controllerOfUnit(unit) === controller);
    if (!owner || alliedTeamId(nextState, owner) === alliedTeamId(nextState, dead)) continue;
    nextState = {
      ...nextState,
      units: nextState.units.map(unit => unit.count > 0 && !unit.isHero && unit.id !== nextState.currentUnitId && alliedTeamId(nextState, unit) === alliedTeamId(nextState, owner)
        ? { ...unit, atb: Math.min(1, unit.atb + 0.1) }
        : unit),
    };
  }

  // Death bursts resolve before rebirth and corpse claims.
  if (dead.definition.abilities.includes('cinderburst') && !dead.abilityState?.cinderburstUsed) {
    const amount = dead.startCount * dead.definition.hp * (hasArtifact(nextState, dead, 'powder_keg') ? 0.4 : 0.25);
    const victims = areaTargets(nextState, dead.pos, { size: 3, secondaryMultiplier: 1, friendlyFire: true })
      .map(area => area.stack).filter(unit => unit.id !== dead.id);
    for (const victim of victims) {
      const burstRng = rngFor(nextState.seed, nextState.actionSeq ?? 0, 'afterDeath', 'cinderburst', victim.id);
      const hit = resolveDamagePacket(nextState, {
        sourceId: dead.id, targetId: victim.id, amount, type: 'magic', attributes: ['fire'], delivery: 'secondary', ranged: false, direct: true, canTriggerOnHit: false, canLifeDrain: false,
      }, burstRng);
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === victim.id ? hit.target : unit), log: [...nextState.log, { type: 'status', data: { effect: 'cinderburst', unitId: victim.id, damage: hit.outcome.finalDamage, killed: hit.outcome.killed } }] };
      if (hit.target.count === 0) nextState = handleDeath(nextState, hit.target, burstRng);
    }
  }

  const demonUnit = demonUnitDefinition(dead);
  const temporary = dead.origin?.type === 'summoned';
  const seal = demonUnit && !temporary && hasArtifact(nextState, dead, 'seal_of_the_ninth_circle');
  const ownRebirth = dead.definition.abilities.includes('infernal_rebirth') && !temporary;
  const alreadyReborn = dead.origin?.type === 'reborn' || dead.abilityState?.rebirthUsed;
  const willRebirth = !alreadyReborn && (seal || ownRebirth);

  const corpseOwner = Object.entries(nextState.artifacts ?? {}).find(([controller, ids]) => {
    if (!ids.includes('gravewrights_grimoire') && !ids.includes('dragon_ossuary')) return false;
    const representative = nextState.units.find(unit => unit.controllerId === controller);
    return representative ? representative.side !== dead.side : controller === 'player' && dead.side === 'enemy';
  });
  const canRaise = !!corpseOwner && !dead.isHero && dead.origin?.type !== 'summoned' && !dead.abilityState?.corpseRaised;

  if (willRebirth) {
    const fraction = ownRebirth && seal ? 0.6 : 0.3;
    const revived: UnitStack = {
      ...dead,
      count: Math.max(1, Math.ceil(dead.startCount * fraction)), hp: dead.definition.hp, atb: 0,
      origin: { type: 'reborn', source: seal ? 'ninth_circle' : 'infernal_rebirth' },
      abilityState: { ...(nextState.units.find(unit => unit.id === dead.id)?.abilityState ?? dead.abilityState ?? {}), deathProcessed: false, rebirthUsed: true },
    };
    nextState = { ...nextState, units: nextState.units.map(unit => unit.id === dead.id ? revived : unit), grid: setOccupant(nextState.grid, dead.pos, dead.id), log: [...nextState.log, { type: 'status', data: { effect: 'rebirth', unitId: dead.id, count: revived.count } }] };
  }

  if (canRaise) {
    const [controller, ids] = corpseOwner!;
    const definition = ids.includes('dragon_ossuary') ? BONE_DRAGON : SKELETON;
    let count = Math.max(1, Math.ceil(dead.startCount * dead.definition.hp * 0.1 / definition.hp));
    if (dead.modifierSources?.some(source => source.id === 'infecting_strike') && ids.includes('plague_bell')) count *= 2;
    const occupied = (pos: Pos) => !!nextState.grid.cells[pos.row]?.[pos.col]?.occupantId || !!nextState.grid.cells[pos.row]?.[pos.col]?.blocked;
    const pos = !occupied(dead.pos) ? dead.pos : nextState.grid.cells.flat()
      .filter(cell => !cell.blocked && !cell.occupantId)
      .map(cell => ({ col: cell.col, row: cell.row }))
      .sort((a, b) => chebyshevDistance(a, dead.pos) - chebyshevDistance(b, dead.pos) || a.row - b.row || a.col - b.col)[0];
    if (pos) {
      const id = `u${nextState.nextId}`;
      const ownerUnit = nextState.units.find(unit => unit.controllerId === controller);
      const raisedDefinition = definition.name === 'Skeleton' && ids.includes('the_black_procession')
        ? { ...definition, abilities: [...definition.abilities, 'infecting_strike', 'drain_morale'] }
        : definition;
      const raised: UnitStack = {
        id, definition: raisedDefinition, count, startCount: count, hp: definition.hp, pos,
        side: ownerUnit?.side ?? 'player', controllerId: controller, hasRetaliated: false, shotsLeft: definition.shots,
        morale: 0, luck: 0, atb: ids.includes('marrow_crown') ? 0.5 : 0, tiePriority: rng(), isDefending: false,
        origin: { type: 'summoned', source: ids.includes('dragon_ossuary') ? 'dragon_ossuary' : 'necromancy' }, hasTakenTurn: false,
      };
      nextState = {
        ...nextState,
        units: [...nextState.units.map(unit => unit.id === dead.id ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), corpseRaised: true } } : unit), raised],
        grid: setOccupant(nextState.grid, pos, id), nextId: nextState.nextId + 1,
        log: [...nextState.log, { type: 'status', data: { effect: 'corpse_raise', unitId: id, sourceId: dead.id, count, artifact: ids.includes('dragon_ossuary') ? 'dragon_ossuary' : 'gravewrights_grimoire' } }],
      };
    }
  }
  return nextState;
}

const GRID_W = 12;
const GRID_H = 10;

export interface BattleInitOptions {
  controllers?: { player: string; ally: string; enemy: string };
  allyHero?: Hero;
  modifierSources?: UnitModifierSource[];
  gauntletRound?: number;
  artifacts?: Record<string, string[]>;
  controllerTeams?: Record<string, string>;
  enemyVeterancy?: number;
  training?: Record<string, Record<string, { weapon?: boolean; armour?: boolean }>>;
  savedFormation?: SavedFormation;
}

export function heroFor(state: BattleState, unit: UnitStack): Hero {
  return unit.controllerId ? (state.heroes?.[unit.controllerId] ?? state.hero) : state.hero;
}

function updateHeroFor(state: BattleState, unit: UnitStack, update: (hero: Hero) => Hero): BattleState {
  const id = unit.controllerId;
  if (!id || !state.heroes?.[id]) return { ...state, hero: update(state.hero) };
  const hero = update(state.heroes[id]);
  return {
    ...state,
    hero: id === 'host' ? hero : state.hero,
    heroes: { ...state.heroes, [id]: hero },
  };
}

export const SPELLS: Record<SpellId, { cost: number; friendly: boolean }> = {
  lightning: { cost: 3, friendly: false },
  bloodlust: { cost: 2, friendly: true },
  stoneskin: { cost: 2, friendly: true },
  slow: { cost: 2, friendly: false },
  chain_lightning: { cost: 3, friendly: false },
  resurrect: { cost: 5, friendly: true },
  blizzard: { cost: 5, friendly: false },
};

const DEFAULT_WIZARD_SPELLS: SpellId[] = ['lightning', 'bloodlust', 'stoneskin'];
function prepareBattleHero(hero: Hero, artifactIds: string[]): Hero {
  if (hero.class !== 'wizard') return { ...hero, mana: 0, spells: [] };
  const granted: Array<[string, SpellId]> = [
    ['scroll_of_slowing', 'slow'],
    ['tome_of_chain_lightning', 'chain_lightning'],
    ['sigil_of_resurrection', 'resurrect'],
    ['tome_of_the_blizzard', 'blizzard'],
  ];
  const spells = [...new Set([...(hero.spells ?? DEFAULT_WIZARD_SPELLS), ...granted.filter(([id]) => artifactIds.includes(id)).map(([, spell]) => spell)])];
  const maximum = maxMana(hero);
  return { ...hero, mana: Math.min(hero.mana ?? maximum, maximum), spells };
}

/** Lightning is true damage: flat, level-scaled, ignores attack/defense. */
export function lightningDamage(level: number): number {
  return 12 + 8 * level;
}

/** Forecast for the spell-aiming tooltip: Lightning's exact true damage; null for buffs. */
export function spellPreview(hero: Hero, spell: SpellId, target: UnitStack): DamagePreview | null {
  if (SPELLS[spell].friendly) return null;
  const damage = Math.round(lightningDamage(hero.level) * getSorceryMultiplier(hero));
  const { killed } = applyDamage(target, damage);
  return { min: damage, max: damage, killsMin: killed, killsMax: killed };
}

function slotToStack(
  slot: ArmySlot,
  side: 'player' | 'enemy',
  index: number,
  armySize: number,
  id: string,
  colShift = 0,
  controllerId?: string
): UnitStack {
  const col = side === 'player' ? 1 + colShift : GRID_W - 2;
  // Keep the traditional inner-row lineup for up to eight stacks. Larger
  // armies use every board row, evenly and uniquely, so ten stacks never
  // overlap or spawn beyond the 10-row grid.
  const row = armySize <= GRID_H - 2
    ? 1 + index
    : Math.round(index * (GRID_H - 1) / Math.max(1, armySize - 1));
  const bravery = abilityLevel(slot.unit, 'bravery');
  let stack: UnitStack = {
    id,
    definition: slot.unit,
    count: slot.count,
    startCount: slot.count,
    hp: slot.unit.hp,
    pos: { col, row },
    side,
    hasRetaliated: false,
    shotsLeft: slot.unit.shots,
    // Bravery: the unit carries its own morale into battle, either side; +level.
    morale: clampProc(bravery),
    luck: 0,
    atb: 0,
    isDefending: false,
    origin: { type: 'deployed', armySlotKey: slot.unit.name },
    hasTakenTurn: false,
    ...(controllerId ? { controllerId } : {}),
  };
  if (bravery > 0) {
    stack = addModifierSource(stack, { id: 'bravery', label: 'Bravery', stats: { morale: bravery } });
  }
  return stack;
}

const clampProc = (v: number) => Math.max(-3, Math.min(3, v));

export function initBattle(
  playerArmy: ArmySlot[],
  enemyArmy: ArmySlot[],
  hero: Hero,
  seed = Date.now(),
  allyArmy: ArmySlot[] = [],
  armyBonuses?: ArmyBonuses,
  options: BattleInitOptions = {}
): BattleState {
  let grid = createGrid(GRID_W, GRID_H);
  let nextId = 1;
  const allocateId = () => `u${nextId++}`;

  const moraleBonus = getMoraleBonus(hero);
  const tacticsShift = getTacticsShift(hero);
  const logisticsBonus = getLogisticsBonus(hero);
  const luckBonus = getNatureLuckBonus(hero);
  let playerUnits: UnitStack[] = playerArmy.map((slot, i) => {
    let stack = slotToStack(slot, 'player', i, playerArmy.length, allocateId(), tacticsShift, options.controllers?.player);
    if (moraleBonus > 0) {
      stack = addModifierSource(
        { ...stack, morale: stack.morale + moraleBonus },
        { id: 'leadership', label: 'Leadership', stats: { morale: moraleBonus } },
      );
    }
    if (logisticsBonus > 0) {
      stack = addModifierSource(
        { ...stack, speedBonus: logisticsBonus },
        { id: 'logistics', label: 'Logistics', stats: { speed: logisticsBonus } },
      );
    }
    if (luckBonus > 0) {
      stack = addModifierSource(
        { ...stack, luck: stack.luck + luckBonus },
        { id: 'natures_luck', label: 'Nature’s Luck', stats: { luck: luckBonus } },
      );
    }
    if (armyBonuses) {
      stack = {
        ...stack,
        attackBuff: (stack.attackBuff ?? 0) + armyBonuses.attack,
        defenseBuff: (stack.defenseBuff ?? 0) + armyBonuses.defense,
        initiativeBonus: armyBonuses.initiative,
        speedBonus: (stack.speedBonus ?? 0) + armyBonuses.speed,
        morale: clampProc(stack.morale + armyBonuses.morale),
        luck: clampProc(stack.luck + armyBonuses.luck),
      };
      const configuredSources = options.modifierSources ?? [];
      if (configuredSources.length > 0) {
        stack = { ...stack, modifierSources: [...(stack.modifierSources ?? []), ...configuredSources] };
        const sourceTotals = configuredSources.reduce<Partial<Record<UnitModifierStat, number>>>((totals, source) => {
          for (const [stat, value] of Object.entries(source.stats)) {
            totals[stat as UnitModifierStat] = (totals[stat as UnitModifierStat] ?? 0) + value;
          }
          return totals;
        }, {});
        const residual = Object.fromEntries(
          Object.entries(armyBonuses)
            .map(([stat, value]) => [stat, value - (sourceTotals[stat as UnitModifierStat] ?? 0)])
            .filter(([, value]) => value !== 0)
        );
        if (Object.keys(residual).length > 0) {
          stack = addModifierSource(stack, { id: 'other_army_bonuses', label: 'Other army bonuses', stats: residual });
        }
      } else {
        const stats = Object.fromEntries(Object.entries(armyBonuses).filter(([, value]) => value !== 0));
        if (Object.keys(stats).length > 0) {
          stack = addModifierSource(stack, { id: 'army_bonuses', label: 'Army bonuses', stats });
        }
      }
    }
    return stack;
  });
  const playerArtifactIds = options.artifacts?.[options.controllers?.player ?? 'player'] ?? [];
  if (playerArtifactIds.includes('banner_of_the_first_raid')) {
    const turns = playerArtifactIds.includes('red_sunrise') ? 2 : 1;
    playerUnits = playerUnits.map(unit => ({
      ...unit,
      empoweredTurnsRemaining: turns,
      speedBonus: (unit.speedBonus ?? 0) + (playerArtifactIds.includes('map_of_the_first_raid') ? 4 : 2),
      abilityState: { ...(unit.abilityState ?? {}), bannerSpeed: playerArtifactIds.includes('map_of_the_first_raid') ? 4 : 2 },
    }));
  }
  if (playerArtifactIds.includes('mouth_of_hell')) {
    playerUnits = playerUnits.map(unit => unit.origin?.type === 'summoned' || unit.definition.abilities.includes('gate')
      ? unit
      : { ...unit, definition: { ...unit.definition, abilities: [...unit.definition.abilities, 'gate'] } });
  }
  if (playerUnits.some(unit => unit.definition.name === 'Unicorn')) {
    const fortune = playerArtifactIds.includes('silver_horseshoe') ? 2 : 1;
    playerUnits = playerUnits.map(unit => addModifierSource(
      { ...unit, luck: clampProc(unit.luck + fortune) },
      { id: 'fortunes_herald', label: "Fortune's Herald", stats: { luck: fortune } },
    ));
  }
  if (playerArtifactIds.includes('quicksilver_dew')) {
    playerUnits = playerUnits.map(unit => unit.definition.name === 'Sprite'
      ? addModifierSource({ ...unit, initiativeBonus: (unit.initiativeBonus ?? 0) + 4 }, { id: 'quicksilver_dew', label: 'Quicksilver Dew', stats: { initiative: 4 } })
      : unit);
  }
  if (playerArtifactIds.includes('endless_quiver')) {
    playerUnits = playerUnits.map(unit => unit.definition.shots > 0 ? { ...unit, shotsLeft: unit.shotsLeft + 6 } : unit);
  }
  if (playerArtifactIds.includes('black_fletched_quiver')) {
    playerUnits = playerUnits.map(unit => ['Orc', 'Cyclops'].includes(unit.definition.name) ? { ...unit, shotsLeft: unit.shotsLeft + 3 } : unit);
  }
  playerUnits = playerUnits.map(unit => unit.definition.abilities.includes('soaring_strike')
    ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), soaring: true } }
    : unit);
  let enemyUnits: UnitStack[] = enemyArmy.map((slot, i) =>
    slotToStack(slot, 'enemy', i, enemyArmy.length, allocateId(), 0, options.controllers?.enemy)
  );
  // Summoned ally: player-side but AI-driven, fielded one column behind the
  // player line. Hero skill bonuses (morale/logistics/luck/gating) deliberately
  // don't apply — the ally fights under its own banner.
  let allyUnits: UnitStack[] = allyArmy.map((slot, i) => {
    let stack: UnitStack = {
      ...slotToStack(slot, 'player', i, allyArmy.length, allocateId(), -1, options.controllers?.ally),
      isAlly: true,
    };
    if (options.allyHero) {
      const allyMorale = getMoraleBonus(options.allyHero);
      const allyLogistics = getLogisticsBonus(options.allyHero);
      const allyLuck = getNatureLuckBonus(options.allyHero);
      if (allyMorale > 0) {
        stack = addModifierSource(
          { ...stack, morale: stack.morale + allyMorale },
          { id: 'leadership', label: 'Leadership', stats: { morale: allyMorale } },
        );
      }
      if (allyLogistics > 0) {
        stack = addModifierSource(
          { ...stack, speedBonus: allyLogistics },
          { id: 'logistics', label: 'Logistics', stats: { speed: allyLogistics } },
        );
      }
      if (allyLuck > 0) {
        stack = addModifierSource(
          { ...stack, luck: stack.luck + allyLuck },
          { id: 'natures_luck', label: 'Nature’s Luck', stats: { luck: allyLuck } },
        );
      }
    }
    return stack;
  });
  const allyArtifactIds = options.artifacts?.[options.controllers?.ally ?? 'ally'] ?? [];
  if (allyArtifactIds.includes('banner_of_the_first_raid')) {
    const turns = allyArtifactIds.includes('red_sunrise') ? 2 : 1;
    const speed = allyArtifactIds.includes('map_of_the_first_raid') ? 4 : 2;
    allyUnits = allyUnits.map(unit => ({ ...unit, empoweredTurnsRemaining: turns, speedBonus: (unit.speedBonus ?? 0) + speed, abilityState: { ...(unit.abilityState ?? {}), bannerSpeed: speed } }));
  }
  if (allyArtifactIds.includes('mouth_of_hell')) {
    allyUnits = allyUnits.map(unit => unit.definition.abilities.includes('gate') ? unit : { ...unit, definition: { ...unit.definition, abilities: [...unit.definition.abilities, 'gate'] } });
  }
  if (allyUnits.some(unit => unit.definition.name === 'Unicorn')) {
    const fortune = allyArtifactIds.includes('silver_horseshoe') ? 2 : 1;
    allyUnits = allyUnits.map(unit => addModifierSource({ ...unit, luck: clampProc(unit.luck + fortune) }, { id: 'fortunes_herald', label: "Fortune's Herald", stats: { luck: fortune } }));
  }
  if (allyArtifactIds.includes('quicksilver_dew')) allyUnits = allyUnits.map(unit => unit.definition.name === 'Sprite' ? addModifierSource({ ...unit, initiativeBonus: (unit.initiativeBonus ?? 0) + 4 }, { id: 'quicksilver_dew', label: 'Quicksilver Dew', stats: { initiative: 4 } }) : unit);
  if (allyArtifactIds.includes('endless_quiver')) allyUnits = allyUnits.map(unit => unit.definition.shots > 0 ? { ...unit, shotsLeft: unit.shotsLeft + 6 } : unit);
  if (allyArtifactIds.includes('black_fletched_quiver')) allyUnits = allyUnits.map(unit => ['Orc', 'Cyclops'].includes(unit.definition.name) ? { ...unit, shotsLeft: unit.shotsLeft + 3 } : unit);
  allyUnits = allyUnits.map(unit => unit.definition.abilities.includes('soaring_strike') ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), soaring: true } } : unit);

  if (enemyUnits.some(unit => unit.definition.name === 'Unicorn')) {
    enemyUnits = enemyUnits.map(unit => addModifierSource({ ...unit, luck: clampProc(unit.luck + 1) }, { id: 'fortunes_herald', label: "Fortune's Herald", stats: { luck: 1 } }));
  }
  enemyUnits = enemyUnits.map(unit => unit.definition.abilities.includes('soaring_strike') ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), soaring: true } } : unit);

  // The hero fights too: off-grid on the flank, ATB-scheduled, untargetable.
  // Whole-board ranged strike via the shoot action (no retaliation). attack: 0
  // because the hero's real attack already reaches player damage as heroAttack.
  const heroStack: UnitStack = {
    id: allocateId(),
    definition: {
      name: 'Hero', tier: 7, speed: 0, initiative: 10, hp: 1,
      attack: 0, defense: hero.defense,
      minDamage: 2 + 3 * hero.level, maxDamage: 5 + 6 * hero.level,
      shots: 9999, range: 99, isLarge: false, abilities: [],
    },
    count: 1,
    startCount: 1,
    hp: 1,
    pos: { col: -2, row: Math.floor(GRID_H / 2) },
    side: 'player',
    hasRetaliated: false,
    shotsLeft: 9999,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    isHero: true,
    ...(options.controllers?.player ? { controllerId: options.controllers.player } : {}),
  };

  const allyHeroStack: UnitStack | null = options.allyHero
    ? {
        ...heroStack,
        id: allocateId(),
        definition: {
          ...heroStack.definition,
          defense: options.allyHero.defense,
          minDamage: 2 + 3 * options.allyHero.level,
          maxDamage: 5 + 6 * options.allyHero.level,
        },
        pos: { col: -3, row: Math.floor(GRID_H / 2) },
        isAlly: true,
        controllerId: options.controllers?.ally,
      }
    : null;

  // Everyone starts level at 0, so initiative alone decides the opening order.
  // The only randomness is `tiePriority`, drawn once per stack and used solely
  // to settle exact ties — seeded, so a replay reproduces the same order.
  const rng = mulberry32(seed);
  const allUnits = [...playerUnits, ...allyUnits, ...enemyUnits, heroStack, ...(allyHeroStack ? [allyHeroStack] : [])]
    .map(u => ({ ...u, atb: 0, tiePriority: rng() }));

  grid = placeUnits(grid, allUnits);

  // Scatter impassable rocks in the middle columns (3–8), away from spawns.
  const OBSTACLES = 7;
  for (let placed = 0, guard = 0; placed < OBSTACLES && guard < 100; guard++) {
    const col = 3 + Math.floor(rng() * 6);
    const row = Math.floor(rng() * GRID_H);
    const cell = grid.cells[row][col];
    if (cell.blocked || cell.occupantId) continue;
    grid = setBlocked(grid, { col, row });
    placed++;
  }

  const playerController = options.controllers?.player ?? 'player';
  const allyController = options.controllers?.ally ?? 'ally';
  const playerHero = prepareBattleHero(hero, options.artifacts?.[playerController] ?? []);
  const allyPreparedHero = options.allyHero
    ? prepareBattleHero(options.allyHero, options.artifacts?.[allyController] ?? [])
    : undefined;
  const state: BattleState = {
    grid,
    units: allUnits,
    hero: playerHero,
    ...(options.controllers ? {
      heroes: {
        [options.controllers.player]: playerHero,
        ...(options.allyHero ? {
          [options.controllers.ally]: allyPreparedHero!,
        } : {}),
      },
    } : {}),
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [{ type: 'round_start', data: { round: 1 } }],
    result: 'ongoing',
    seed,
    actionSeq: 0,
    gauntletRound: Math.max(1, Math.floor(options.gauntletRound ?? 1)),
    artifacts: options.artifacts ?? {},
    controllerTeams: options.controllerTeams,
    controllerStats: options.enemyVeterancy
      ? { [options.controllers?.enemy ?? 'enemy']: { attack: options.enemyVeterancy, defense: options.enemyVeterancy, label: 'Enemy Veterancy' } }
      : undefined,
    training: options.training,
    nextId,
    // Battles open in deployment; the first actor is already chosen (advance
    // below), but the UI freezes the turn loop until beginCombat flips this.
    phase: 'deploy',
  };
  const reconciled = applySavedFormation(
    state,
    options.savedFormation,
    options.controllers?.player,
    DEPLOY_COLS - 1 + tacticsShift,
  ).state;
  return advance(reconciled);
}

/** Left columns the player may deploy in (before Knight Tactics). */
export const DEPLOY_COLS = 3;

/** Placement capacity for whole strategic army stacks. Deployment never
 * creates detachments, so this is a board-layout limit rather than a split cap. */
export const MAX_FIELD_STACKS = 10;

/** A cell is deployable if it's in the left zone (widened forward by Tactics)
 *  and on the board. Occupancy/obstacles are checked separately by the ops. */
export function isInDeployZone(pos: Pos, tacticsShift: number): boolean {
  return (
    pos.col >= 0 &&
    pos.col <= DEPLOY_COLS - 1 + tacticsShift &&
    pos.row >= 0 &&
    pos.row < GRID_H
  );
}

/** Whether a stack is one the player may reposition during deployment. */
function isDeployable(u: UnitStack | undefined, controllerId?: string): u is UnitStack {
  if (!u || u.side !== 'player' || u.isHero) return false;
  return controllerId ? u.controllerId === controllerId : !u.isAlly;
}

/** Move one of the player's stacks to `to` during deployment. Empty in-zone
 *  cell → move; another of the player's stacks → swap. Any other target
 *  (out of zone, obstacle, enemy, hero) is a no-op returning the same state. */
export function deployMove(state: BattleState, unitId: string, to: Pos, controllerId?: string): BattleState {
  const unit = state.units.find(u => u.id === unitId);
  if (!isDeployable(unit, controllerId)) return state;
  if (!isInDeployZone(to, getTacticsShift(heroFor(state, unit)))) return state;
  const cell = state.grid.cells[to.row]?.[to.col];
  if (!cell) return state;
  if (cell.blocked) return state;
  if (cell.occupantId === unitId) return state;

  const occupant = cell.occupantId ? state.units.find(u => u.id === cell.occupantId) : undefined;
  if (cell.occupantId && !isDeployable(occupant, controllerId)) return state; // can't displace enemies/hero

  const from = unit.pos;
  if (occupant) {
    const units = state.units.map(u =>
      u.id === unitId ? { ...u, pos: to } : u.id === occupant.id ? { ...u, pos: from } : u
    );
    const grid = setOccupant(setOccupant(state.grid, from, occupant.id), to, unitId);
    return { ...state, units, grid };
  }
  const units = state.units.map(u => (u.id === unitId ? { ...u, pos: to } : u));
  const grid = setOccupant(setOccupant(state.grid, from, null), to, unitId);
  return { ...state, units, grid };
}

/** @deprecated Deployment splitting was removed. Kept as a rejecting shim for
 * old callers; current UI and protocol expose only whole-stack moves/swaps. */
export function splitStack(state: BattleState, unitId: string, amount: number, to: Pos, controllerId?: string): BattleState {
  void unitId; void amount; void to; void controllerId;
  return state;
}

/** Leave deployment and start the battle. The first actor was already chosen
 *  in initBattle, so this only unfreezes the turn loop. */
export function beginCombat(state: BattleState): BattleState {
  return { ...state, phase: 'combat', log: [] };
}

/** advanceTurn, plus Wizard Mysticism's mana regen whenever a new round starts. */
function advance(state: BattleState): BattleState {
  let next = advanceTurn(state);
  if (next.currentUnitId) {
    next = {
      ...next,
      units: next.units.map(unit => unit.id === next.currentUnitId ? decreaseCooldowns(unit) : unit),
    };
  }
  if (next.round > state.round) {
    if (next.heroes) {
      const heroes = Object.fromEntries(Object.entries(next.heroes).map(([id, hero]) => {
        const regen = getMysticismRegen(hero);
        return [id, regen > 0 ? { ...hero, mana: Math.min(maxMana(hero), (hero.mana ?? 0) + regen) } : hero];
      }));
      const hostId = next.units.find(unit => unit.isHero && !unit.isAlly)?.controllerId;
      return { ...next, heroes, hero: hostId ? heroes[hostId] : next.hero };
    }
    const regen = getMysticismRegen(next.hero);
    if (regen > 0) return { ...next, hero: { ...next.hero, mana: Math.min(maxMana(next.hero), (next.hero.mana ?? 0) + regen) } };
  }
  return next;
}

export function checkBattleEnd(state: BattleState): 'player_wins' | 'enemy_wins' | null {
  // Heroes don't hold the field: a side with only its hero left has lost.
  const playerAlive = state.units.some(u => u.side === 'player' && u.count > 0 && !u.isHero);
  const enemyAlive = state.units.some(u => u.side === 'enemy' && u.count > 0 && !u.isHero);
  if (!enemyAlive) return 'player_wins';
  if (!playerAlive) return 'enemy_wins';
  return null;
}

function validDebugTemplate(stack: DebugStackTemplate): boolean {
  const d = stack.definition;
  const finiteNonNegative = (...values: number[]) => values.every(value => Number.isFinite(value) && value >= 0);
  return (
    !stack.isHero &&
    (stack.side === 'player' || stack.side === 'enemy') &&
    Number.isInteger(stack.count) && stack.count >= 1 &&
    Number.isInteger(stack.startCount) && stack.startCount >= stack.count &&
    finiteNonNegative(d.hp, d.attack, d.defense, d.minDamage, d.maxDamage, d.speed, d.initiative, d.shots, d.range) &&
    d.hp >= 1 && d.minDamage <= d.maxDamage &&
    Number.isFinite(stack.hp) && stack.hp >= 1 && stack.hp <= d.hp &&
    Number.isFinite(stack.shotsLeft) && stack.shotsLeft >= 0 && stack.shotsLeft <= d.shots &&
    Number.isFinite(stack.morale) && stack.morale >= -3 && stack.morale <= 3 &&
    Number.isFinite(stack.luck) && stack.luck >= -3 && stack.luck <= 3 &&
    Number.isFinite(stack.atb) && stack.atb >= 0 && stack.atb <= 1
  );
}

function reconcileDebugState(state: BattleState): BattleState {
  const result = checkBattleEnd(state);
  if (result) {
    return {
      ...state,
      result,
      log: [...state.log, { type: 'battle_end', data: { result, debug: true } }],
    };
  }
  const current = state.units.find(unit => unit.id === state.currentUnitId && unit.count > 0);
  return current ? state : advance({ ...state, currentUnitId: null });
}

/** Apply a development debug mutation without consuming the current stack's
 * turn. This lives in the deterministic engine rather than the UI because the
 * same action must reproduce exactly in battle-history replays. */
function applyDebugOperation(state: BattleState, operation: DebugBattleOperation): BattleState {
  if (state.result !== 'ongoing') return state;
  const event = (unitId?: string): BattleEvent => ({
    type: 'debug',
    data: { label: operation.label, ...(unitId ? { unitId } : {}) },
  });

  if (operation.kind === 'note') {
    return { ...state, log: [...state.log, event()] };
  }

  if (operation.kind === 'restore') {
    return {
      ...operation.snapshot,
      log: [...state.log, event()],
    };
  }

  if (operation.kind === 'add') {
    if (!validDebugTemplate(operation.stack)) return state;
    const cell = state.grid.cells[operation.to.row]?.[operation.to.col];
    if (!cell || cell.blocked || cell.occupantId) return state;
    const id = `u${state.nextId}`;
    const stack: UnitStack = {
      ...operation.stack,
      definition: {
        ...operation.stack.definition,
        abilities: [...operation.stack.definition.abilities],
        ...(operation.stack.definition.abilityLevels
          ? { abilityLevels: { ...operation.stack.definition.abilityLevels } }
          : {}),
      },
      id,
      pos: operation.to,
      tiePriority: mulberry32(state.seed + state.nextId)(),
    };
    return reconcileDebugState({
      ...state,
      units: [...state.units, stack],
      grid: setOccupant(state.grid, operation.to, id),
      nextId: state.nextId + 1,
      log: [...state.log, event(id)],
    });
  }

  const index = state.units.findIndex(unit => unit.id === operation.unitId && unit.count > 0 && !unit.isHero);
  if (index < 0) return state;
  const target = state.units[index];
  let replacement: UnitStack;

  if (operation.kind === 'update') {
    if (!validDebugTemplate(operation.stack) || operation.stack.side !== target.side) return state;
    replacement = {
      ...operation.stack,
      definition: {
        ...operation.stack.definition,
        abilities: [...operation.stack.definition.abilities],
        ...(operation.stack.definition.abilityLevels
          ? { abilityLevels: { ...operation.stack.definition.abilityLevels } }
          : {}),
      },
      id: target.id,
      pos: target.pos,
      tiePriority: target.tiePriority,
    };
  } else if (operation.kind === 'heal') {
    replacement = { ...target, count: target.startCount, hp: target.definition.hp };
  } else if (operation.kind === 'switch_side') {
    replacement = {
      ...target,
      side: target.side === 'player' ? 'enemy' : 'player',
      isAlly: undefined,
      controllerId: undefined,
    };
  } else {
    replacement = { ...target, count: 0, hp: 0 };
  }

  let next: BattleState = {
    ...state,
    units: state.units.map((unit, i) => (i === index ? replacement : unit)),
    grid:
      operation.kind === 'delete' || operation.kind === 'kill'
        ? setOccupant(state.grid, target.pos, null)
        : state.grid,
    log: [...state.log, event(target.id)],
  };
  if (operation.kind === 'kill') {
    next = { ...next, log: [...next.log, { type: 'death', data: { unitId: target.id, debug: true } }] };
  }
  return reconcileDebugState(next);
}

export function applyAction(state: BattleState, action: BattleAction): BattleState {
  if (action.type === 'debug') return applyDebugOperation(state, action.operation);
  if (!validateAction(state, action)) return state;
  const rng = rngFor(state.seed, state.actionSeq ?? 0, 'action', action.type, state.currentUnitId ?? 'none');
  let nextState = { ...state, units: [...state.units], log: [...state.log] };

  const actorId = nextState.currentUnitId;
  if (!actorId) return nextState;
  const actorIdx = nextState.units.findIndex(u => u.id === actorId);
  if (actorIdx < 0) return nextState;
  let actor = nextState.units[actorIdx];
  let actorHero = heroFor(nextState, actor);
  if (actor.isHero && hasArtifact(nextState, actor, 'prism_of_the_fallen')) {
    const controller = controllerOfUnit(actor);
    nextState = {
      ...nextState,
      heroActionState: {
        ...(nextState.heroActionState ?? {}),
        [controller]: {
          ...(nextState.heroActionState?.[controller] ?? {}),
          prismDeadSnapshot: nextState.units.filter(unit => !unit.isHero && unit.count <= 0).length,
        },
      },
    };
  }

  // Source-owned effects last until their source's next turn. Expire them
  // before that source chooses an action, including a Ranger replacing a Hunt
  // Plan or a Barbarian whose Blood for Blood window has ended.
  if (actor.isHero) {
    nextState = {
      ...nextState,
      units: nextState.units.map(unit => ({
        ...unit,
        effects: (unit.effects ?? []).filter(effect => effect.sourceStackId !== actor.id || effect.expires?.sourceTurnsRemaining !== 1),
        marks: (unit.marks ?? []).filter(mark => mark.sourceId !== actor.id || mark.expires?.sourceTurnsRemaining !== 1),
      })),
    };
    if (actorHero.class === 'ranger') {
      const controller = actor.controllerId ?? actor.side;
      nextState = {
        ...nextState,
        heroActionState: {
          ...(nextState.heroActionState ?? {}),
          [controller]: { ...(nextState.heroActionState?.[controller] ?? {}), activePlan: null, targetId: null, area: [] },
        },
      };
    }
    actor = nextState.units[actorIdx];
  }
  if (!actor.isHero) {
    const started = tickTargetEffects(actor, 'start');
    if (started !== actor) {
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actor.id ? started : unit) };
      actor = started;
    }
  }

  // Re-entry heights live in turnOrder's reentryAtb, which the turns bar's
  // hover preview reads too, so the preview can't promise a different scale.
  const reenter = (st: BattleState, atb: number): BattleState => ({
    ...st,
    units: st.units.map(u => (u.id === actorId ? { ...u, atb } : u)),
  });
  const complete = (st: BattleState, atb: number, immediateExtraTurn = false): BattleState => {
    st = applyFuneralDrumProgress(state, st);
    const units = st.units.map(unit => {
      if (unit.id !== actorId) return unit;
      const remainingEmpowerment = unit.empoweredTurnsRemaining === undefined ? undefined : Math.max(0, unit.empoweredTurnsRemaining - 1);
      const bannerSpeed = Number(unit.abilityState?.bannerSpeed ?? 0);
      let completedUnit: UnitStack = {
        ...unit,
        atb,
        hasTakenTurn: true,
        ...(remainingEmpowerment === undefined ? {} : { empoweredTurnsRemaining: remainingEmpowerment }),
        ...(remainingEmpowerment === 0 && bannerSpeed ? {
          speedBonus: (unit.speedBonus ?? 0) - bannerSpeed,
          abilityState: { ...(unit.abilityState ?? {}), bannerSpeed: 0 },
        } : {}),
      };
      if (completedUnit.definition.abilities.includes('soaring_strike')) {
        const safe = !st.units.some(enemy => enemy.count > 0 && enemy.side !== completedUnit.side && chebyshevDistance(enemy.pos, completedUnit.pos) === 1);
        if (safe) completedUnit = { ...completedUnit, abilityState: { ...(completedUnit.abilityState ?? {}), soaring: true } };
      }
      const movedThisAction = action.type === 'move' || (action.type === 'attack' && !!action.moveTo) ||
        (action.type === 'ability' && action.abilityId === 'ride_by_attack');
      if (factionUnit(st, completedUnit, 'knight') && heroSystemState(st, completedUnit).activeOrder === 'hold_the_line') {
        if (!movedThisAction) completedUnit = addEffect(completedUnit, {
          id: 'braced', kind: 'braced', sourceControllerId: controllerOfUnit(completedUnit),
          positive: true, innate: true, removable: false, stacks: 1, expires: { targetTurnsRemaining: 1, phase: 'start' },
        });
        else completedUnit = { ...completedUnit, effects: (completedUnit.effects ?? []).filter(effect => effect.kind !== 'braced') };
      }
      return tickTargetEffects(completedUnit);
    });
    const completed = { ...st, units, actionSeq: (st.actionSeq ?? 0) + 1 };
    if (!immediateExtraTurn) return advance(completed);
    return {
      ...completed,
      units: completed.units.map(unit => unit.id === actorId ? decreaseCooldowns(unit) : unit),
    };
  };
  const completeTerminal = (st: BattleState, result: BattleState['result']): BattleState => {
    const completed = complete({ ...st, result }, 0, true);
    return { ...completed, result, currentUnitId: null };
  };
  let turnReentry = 0;
  let luckyAction = false;

  // Status effects resolve at the start of the acting unit's turn: burn damage first, then a blind skip.
  if (!actor.isHero && actor.count > 0) {
    if ((actor.burnRoundsLeft ?? 0) > 0) {
      const burnDamage = actor.burnDamage ?? 0;
      const burnMultiplier = actor.burnSourceId
        ? (nextState.artifacts?.[nextState.units.find(unit => unit.id === actor.burnSourceId)?.controllerId ?? 'player']?.includes('blackened_wick') ? 2 : 1)
        : 1;
      const { target: remaining, outcome } = resolveDamagePacket(nextState, {
        sourceId: actor.burnSourceId,
        targetId: actor.id,
        amount: burnDamage * burnMultiplier,
        type: 'magic',
        attributes: ['fire'],
        delivery: 'dot',
        ranged: false,
        direct: false,
        canTriggerOnHit: false,
        canLifeDrain: false,
      }, rng);
      const killed = outcome.killed;
      const burnEvents: BattleEvent[] = [];
      const roundsLeft = (actor.burnRoundsLeft ?? 0) - 1;
      const burned: UnitStack = {
        ...remaining,
        burnRoundsLeft: roundsLeft > 0 ? roundsLeft : undefined,
        burnDamage: roundsLeft > 0 ? actor.burnDamage : undefined,
        burnSourceId: roundsLeft > 0 ? actor.burnSourceId : undefined,
      };
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === actorIdx ? burned : u)) };
      nextState.log = [...nextState.log, { type: 'status', data: { effect: 'burn', unitId: actorId, damage: outcome.finalDamage, killed, resisted: outcome.resisted } }, ...burnEvents];
      if (burned.count === 0) {
        nextState = handleDeath(nextState, burned, rng);
        const endResult = checkBattleEnd(nextState);
        if (endResult) {
          nextState.log = [...nextState.log, { type: 'battle_end', data: { result: endResult } }];
          return completeTerminal(nextState, endResult);
        }
        return complete(nextState, 0);
      }
      actor = burned;
    }

    if (actor.blindedUntilRound !== undefined) {
      const cleared = { ...actor, blindedUntilRound: undefined };
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === actorIdx ? cleared : u)) };
      nextState.log = [...nextState.log, { type: 'status', data: { effect: 'blind', unitId: actorId } }];
      return complete(nextState, 0);
    }
  }

  // Bind blocks movement for exactly one upcoming turn, then clears.
  const wasBound = actor.boundUntilRound !== undefined;
  if (wasBound) {
    const cleared = { ...actor, boundUntilRound: undefined };
    nextState = { ...nextState, units: nextState.units.map((u, i) => (i === actorIdx ? cleared : u)) };
    actor = cleared;
  }

  // Invalid casts are rejected outright: turn is kept, nothing changes.
  if (action.type === 'hero_action') {
    const resolved = resolveHeroAction(nextState, actor, action);
    if (resolved.state === nextState && resolved.events.length === 0) return state;
    nextState = { ...resolved.state, log: [...resolved.state.log, ...resolved.events] };
    const newlyDead = nextState.units.filter(unit => unit.count === 0 && !unit.isHero && state.units.some(before => before.id === unit.id && before.count > 0));
    for (const dead of newlyDead) nextState = handleDeath(nextState, dead, rngFor(nextState.seed, nextState.actionSeq ?? 0, 'death', action.actionId, dead.id));
    const endResult = checkBattleEnd(nextState);
    if (endResult) return { ...nextState, result: endResult, actionSeq: (nextState.actionSeq ?? 0) + 1 };
    return complete(nextState, resolved.reentry ?? 0);
  } else if (action.type === 'cast') {
    const spell = SPELLS[action.spell];
    const target = nextState.units.find(u => u.id === action.targetId);
    if (
      !actor.isHero ||
      !spell ||
      (actorHero.mana ?? 0) < spell.cost ||
      !target ||
      target.count === 0 ||
      target.isHero ||
      (spell.friendly ? target.side !== actor.side : target.side === actor.side)
    ) {
      return state;
    }
  }

  // Same contract as an invalid cast: returning `state` rather than `nextState`
  // hands back exactly what the caller passed in, so the stack keeps its turn
  // and nothing is logged — a stale UI button is a no-op, never a burned turn.
  // Legality is judged against `nextState`, so this turn's burn damage already
  // counts toward whether the ability is usable.
  if (action.type === 'ability' && !canActivate(nextState, actor, action.abilityId, action.targetId, action.to)) {
    return state;
  }

  // Morale check
  const moraleResult = checkMorale(actor, rng);
  if (moraleResult === 'freeze') {
    nextState.log = [...nextState.log, { type: 'morale_freeze', data: { unitId: actorId } }];
    return complete(nextState, 0);
  }

  if (action.type === 'cast') {
    const spell = SPELLS[action.spell];
    const targetIdx = nextState.units.findIndex(u => u.id === action.targetId);
    const target = nextState.units[targetIdx];

    if (action.spell === 'lightning' || action.spell === 'chain_lightning' || action.spell === 'blizzard') {
      const conduit = nextState.units.some(unit => unit.count > 0 && unit.definition.abilities.includes('arcane_conduit') && alliedTeamId(nextState, unit) === alliedTeamId(nextState, actor));
      const prism = hasArtifact(nextState, actor, 'prism_of_the_fallen')
        ? 1 + 0.2 * Number(heroSystemState(nextState, actor).prismDeadSnapshot ?? 0)
        : 1;
      const baseDamage = Math.round(lightningDamage(actorHero.level) * getSorceryMultiplier(actorHero) * (conduit ? 1.1 : 1) * prism);
      let victims: Array<{ unit: UnitStack; multiplier: number }> = [{ unit: target, multiplier: 1 }];
      if (action.spell === 'chain_lightning') {
        victims.push(...nextState.units.filter(unit => unit.side !== actor.side && unit.count > 0 && !unit.isHero && unit.id !== target.id)
          .sort((a, b) => Math.abs(a.pos.col - target.pos.col) + Math.abs(a.pos.row - target.pos.row) - (Math.abs(b.pos.col - target.pos.col) + Math.abs(b.pos.row - target.pos.row)) || a.id.localeCompare(b.id))
          .slice(0, 2).map(unit => ({ unit, multiplier: 0.5 })));
      } else if (action.spell === 'blizzard') {
        victims = nextState.units.filter(unit => unit.count > 0 && !unit.isHero && Math.max(Math.abs(unit.pos.col - target.pos.col), Math.abs(unit.pos.row - target.pos.row)) <= 1)
          .sort((a, b) => a.id.localeCompare(b.id)).map(unit => ({ unit, multiplier: unit.id === target.id ? 1 : 0.6 }));
      }
      for (const victim of victims) {
        const packetRng = rngFor(nextState.seed, nextState.actionSeq ?? 0, 'damage', action.spell, victim.unit.id);
        const { target: remaining, outcome } = resolveDamagePacket(nextState, {
          sourceId: actor.id,
          targetId: victim.unit.id,
          amount: baseDamage * victim.multiplier,
          type: 'magic',
          attributes: action.spell === 'blizzard' ? ['cold'] : ['lightning'],
          delivery: victim.unit.id === target.id ? 'primary' : 'secondary',
          ranged: true,
          direct: true,
          canTriggerOnHit: false,
          canLifeDrain: false,
        }, packetRng);
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === remaining.id ? remaining : unit) };
        nextState.log = [...nextState.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: victim.unit.id, damage: outcome.finalDamage, killed: outcome.killed, resisted: outcome.resisted } }];
        if (remaining.count === 0) nextState = handleDeath(nextState, remaining, packetRng);
      }
    } else if (action.spell === 'resurrect') {
      const healed = applyHeal(target, 30 + 10 * actorHero.level);
      nextState = { ...nextState, units: nextState.units.map((unit, i) => i === targetIdx ? healed.stack : unit), log: [...nextState.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: target.id, heal: healed.healed, revived: healed.revived } }] };
    } else {
      const buffed =
        action.spell === 'bloodlust'
          ? addEffect(addModifierSource(
              { ...target, attackBuff: (target.attackBuff ?? 0) + 4 },
              { id: 'bloodlust', label: 'Bloodlust', stats: { attack: 4 } },
            ), { id: 'bloodlust', kind: 'bloodlust', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: true, innate: false, removable: true, stacks: 1, stats: { attack: 4 } })
          : action.spell === 'stoneskin' ? addEffect(addModifierSource(
              { ...target, defenseBuff: (target.defenseBuff ?? 0) + 4 },
              { id: 'stoneskin', label: 'Stoneskin', stats: { defense: 4 } },
            ), { id: 'stoneskin', kind: 'stoneskin', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: true, innate: false, removable: true, stacks: 1, stats: { defense: 4 } }) : addEffect(addModifierSource(
              { ...target, speedBonus: (target.speedBonus ?? 0) - 2, initiativeBonus: (target.initiativeBonus ?? 0) - 2 },
              { id: 'slow', label: 'Slow', stats: { speed: -2, initiative: -2 } },
            ), { id: 'slow', kind: 'slow', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: false, innate: false, removable: true, stacks: 1, stats: { speed: -2, initiative: -2 }, expires: { targetTurnsRemaining: 1, phase: 'start' } });
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === targetIdx ? buffed : u)) };
      nextState.log = [...nextState.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: target.id } }];
    }

    nextState = updateHeroFor(nextState, actor, hero => ({ ...hero, mana: (hero.mana ?? 0) - spell.cost }));
    actorHero = heroFor(nextState, actor);

  } else if (action.type === 'ability') {
    if (action.abilityId === 'ride_by_attack') {
      const origin = { ...actor.pos };
      const prepared = {
        ...nextState,
        units: nextState.units.map(unit => unit.id === actor.id ? {
          ...unit,
          abilityState: { ...(unit.abilityState ?? {}), rideByResolving: true },
        } : unit),
      };
      let resolved = applyAction(prepared, { type: 'attack', targetId: action.targetId!, moveTo: action.to });
      const survivor = resolved.units.find(unit => unit.id === actor.id);
      if (survivor?.count && !resolved.grid.cells[origin.row][origin.col].occupantId && !resolved.grid.cells[origin.row][origin.col].blocked) {
        resolved = moveStack(resolved, actor.id, origin, { kind: 'return' });
      }
      const cooldown = mechanicParam(resolved, actor, 'ride_by_attack', 'cooldown', 2);
      const nextTurnAlreadySelected = resolved.currentUnitId === actor.id;
      resolved = {
        ...resolved,
        units: resolved.units.map(unit => {
          if (unit.id !== actor.id) return unit;
          const cooling = startCooldown({
            ...unit,
            abilityState: { ...(unit.abilityState ?? {}), rideByResolving: false },
          }, 'ride_by_attack', cooldown);
          // The nested attack may have already advanced directly into this
          // Cavalier's next turn. In that case this is a genuine turn-start
          // tick, not an immediate decrement during the action just used.
          return nextTurnAlreadySelected ? decreaseCooldowns(cooling) : cooling;
        }),
        log: [...resolved.log, { type: 'status', data: { effect: 'ride_by_attack', unitId: actor.id, returned: resolved.units.find(unit => unit.id === actor.id)?.pos.col === origin.col && resolved.units.find(unit => unit.id === actor.id)?.pos.row === origin.row } }],
      };
      return resolved;
    }
    if (action.abilityId === 'caustic_breath') {
      const length = mechanicParam(nextState, actor, 'caustic_breath', 'range', 3);
      const cells = lineCells(actor.pos, action.to!, length);
      const victims = cells.flatMap(cell => {
        const id = nextState.grid.cells[cell.row]?.[cell.col]?.occupantId;
        const unit = id ? nextState.units.find(candidate => candidate.id === id && candidate.count > 0 && !candidate.isHero) : undefined;
        return unit ? [unit] : [];
      });
      const per = actor.definition.minDamage + Math.floor(rng() * (actor.definition.maxDamage - actor.definition.minDamage + 1));
      const amount = per * actor.count * 0.75;
      for (const victim of victims) {
        const packetRng = rngFor(nextState.seed, nextState.actionSeq ?? 0, 'damage', 'caustic_breath', victim.id);
        const hit = resolveDamagePacket(nextState, {
          sourceId: actor.id, targetId: victim.id, amount, type: 'magic', attributes: ['acid'], delivery: 'secondary', ranged: false, direct: true, canTriggerOnHit: false, canLifeDrain: false,
        }, packetRng);
        const corroded = hit.target.count > 0 ? addEffect(hit.target, {
          id: 'corroded', kind: 'corroded', sourceStackId: actor.id, sourceControllerId: actor.controllerId,
          positive: false, innate: false, removable: true, stacks: 1, expires: { targetTurnsRemaining: 3 },
        }) : hit.target;
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === victim.id ? corroded : unit), log: [...nextState.log, { type: 'status', data: { effect: 'caustic_breath', unitId: victim.id, damage: hit.outcome.finalDamage, killed: hit.outcome.killed } }] };
        if (corroded.count === 0) nextState = handleDeath(nextState, corroded, packetRng);
      }
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actor.id ? startCooldown(unit, 'caustic_breath', 2) : unit) };
      return complete(nextState, 0);
    }
    if (action.abilityId === 'gate') {
      const uses = Number(actor.abilityState?.gateUses ?? 0);
      const baseUses = actor.definition.abilities.includes('infernal_rebirth') ? (hasArtifact(nextState, actor, 'gatekeepers_chain') ? 2 : 1) : 0;
      const baseCount = actor.count * (hasArtifact(nextState, actor, 'brimstone_key') ? 5 : 3);
      const count = uses < baseUses
        ? (uses === 0 ? baseCount : Math.ceil(baseCount / 2))
        : Math.max(1, Math.ceil(actor.startCount * actor.definition.hp * 0.25 / IMP.hp));
      const id = `u${nextState.nextId}`;
      const summon: UnitStack = {
        id, definition: IMP, count, startCount: count, hp: IMP.hp, pos: action.to!, side: actor.side,
        hasRetaliated: false, shotsLeft: IMP.shots, morale: 0, luck: 0, atb: 0, tiePriority: rng(), isDefending: false,
        controllerId: actor.controllerId, origin: { type: 'summoned', source: 'gate', summonerId: actor.id }, hasTakenTurn: false,
      };
      nextState = {
        ...nextState,
        units: [...nextState.units.map(unit => unit.id === actor.id ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), gateUses: uses + 1 } } : unit), summon],
        grid: setOccupant(nextState.grid, action.to!, id), nextId: nextState.nextId + 1,
        log: [...nextState.log, { type: 'status', data: { effect: 'gate', unitId: actor.id, summonId: id, count } }],
      };
      return complete(nextState, 0);
    }
    // The ability returns replacement stacks and log entries; grid cleanup and
    // deaths stay here, so consuming a stack whole frees its cell like any
    // other death would.
    const { units: patched, events } = UNIT_ABILITIES[action.abilityId].resolve(nextState, actor, action.targetId, action.to);
    const byId = new Map(patched.map(u => [u.id, u]));
    nextState = { ...nextState, units: nextState.units.map(u => byId.get(u.id) ?? u) };
    nextState.log = [...nextState.log, ...events];
    for (const restored of patched) {
      const before = state.units.find(unit => unit.id === restored.id);
      if (before?.count === 0 && restored.count > 0 && !nextState.grid.cells[restored.pos.row]?.[restored.pos.col]?.occupantId) {
        nextState = { ...nextState, grid: setOccupant(nextState.grid, restored.pos, restored.id) };
      }
    }
    if (action.abilityId === 'absorb_skeleton' && hasArtifact(nextState, actor, 'vertebral_key')) turnReentry = Math.max(turnReentry, 0.5);
    for (const spent of patched) {
      if (spent.count === 0) nextState = handleDeath(nextState, spent, rng);
    }

  } else if (action.type === 'defend') {
    const newUnits = nextState.units.map((u, i) => (i === actorIdx ? { ...u, isDefending: true } : u));
    nextState = { ...nextState, units: newUnits };
    nextState.log = [...nextState.log, { type: 'defend', data: { unitId: actorId } }];

  } else if (action.type === 'move') {
    if (wasBound) {
      nextState.log = [...nextState.log, { type: 'status', data: { effect: 'bind_block', unitId: actorId } }];
      return complete(nextState, 0);
    }
    const from = actor.pos;
    nextState = moveStack(nextState, actor.id, action.to, { kind: 'voluntary' });
    const mover = nextState.units.find(unit => unit.id === actor.id)!;
    nextState.log = [...nextState.log, { type: 'move', data: { unitId: actorId, from, to: action.to, path: mover.lastMovePath } }];

  } else if (action.type === 'attack') {
    const targetId = action.targetId;
    const targetIdx = nextState.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(nextState, 0));
    const target = nextState.units[targetIdx];

    // Combined move+attack: relocate the actor before resolving the melee (blocked while bound).
    let attacker = actor;
    if (action.moveTo && wasBound) {
      nextState.log = [...nextState.log, { type: 'status', data: { effect: 'bind_block', unitId: actorId } }];
    } else if (action.moveTo) {
      nextState = moveStack(nextState, actor.id, action.moveTo, { kind: 'voluntary' });
      attacker = nextState.units.find(unit => unit.id === actor.id)!;
      nextState.log = [...nextState.log, { type: 'move', data: { unitId: actorId, from: attacker.lastMovedFrom, to: action.moveTo, path: attacker.lastMovePath } }];
    }

    const wasSoaring = !!attacker.abilityState?.soaring;
    const { damage: rolledDamage, luckEvents } = rollHit(nextState, attacker, target, rng, heroFor(nextState, attacker).attack);
    luckyAction ||= luckEvents.some(event => event.type === 'luck' && event.data.kind === 'good');
    const bloodCharge = attacker.definition.abilities.includes('overfeed') ? Number(attacker.abilityState?.bloodCharge ?? 0) : 0;
    const damage = rolledDamage + bloodCharge;
    const { killed, remaining: hitTarget, events: hurtEvents, soulReaperKills } = battleStrike(nextState, attacker, target, damage);
    const { striker: attackerAfterHit, victim: remaining, events: hitEvents } =
      applyOnHitEffects(rng, attacker, hitTarget, rolledDamage, nextState.round, nextState, nextState.gauntletRound ?? 1);

    let consumedAttacker = wasSoaring
      ? { ...attackerAfterHit, abilityState: { ...(attackerAfterHit.abilityState ?? {}), soaring: false } }
      : attackerAfterHit;
    if (bloodCharge > 0) consumedAttacker = { ...consumedAttacker, abilityState: { ...(consumedAttacker.abilityState ?? {}), bloodCharge: 0 } };
    let resolvedVictim = remaining;
    if (target.definition.abilities.includes('corrosive_carapace') && resolvedVictim.count > 0 && consumedAttacker.count > 0) {
      consumedAttacker = addEffect(consumedAttacker, {
        id: 'corroded', kind: 'corroded', sourceStackId: target.id, sourceControllerId: target.controllerId,
        positive: false, innate: false, removable: true, stacks: 1, expires: { targetTurnsRemaining: 3 },
      });
    }
    if (attacker.definition.abilities.includes('claim_blessing') && resolvedVictim.count > 0 && consumedAttacker.count > 0) {
      const theft = stealRandomBuff(resolvedVictim, consumedAttacker, rngFor(nextState.seed, nextState.actionSeq ?? 0, 'afterHit', 'claim_blessing', attacker.id));
      consumedAttacker = theft.recipient;
      resolvedVictim = theft.target;
      if (theft.stolen) hitEvents.push({ type: 'status', data: { effect: 'claim_blessing', unitId: attacker.id, targetId: target.id, stolen: theft.stolen.kind } });
    }
    if (damage > 0) {
      const quarry = triggerQuarry(nextState, consumedAttacker, resolvedVictim);
      resolvedVictim = quarry.target;
      if (quarry.triggered) turnReentry = Math.max(turnReentry, 0.1);
    }
    nextState = {
      ...nextState,
      units: nextState.units.map((u, i) => {
        if (i === targetIdx) return resolvedVictim;
        if (i === actorIdx) return consumedAttacker;
        return u;
      }),
    };
    nextState.log = [...nextState.log, ...luckEvents, { type: 'attack', data: { attackerId: actorId, targetId, damage, killed } }, ...hurtEvents, ...hitEvents];
    if (hasArtifact(nextState, attacker, 'fateweavers_horn') && factionUnit(nextState, attacker, 'ranger')) {
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), fateweaverUsed: true } } : unit) };
    }
    if (soulReaperKills > 0 && hasArtifact(nextState, attacker, 'knights_reliquary')) {
      nextState = addTemporarySkeletons(nextState, consumedAttacker, soulReaperKills, 'knights_reliquary');
    }
    nextState = flushBloodTithe(nextState, actorId);

    const movedDistance = attacker.lastMovedFrom
      ? (attacker.lastMovedDistance ?? chebyshevDistance(attacker.pos, attacker.lastMovedFrom))
      : 0;
    const dealSecondary = (victim: UnitStack, amount: number, id: string, type: 'physical' | 'magic' = 'physical', attributes?: Array<'lightning' | 'fire'>) => {
      const packetRng = rngFor(nextState.seed, nextState.actionSeq ?? 0, 'damage', id, victim.id);
      const hit = resolveDamagePacket(nextState, {
        sourceId: actor.id, targetId: victim.id, amount, type, attributes, delivery: 'secondary', ranged: false, direct: true, canTriggerOnHit: false, canLifeDrain: false,
      }, packetRng);
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === victim.id ? hit.target : unit), log: [...nextState.log, { type: 'status', data: { effect: id, sourceId: actor.id, unitId: victim.id, damage: hit.outcome.finalDamage, killed: hit.outcome.killed } }] };
      if (hit.target.count === 0) nextState = handleDeath(nextState, hit.target, packetRng);
    };

    if (attacker.definition.abilities.includes('overrun')) {
      const dc = Math.sign(target.pos.col - attacker.pos.col);
      const dr = Math.sign(target.pos.row - attacker.pos.row);
      const maximum = hasArtifact(nextState, attacker, 'stormlance') ? Math.max(nextState.grid.width, nextState.grid.height) : 1;
      for (let step = 1; step <= maximum; step++) {
        const cell = nextState.grid.cells[target.pos.row + dr * step]?.[target.pos.col + dc * step];
        if (!cell) break;
        const victim = cell.occupantId ? nextState.units.find(unit => unit.id === cell.occupantId && unit.count > 0 && unit.side !== attacker.side && !unit.isHero) : undefined;
        if (victim) dealSecondary(victim, damage * 0.5, 'overrun');
        if (!hasArtifact(nextState, attacker, 'stormlance')) break;
      }
    }
    if (attacker.definition.abilities.includes('shockwave')) {
      for (const area of areaTargets(nextState, target.pos, { size: 3, primaryId: target.id, secondaryMultiplier: 0.5, enemyOf: attacker, friendlyFire: false }).filter(area => !area.primary)) dealSecondary(area.stack, damage * 0.5, 'shockwave');
    }
    if (attacker.definition.abilities.includes('three_headed_strike')) {
      const fraction = hasArtifact(nextState, attacker, 'brass_collar') ? 0.75 : 0.5;
      const secondary = areaTargets(nextState, target.pos, { size: 3, primaryId: target.id, secondaryMultiplier: fraction, enemyOf: attacker, friendlyFire: false })
        .filter(area => !area.primary).sort((a, b) => (b.stack.count * b.stack.definition.hp + b.stack.hp) - (a.stack.count * a.stack.definition.hp + a.stack.hp) || a.stack.id.localeCompare(b.stack.id)).slice(0, 2);
      for (const area of secondary) dealSecondary(area.stack, damage * fraction, 'three_headed_strike');
    }
    if (attacker.definition.abilities.includes('thunder_dive') && movedDistance >= (hasArtifact(nextState, attacker, 'storm_spurs') ? 3 : 4)) {
      const fraction = hasArtifact(nextState, attacker, 'storm_spurs') ? 0.75 : 0.5;
      for (const area of areaTargets(nextState, target.pos, { size: 3, primaryId: target.id, secondaryMultiplier: fraction, enemyOf: attacker, friendlyFire: false }).filter(area => !area.primary)) dealSecondary(area.stack, damage * fraction, 'thunder_dive', 'magic', ['lightning']);
    }
    if (attacker.definition.abilities.includes('doomstep') && (target.burnRoundsLeft ?? 0) > 0 && hasArtifact(nextState, attacker, 'hells_verdict')) {
      for (const area of areaTargets(nextState, target.pos, { size: 3, primaryId: target.id, secondaryMultiplier: 0.5, enemyOf: attacker, friendlyFire: true }).filter(area => !area.primary)) {
        dealSecondary(area.stack, damage * 0.5, 'hells_verdict', 'magic', ['fire']);
      }
    }
    const targetTotalHp = (target.count - 1) * target.definition.hp + target.hp;
    if (attacker.definition.abilities.includes('follow_through') && damage > targetTotalHp) {
      const fraction = hasArtifact(nextState, attacker, 'headsmans_cleaver') ? 1 : 0.5;
      const candidate = nextState.units.filter(unit => unit.count > 0 && unit.side !== attacker.side && unit.id !== target.id && !unit.isHero && chebyshevDistance(unit.pos, attacker.pos) === 1)
        .sort((a, b) => (a.count * a.definition.hp + a.hp) - (b.count * b.definition.hp + b.hp) || a.id.localeCompare(b.id))[0];
      if (candidate) dealSecondary(candidate, (damage - targetTotalHp) * fraction, 'follow_through');
    }
    if (attacker.definition.abilities.includes('battering_ram') && movedDistance >= (hasArtifact(nextState, attacker, 'ironbound_horns') ? 2 : 3) && resolvedVictim.count > 0) {
      const dc = Math.sign(target.pos.col - attacker.pos.col);
      const dr = Math.sign(target.pos.row - attacker.pos.row);
      const destination = { col: target.pos.col + dc, row: target.pos.row + dr };
      const beforePush = nextState;
      nextState = moveStack(nextState, target.id, destination, { kind: 'forced' });
      if (nextState === beforePush) {
        dealSecondary(resolvedVictim, damage * (hasArtifact(nextState, attacker, 'ironbound_horns') ? 0.5 : 0.25), 'collision');
      }
    }

    if (resolvedVictim.count === 0) {
      nextState = handleDeath(nextState, resolvedVictim, rng);
    }

    // Retaliation (only on regular attack, not on ranged)
    const noRetaliation = !!attackerAfterHit.abilityState?.rideByResolving ||
      (attacker.definition.abilities.includes('darting_assault') && movedDistance > 0) ||
      (attacker.definition.abilities.includes('pounce') && movedDistance >= 3) ||
      (attacker.definition.abilities.includes('grand_joust') && movedDistance >= 3) ||
      (attacker.definition.abilities.includes('soaring_strike') && wasSoaring) ||
      (attacker.definition.abilities.includes('thunder_dive') && movedDistance >= (hasArtifact(nextState, attacker, 'storm_spurs') ? 3 : 4)) ||
      (attacker.definition.abilities.includes('doomstep') && (target.burnRoundsLeft ?? 0) > 0) ||
      (target.morale <= -3 && hasArtifact(nextState, attacker, 'empty_throne')) ||
      (target.effects ?? []).some(effect => effect.data?.noRetaliation === true) ||
      (factionUnit(nextState, attacker, 'ranger') && heroSystemState(nextState, attacker).activePlan === 'set_the_ambush' &&
        inChosenArea(heroSystemState(nextState, attacker).area, attacker.lastMovedFrom ?? attacker.pos) &&
        Number(attacker.abilityState?.ambushUsedPlanId ?? -2) !== Number(heroSystemState(nextState, attacker).planId ?? -1)) ||
      (attacker.effects ?? []).some(effect => effect.data?.noRetaliation === true);
    const retaliationDefender = nextState.units.find(unit => unit.id === target.id) ?? resolvedVictim;
    const retaliationAttacker = nextState.units.find(unit => unit.id === actor.id) ?? consumedAttacker;
    if (!noRetaliation && canRetaliate(retaliationDefender, retaliationAttacker)) {
      const { damage: retDamage, luckEvents: retLuckEvents } = rollHit(nextState, retaliationDefender, retaliationAttacker, rng, 0, false, true);
      const { killed: retKilled, remaining: hitAttacker, events: retHurtEvents, soulReaperKills: retReaperKills } =
        battleStrike(nextState, retaliationDefender, retaliationAttacker, retDamage);
      const { striker: retaliatorAfterHit, victim: retActor, events: retEvents } =
        applyOnHitEffects(rng, retaliationDefender, hitAttacker, retDamage, nextState.round, nextState, nextState.gauntletRound ?? 1);
      const updatedUnits = nextState.units.map(u => {
        if (u.id === targetId) {
          const orderReward = factionUnit(nextState, retaliatorAfterHit, 'knight') && heroSystemState(nextState, retaliatorAfterHit).activeOrder === 'ready_the_counterattack' && !retaliationDefender.abilityState?.counterattackUsed;
          const griffinReward = retaliationDefender.definition.name === 'Griffin' && hasArtifact(nextState, retaliationDefender, 'gryphon_talon_bracers');
          return {
            ...retaliatorAfterHit,
            hasRetaliated: true,
            atb: Math.min(1, retaliatorAfterHit.atb + (orderReward ? 0.1 : 0) + (griffinReward ? 0.1 : 0)),
            abilityState: { ...(retaliatorAfterHit.abilityState ?? {}), ...(orderReward ? { counterattackUsed: true } : {}) },
          };
        }
        if (u.id === actorId) return retActor;
        return u;
      });
      nextState = { ...nextState, units: updatedUnits };
      nextState.log = [...nextState.log, ...retLuckEvents, { type: 'retaliate', data: { attackerId: targetId, targetId: actorId, damage: retDamage, killed: retKilled } }, ...retHurtEvents, ...retEvents];
      if (retReaperKills > 0 && hasArtifact(nextState, retaliationDefender, 'knights_reliquary')) {
        nextState = addTemporarySkeletons(nextState, retaliatorAfterHit, retReaperKills, 'knights_reliquary');
      }
      nextState = flushBloodTithe(nextState, targetId);
      if (retaliatorAfterHit.definition.name === 'Naga' && hasArtifact(nextState, retaliatorAfterHit, 'serpents_coil')) {
        const coilStriker = nextState.units.find(unit => unit.id === targetId && unit.count > 0);
        const coilVictim = nextState.units.find(unit => unit.id === actorId && unit.count > 0);
        if (coilStriker && coilVictim) {
          const coilRoll = rollHit(nextState, coilStriker, coilVictim, rng, 0, false, true);
          const coilStrike = battleStrike(nextState, coilStriker, coilVictim, coilRoll.damage);
          const coilEffects = applyOnHitEffects(rng, coilStriker, coilStrike.remaining, coilRoll.damage, nextState.round, nextState, nextState.gauntletRound ?? 1);
          nextState = {
            ...nextState,
            units: nextState.units.map(unit => unit.id === targetId ? coilEffects.striker : unit.id === actorId ? coilEffects.victim : unit),
            log: [...nextState.log, ...coilRoll.luckEvents, { type: 'retaliate', data: { attackerId: targetId, targetId: actorId, damage: coilRoll.damage, killed: coilStrike.killed, coil: true } }, ...coilStrike.events, ...coilEffects.events],
          };
          nextState = flushBloodTithe(nextState, targetId);
        }
      }
      const retaliationVictim = nextState.units.find(unit => unit.id === actorId) ?? retActor;
      if (retaliationVictim.count === 0) {
        nextState = handleDeath(nextState, retaliationVictim, rng);
      }
    }

    // Double strike: a second melee hit after the retaliation, no second
    // retaliation. Skipped if either side died in the exchange.
    if (attacker.definition.abilities.includes('double_strike')) {
      const striker = nextState.units.find(u => u.id === actorId);
      const victim = nextState.units.find(u => u.id === targetId);
      if (striker && striker.count > 0 && victim && victim.count > 0) {
        const { damage: rolledD2, luckEvents: luck2 } = rollHit(nextState, striker, victim, rng, heroFor(nextState, striker).attack);
        luckyAction ||= luck2.some(event => event.type === 'luck' && event.data.kind === 'good');
        const d2 = attacker.definition.name === 'Wolf Rider'
          ? Math.max(1, Math.round(rolledD2 * (hasArtifact(nextState, attacker, 'split_fang_bridle') ? 0.75 : 0.5)))
          : rolledD2;
        const { killed: k2, remaining: v2, events: hurt2Events, soulReaperKills: reaper2 } = battleStrike(nextState, striker, victim, d2);
        const { striker: s2after, victim: v2after, events: hit2Events } =
          applyOnHitEffects(rng, striker, v2, d2, nextState.round, nextState, nextState.gauntletRound ?? 1);
        nextState = { ...nextState, units: nextState.units.map(u => (u.id === targetId ? v2after : u.id === actorId ? s2after : u)) };
        nextState.log = [...nextState.log, ...luck2, { type: 'attack', data: { attackerId: actorId, targetId, damage: d2, killed: k2 } }, ...hurt2Events, ...hit2Events];
        if (reaper2 > 0 && hasArtifact(nextState, striker, 'knights_reliquary')) nextState = addTemporarySkeletons(nextState, s2after, reaper2, 'knights_reliquary');
        nextState = flushBloodTithe(nextState, actorId);
        if (v2after.count === 0) nextState = handleDeath(nextState, v2after, rng);
      }
    }

    const primaryKilled = nextState.units.find(unit => unit.id === targetId)?.count === 0;
    if (primaryKilled) {
      if (attacker.definition.abilities.includes('blood_rush') || attacker.definition.abilities.includes('relentless') || hasArtifact(nextState, attacker, 'endless_hunt')) turnReentry = Math.max(turnReentry, 0.5);
      if (attacker.definition.abilities.includes('rampage')) turnReentry = 1;
      if (attacker.definition.abilities.includes('rampage') && hasArtifact(nextState, attacker, 'broken_maw_chain')) {
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), rampageDamageStacks: Number(unit.abilityState?.rampageDamageStacks ?? 0) + 1 } } : unit) };
      }
      if ((attacker.empoweredTurnsRemaining ?? 0) > 0 && hasArtifact(nextState, attacker, 'butchers_pennant')) {
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, empoweredTurnsRemaining: Math.max(2, unit.empoweredTurnsRemaining ?? 0) } : unit) };
      }
      if (
        hasArtifact(nextState, attacker, 'horn_of_the_wild_hunt') &&
        factionUnit(nextState, attacker, 'ranger') &&
        attacker.definition.shots === 0 &&
        !attacker.abilityState?.hornWildHuntUsed
      ) {
        nextState = {
          ...nextState,
          units: nextState.units.map(unit => {
            if (unit.id === actorId) {
              return { ...unit, abilityState: { ...(unit.abilityState ?? {}), hornWildHuntUsed: true } };
            }
            return unit.count > 0 && factionUnit(nextState, unit, 'ranger') && unit.definition.shots === 0
              ? { ...unit, atb: Math.min(1, unit.atb + 0.15) }
              : unit;
          }),
        };
      }
      if (attacker.definition.abilities.includes('doomstep') && (target.burnRoundsLeft ?? 0) > 0 && hasArtifact(nextState, attacker, 'devils_contract')) turnReentry = Math.max(turnReentry, 0.5);
      if (attacker.definition.abilities.includes('grand_joust') && movedDistance >= 3) {
        const champion = nextState.units.find(unit => unit.id === actorId);
        if (champion?.count && !nextState.grid.cells[target.pos.row][target.pos.col].occupantId) {
          nextState = moveStack(nextState, actorId, target.pos, { kind: 'advance' });
          turnReentry = Math.max(turnReentry, 0.5);
        }
      }
      if (attacker.definition.abilities.includes('soaring_strike') && wasSoaring && hasArtifact(nextState, attacker, 'cloud_reins')) {
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), soaring: true } } : unit) };
      }
    } else if (attacker.definition.abilities.includes('rampage') && hasArtifact(nextState, attacker, 'broken_maw_chain')) {
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), rampageDamageStacks: 0 } } : unit) };
    }
    if (attacker.definition.abilities.includes('darting_assault') && movedDistance > 0) {
      const sprite = nextState.units.find(unit => unit.id === actorId);
      const origin = attacker.lastMovedFrom!;
      const requestedRetreat = action.retreatTo;
      const requestedCell = requestedRetreat && nextState.grid.cells[requestedRetreat.row]?.[requestedRetreat.col];
      const retreat = requestedCell && !requestedCell.occupantId && !requestedCell.blocked ? requestedRetreat : origin;
      if (sprite?.count && !nextState.grid.cells[retreat.row][retreat.col].occupantId && !nextState.grid.cells[retreat.row][retreat.col].blocked) {
        nextState = moveStack(nextState, actorId, retreat, { kind: 'return' });
        const safeRetreat = !nextState.units.some(unit => unit.count > 0 && unit.side !== sprite.side && chebyshevDistance(unit.pos, retreat) === 1);
        if (hasArtifact(nextState, sprite, 'fleeting_shadow') && safeRetreat) turnReentry = Math.max(turnReentry, 0.25);
        if (hasArtifact(nextState, sprite, 'dew_of_the_first_dawn') && safeRetreat) {
          nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? addModifierSource({ ...unit, initiativeBonus: (unit.initiativeBonus ?? 0) + 1 }, { id: 'dew_of_the_first_dawn', label: 'Dew of the First Dawn', stats: { initiative: 1 } }) : unit) };
        }
      }
    }
    if (hasArtifact(nextState, attacker, 'the_wild_hunt') && factionUnit(nextState, attacker, 'ranger') && !target.hasTakenTurn && !attacker.abilityState?.wildHuntUsed) {
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), wildHuntUsed: true } } : unit) };
      turnReentry = Math.max(turnReentry, 0.5);
    }
    const plan = heroSystemState(nextState, attacker);
    if (factionUnit(nextState, attacker, 'ranger') && plan.activePlan === 'set_the_ambush' && inChosenArea(plan.area, attacker.lastMovedFrom ?? attacker.pos)) {
      const planId = Number(plan.planId ?? -1);
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), ambushUsedPlanId: planId } } : unit) };
    }

  } else if (action.type === 'shoot') {
    const targetId = (action as { type: 'shoot'; targetId: string }).targetId;
    const targetIdx = nextState.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(nextState, 0));
    const target = nextState.units[targetIdx];

    if (actor.shotsLeft <= 0) return advance(reenter(nextState, 0));
    if (isShootingBlocked(nextState, actor)) return advance(reenter(nextState, 0));

    // Multi-arrow artifacts consume one shot per arrow; fire as many as remain.
    let requestedShots = actor.definition.abilities.includes('double_shot') ? 2 : 1;
    if (hasArtifact(nextState, actor, 'bow_of_echoes')) requestedShots += 1;
    const freeAmmo = (actor.effects ?? []).some(effect => effect.kind === 'cry_loose' && effect.data?.freeAmmo === true);
    const shotCount = Math.min(requestedShots, actor.shotsLeft);
    // LordsWM far-shot rule: beyond the shooter's range the shot deals half damage.
    const farShot = isBeyondRange(actor, target);
    let currentTarget = target;
    let killedAny = false;
    let damagedPrimary = false;
    let focusTarget = String(actor.abilityState?.focusFireTarget ?? '');
    let focusCount = focusTarget === target.id ? Number(actor.abilityState?.focusFireCount ?? 0) : 0;
    for (let shot = 0; shot < shotCount && currentTarget.count > 0; shot++) {
      if ((actor.effects ?? []).some(effect => effect.kind === 'cry_loose') && hasArtifact(nextState, actor, 'horn_of_the_hunt')) {
        currentTarget = addMark(currentTarget, { kind: 'ranged_mark', ownerTeamId: alliedTeamId(nextState, actor), sourceControllerId: controllerOfUnit(actor), sourceId: actor.id });
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === currentTarget.id ? currentTarget : unit) };
      }
      const { damage: fullDamage, luckEvents } = rollHit(nextState, actor, currentTarget, rng, actorHero.attack, true);
      luckyAction ||= luckEvents.some(event => event.type === 'luck' && event.data.kind === 'good');
      let shotDamage = farShot && !hasArtifact(nextState, actor, 'black_fletched_quiver') ? Math.max(1, Math.round(fullDamage / 2)) : fullDamage;
      if (actor.definition.abilities.includes('combat_casting') && nextState.units.some(unit => unit.count > 0 && unit.side !== actor.side && chebyshevDistance(unit.pos, actor.pos) === 1)) shotDamage = Math.max(1, Math.round(shotDamage * 0.5));
      if (actor.definition.abilities.includes('focus_fire')) {
        const step = hasArtifact(nextState, actor, 'yewstring') ? 0.35 : 0.25;
        shotDamage = Math.max(1, Math.round(shotDamage * (1 + Math.min(4, focusCount) * step)));
        focusCount = Math.min(4, focusCount + 1);
        focusTarget = target.id;
      }
      if (actor.definition.abilities.includes('area_shot')) shotDamage = Math.max(1, Math.round(shotDamage * mechanicParam(nextState, actor, 'area_shot', 'damage', 0.5)));
      const { killed, remaining, events: shotEvents } = damageStack(currentTarget, shotDamage, nextState);
      damagedPrimary ||= shotDamage > 0;
      killedAny ||= killed > 0;
      currentTarget = remaining;
      nextState.log = [...nextState.log, ...luckEvents, { type: 'shoot', data: { attackerId: actorId, targetId, damage: shotDamage, killed, ...(farShot ? { farShot: true } : {}) } }, ...shotEvents];
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === target.id ? currentTarget : unit) };
      if (hasArtifact(nextState, actor, 'predators_focus')) {
        const controller = controllerOfUnit(actor);
        const prior = nextState.heroActionState?.[controller] ?? {};
        const same = prior.rangedFocusTarget === target.id;
        nextState = { ...nextState, heroActionState: { ...(nextState.heroActionState ?? {}), [controller]: { ...prior, rangedFocusTarget: target.id, rangedFocusCount: same ? Math.min(10, Number(prior.rangedFocusCount ?? 0) + 1) : 1 } } };
      }

      const abilities = actor.definition.abilities;
      const splash = abilities.includes('area_shot') || abilities.includes('lightning_strike') || abilities.includes('hellfire_shot') || abilities.includes('boulder_burst') || hasArtifact(nextState, actor, 'rain_of_iron');
      if (splash) {
        let fraction = 0.5;
        let friendlyFire = abilities.includes('area_shot') || abilities.includes('lightning_strike') || abilities.includes('hellfire_shot');
        let size: 3 | 5 = 3;
        let type: 'physical' | 'magic' = 'physical';
        let attributes: Array<'fire' | 'lightning'> | undefined;
        if (abilities.includes('area_shot')) fraction = mechanicParam(nextState, actor, 'area_shot', 'damage', 0.5);
        if (abilities.includes('lightning_strike')) {
          fraction = hasArtifact(nextState, actor, 'storm_fletching') ? 0.9 : 0.75;
          if (hasArtifact(nextState, actor, 'stormcrown')) { fraction = 0.5; size = 5; }
          type = 'magic'; attributes = ['lightning'];
        }
        if (abilities.includes('hellfire_shot')) { fraction = hasArtifact(nextState, actor, 'sulfurous_pitch') ? 0.75 : 0.5; type = 'magic'; attributes = ['fire']; }
        const marked = (target.marks ?? []).some(mark => mark.kind === 'ranged_mark');
        if (abilities.includes('boulder_burst')) fraction = hasArtifact(nextState, actor, 'shaped_stones') ? (marked ? 1 : 0.75) : (marked ? 0.75 : 0.5);
        if (hasArtifact(nextState, actor, 'rain_of_iron') && !abilities.includes('boulder_burst')) { fraction = marked ? 0.75 : 0.5; friendlyFire = false; }
        for (const area of areaTargets(nextState, target.pos, { size, primaryId: target.id, secondaryMultiplier: fraction, enemyOf: actor, friendlyFire }).filter(area => !area.primary)) {
          // The ability that owns this splash. Used for the damage seed, and
          // logged so the battle log can name it rather than saying "splash".
          const splashSource = abilities.includes('hellfire_shot') ? 'hellfire_shot'
            : abilities.includes('lightning_strike') ? 'lightning_strike'
            : abilities.includes('area_shot') ? 'area_shot'
            : abilities.includes('boulder_burst') ? 'boulder_burst'
            : hasArtifact(nextState, actor, 'rain_of_iron') ? 'rain_of_iron'
            : 'splash';
          const packetRng = rngFor(nextState.seed, nextState.actionSeq ?? 0, 'damage', abilities.includes('hellfire_shot') ? 'hellfire_shot' : abilities.includes('lightning_strike') ? 'lightning_strike' : 'ranged_splash', `${area.stack.id}:${shot}`);
          const splashDamage = abilities.includes('area_shot') ? shotDamage : shotDamage * fraction;
          const hit = resolveDamagePacket(nextState, {
            sourceId: actor.id, targetId: area.stack.id, amount: splashDamage, type, attributes,
            delivery: 'secondary', ranged: true, direct: true, canTriggerOnHit: false, canLifeDrain: false,
          }, packetRng);
          let splashTarget = hit.target;
          if (abilities.includes('area_shot') && hasArtifact(nextState, actor, 'barbed_volley') && splashTarget.count > 0) {
            splashTarget = addEffect(addModifierSource(
              { ...splashTarget, defenseBuff: (splashTarget.defenseBuff ?? 0) - 2 },
              { id: 'barbed_volley', label: 'Barbed Volley', stats: { defense: -2 } },
            ), { id: 'barbed_volley', kind: 'barbed_volley', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: false, innate: true, removable: true, stacks: 1, stats: { defense: -2 }, expires: { targetTurnsRemaining: 1, phase: 'start' } });
          }
          if (abilities.includes('hellfire_shot') && !splashTarget.definition.abilities.includes('fire_immunity')) {
            const baseBurn = 3 * (nextState.gauntletRound ?? 1);
            splashTarget = { ...splashTarget, burnDamage: hasArtifact(nextState, actor, 'crown_of_wildfire') ? (splashTarget.burnDamage ?? 0) + baseBurn : baseBurn, burnRoundsLeft: 2, burnSourceId: actor.id };
          }
          if (abilities.includes('lightning_strike') && hasArtifact(nextState, actor, 'overcharged_rods') && splashTarget.count > 0) {
            splashTarget = addEffect(splashTarget, {
              id: 'overcharged_rods', kind: 'overcharged_rods', sourceStackId: actor.id, sourceControllerId: actor.controllerId,
              positive: false, innate: true, removable: true, stacks: 1, expires: { targetTurnsRemaining: 1, phase: 'start' }, data: { noRetaliation: true },
            });
          }
          nextState = { ...nextState, units: nextState.units.map(unit => unit.id === splashTarget.id ? splashTarget : unit), log: [...nextState.log, { type: 'status', data: { effect: splashSource, sourceId: actor.id, unitId: splashTarget.id, damage: hit.outcome.finalDamage, killed: hit.outcome.killed } }] };
          if (splashTarget.count === 0) nextState = handleDeath(nextState, splashTarget, packetRng);
        }
      }
      if (abilities.includes('hellfire_shot') && shotDamage > 0 && currentTarget.count > 0 && !currentTarget.definition.abilities.includes('fire_immunity')) {
        const baseBurn = 3 * (nextState.gauntletRound ?? 1);
        currentTarget = { ...currentTarget, burnDamage: hasArtifact(nextState, actor, 'crown_of_wildfire') ? (currentTarget.burnDamage ?? 0) + baseBurn : baseBurn, burnRoundsLeft: 2, burnSourceId: actor.id };
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id === currentTarget.id ? currentTarget : unit) };
      }
    }

    const shootingActor = {
      ...actor,
      shotsLeft: Math.max(0, actor.shotsLeft - (freeAmmo ? 0 : shotCount)),
      abilityState: {
        ...(actor.abilityState ?? {}), focusFireTarget: focusTarget, focusFireCount: focusCount,
        ...(hasArtifact(nextState, actor, 'fateweavers_horn') && factionUnit(nextState, actor, 'ranger') ? { fateweaverUsed: true } : {}),
      },
      effects: freeAmmo ? (actor.effects ?? []).filter(effect => effect.kind !== 'cry_loose') : actor.effects,
    };
    nextState = {
      ...nextState,
      units: nextState.units.map((u, i) => {
        if (i === actorIdx) return shootingActor;
        if (i === targetIdx) return currentTarget;
        return u;
      }),
    };
    if (currentTarget.count === 0) {
      nextState = handleDeath(nextState, currentTarget, rng);
    }
    if ((actor.definition.abilities.includes('marking_shot') || actor.definition.abilities.includes('boulder_burst')) && currentTarget.count > 0) {
      const marked = addMark(currentTarget, { kind: 'ranged_mark', ownerTeamId: alliedTeamId(nextState, actor), sourceControllerId: actor.controllerId ?? actor.side, sourceId: actor.id });
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === marked.id ? marked : unit) };
      currentTarget = marked;
      if (actor.definition.abilities.includes('marking_shot') && hasArtifact(nextState, actor, 'spotters_monocle')) {
        nextState = { ...nextState, units: nextState.units.map(unit => unit.count > 0 && unit.side !== actor.side && chebyshevDistance(unit.pos, target.pos) === 1
          ? addMark(unit, { kind: 'ranged_mark', ownerTeamId: alliedTeamId(nextState, actor), sourceControllerId: controllerOfUnit(actor), sourceId: actor.id })
          : unit) };
      }
    }
    if (actor.definition.abilities.includes('area_shot') && hasArtifact(nextState, actor, 'barbed_volley') && currentTarget.count > 0) {
      currentTarget = addEffect(addModifierSource(
        { ...currentTarget, defenseBuff: (currentTarget.defenseBuff ?? 0) - 2 },
        { id: 'barbed_volley', label: 'Barbed Volley', stats: { defense: -2 } },
      ), { id: 'barbed_volley', kind: 'barbed_volley', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: false, innate: true, removable: true, stacks: 1, stats: { defense: -2 }, expires: { targetTurnsRemaining: 1, phase: 'start' } });
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === currentTarget.id ? currentTarget : unit) };
    }
    if (actor.definition.abilities.includes('lightning_strike') && hasArtifact(nextState, actor, 'overcharged_rods') && currentTarget.count > 0) {
      currentTarget = addEffect(currentTarget, {
        id: 'overcharged_rods', kind: 'overcharged_rods', sourceStackId: actor.id, sourceControllerId: actor.controllerId,
        positive: false, innate: true, removable: true, stacks: 1, expires: { targetTurnsRemaining: 1, phase: 'start' }, data: { noRetaliation: true },
      });
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === currentTarget.id ? currentTarget : unit) };
    }
    if (damagedPrimary) {
      const quarry = triggerQuarry(nextState, actor, currentTarget);
      currentTarget = quarry.target;
      if (quarry.triggered) turnReentry = Math.max(turnReentry, 0.1);
      if (actor.isHero && hasArtifact(nextState, actor, 'worldsplitter') && currentTarget.count > 0) {
        currentTarget = addMark(currentTarget, {
          kind: 'marked_for_death', ownerTeamId: alliedTeamId(nextState, actor),
          sourceControllerId: actor.controllerId ?? actor.side, sourceId: actor.id,
        });
      }
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === currentTarget.id ? currentTarget : unit) };
    }
    if (actor.definition.abilities.includes('pinning_shot') && currentTarget.count > 0) {
      const penalty = hasArtifact(nextState, actor, 'barbed_fletching') ? 3 : 2;
      const prior = Math.min(6, Math.abs(Number(currentTarget.effects?.find(effect => effect.kind === 'pinning_shot')?.data?.speed ?? 0)));
      const total = Math.min(6, prior + penalty);
      const pinned = addEffect({ ...currentTarget, speedPenalty: total }, {
        id: 'pinning_shot', kind: 'pinning_shot', sourceStackId: actor.id, sourceControllerId: actor.controllerId,
        positive: false, innate: false, removable: true, stacks: 1, expires: { targetTurnsRemaining: 1 }, data: { speed: -total },
      });
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === pinned.id ? pinned : unit) };
    }
    if (actor.definition.abilities.includes('quickdraw') && !actor.hasTakenTurn) turnReentry = Math.max(turnReentry, 0.5);
    if (actor.definition.abilities.includes('scrap_frenzy') && killedAny) turnReentry = Math.max(turnReentry, hasArtifact(nextState, actor, 'ratchet_loader') ? 0.65 : 0.5);
    const plan = heroSystemState(nextState, actor);
    if (factionUnit(nextState, actor, 'ranger') && plan.activePlan === 'set_the_ambush' && inChosenArea(plan.area, actor.pos)) {
      const planId = Number(plan.planId ?? -1);
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actorId ? { ...unit, abilityState: { ...(unit.abilityState ?? {}), ambushUsedPlanId: planId } } : unit) };
    }

    // Lich curse shot: every surviving target permanently loses another 5
    // attack. The penalty compounds with repeated shots and other modifiers.
    if (actor.definition.abilities.includes('curse_shot') && currentTarget.count > 0) {
      const curseAttack = CURSE_SHOT_PENALTY * (hasArtifact(nextState, actor, 'crown_of_ruin') ? 2 : 1);
      const curseDefense = hasArtifact(nextState, actor, 'withered_quiver') ? CURSE_SHOT_PENALTY * (hasArtifact(nextState, actor, 'crown_of_ruin') ? 2 : 1) : 0;
      currentTarget = addEffect(addModifierSource(
        {
          ...currentTarget,
          attackBuff: (currentTarget.attackBuff ?? 0) - curseAttack,
          defenseBuff: (currentTarget.defenseBuff ?? 0) - curseDefense,
        },
        { id: 'curse_shot', label: 'Lich — Curse Shot', stats: { attack: -curseAttack, ...(curseDefense ? { defense: -curseDefense } : {}) } },
      ), { id: 'curse_shot', kind: 'curse', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: false, innate: false, removable: true, stacks: 1, stats: { attack: -curseAttack, ...(curseDefense ? { defense: -curseDefense } : {}) } }, false);
      nextState = {
        ...nextState,
        units: nextState.units.map(u => (u.id === targetId ? currentTarget : u)),
        log: [
          ...nextState.log,
          { type: 'status', data: { effect: 'curse', unitId: targetId, attackPenalty: curseAttack, defensePenalty: curseDefense } },
        ],
      };
    }
  }

  // Morale boost = extra turn (don't advance). The roll happens before the
  // action, but retaliation and other action effects may kill the acting
  // stack; a dead stack cannot receive or log an extra turn.
  const actorSurvived = nextState.units.some(u => u.id === actorId && u.count > 0);
  if (moraleResult === 'boost' && actorSurvived) {
    nextState.log = [...nextState.log, { type: 'morale_boost', data: { unitId: actorId } }];
    return complete(nextState, 0, true);
  }

  const endResult = checkBattleEnd(nextState);
  if (endResult) {
    nextState.log = [...nextState.log, { type: 'battle_end', data: { result: endResult } }];
    return completeTerminal(nextState, endResult);
  }

  if (action.type === 'move') {
    const movedActor = nextState.units.find(unit => unit.id === actorId)!;
    const distance = chebyshevDistance(actor.pos, movedActor.pos);
    if (distance >= 3 && hasArtifact(nextState, actor, 'wayfarers_compass')) turnReentry = Math.max(turnReentry, hasArtifact(nextState, actor, 'endless_quiver') && actor.definition.shots > 0 ? 0.65 : 0.5);
    if (distance >= 3 && actor.definition.abilities.includes('gallop')) turnReentry = Math.max(turnReentry, 0.5);
    if (factionUnit(nextState, actor, 'knight') && heroSystemState(nextState, actor).activeOrder === 'advance_by_ranks' && distance >= 2 &&
      nextState.units.some(unit => unit.id !== actor.id && unit.count > 0 && factionUnit(nextState, unit, 'knight') && alliedTeamId(nextState, unit) === alliedTeamId(nextState, actor) && chebyshevDistance(unit.pos, action.to) === 1)) {
      turnReentry = Math.max(turnReentry, 0.5);
    }
    const plan = heroSystemState(nextState, actor);
    if (factionUnit(nextState, actor, 'ranger') && plan.activePlan === 'open_an_escape_route' && inChosenArea(plan.area, action.to)) turnReentry = Math.max(turnReentry, 0.75);
    if (actor.definition.name === 'Sprite' && distance >= 3 && hasArtifact(nextState, actor, 'pollen_veil')) {
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === actor.id ? addEffect(unit, { id: 'pollen_veil', kind: 'pollen_veil', sourceStackId: actor.id, sourceControllerId: actor.controllerId, positive: true, innate: true, removable: false, stacks: 1, expires: { targetTurnsRemaining: 1, phase: 'start' } }) : unit) };
    }
  }
  if (luckyAction) {
    const fortuneUnit = nextState.units.find(unit => unit.count > 0 && unit.definition.name === 'Unicorn' && alliedTeamId(nextState, unit) === alliedTeamId(nextState, actor));
    const survivor = nextState.units.find(unit => unit.id === actor.id && unit.count > 0);
    if (fortuneUnit && survivor) {
      const cleaned = cleanseOldest(survivor);
      nextState = { ...nextState, units: nextState.units.map(unit => unit.id === survivor.id ? cleaned.stack : unit) };
      turnReentry = Math.max(turnReentry, hasArtifact(nextState, fortuneUnit, 'silver_horseshoe') ? 0.4 : 0.25);
      if (hasArtifact(nextState, fortuneUnit, 'rainbow_mane')) {
        nextState = { ...nextState, units: nextState.units.map(unit => unit.id !== actor.id && unit.count > 0 && factionUnit(nextState, unit, 'ranger') && alliedTeamId(nextState, unit) === alliedTeamId(nextState, actor)
          ? { ...unit, atb: Math.min(1, unit.atb + 0.1) }
          : unit) };
      }
    }
  }
  return complete(nextState, Math.max(reentryAtb(action.type), turnReentry));
}
