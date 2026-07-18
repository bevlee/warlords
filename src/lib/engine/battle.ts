import { v4 as uuidv4 } from 'uuid';
import type { ArmyBonuses, ArmySlot, BattleAction, BattleEvent, BattleState, Hero, Pos, SpellId, UnitStack } from './types';
import { chebyshevDistance, createGrid, placeUnits, setBlocked, setOccupant } from './grid';
import { advanceTurn } from './turnOrder';
import { calculateDamage, applyDamage, canRetaliate, checkMorale, type LuckSink } from './combat';
import { isBeyondRange, isShootingBlocked, type DamagePreview } from './selectors';
import { mulberry32, type Rng } from './rng';
import { abilityLevel, lifestealFraction } from './abilityCatalog';
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
} from './factionSkills';
import { DEMON_UNITS } from './demon';

/** Barbarian Offense boosts damage a player stack deals; Knight/Barbarian Armorer
 *  reduces damage a player stack takes. Ranger Archery/Necromancer Death Magic/Demon
 *  Fire Magic scale specific attack shapes. All are hero-wide, so they're applied
 *  here rather than inside calculateDamage (which only knows per-unit abilities). */
function withHeroBonus(
  hero: Hero,
  attacker: UnitStack,
  defender: UnitStack,
  damage: number,
  ranged = false
): number {
  let d = damage;
  if (attacker.side === 'player') {
    d = applyOffenseBonus(d, hero);
    if (ranged) d = applyArcheryBonus(d, hero);
    if (attacker.definition.abilities.includes('area_shot')) d = applyDeathMagicBonus(d, hero);
    if (attacker.definition.abilities.includes('burn')) d = applyFireMagicBonus(d, hero);
  }
  if (defender.side === 'player') d = applyArmorerBonus(d, hero);
  return d;
}

/** A hit plus the luck event that preceded it, if the attacker's luck fired.
 *  Emitted as its own entry ahead of the attack so the UI plays it as an
 *  earlier beat — the flash reads as the cause of the damage that follows. */
function rollHit(
  hero: Hero,
  attacker: UnitStack,
  defender: UnitStack,
  rng: Rng,
  heroAttack: number,
  ranged = false
): { damage: number; luckEvents: BattleEvent[] } {
  const sink: LuckSink = { luck: null };
  const raw = calculateDamage(attacker, defender, heroAttack, rng, sink);
  return {
    damage: withHeroBonus(hero, attacker, defender, raw, ranged),
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
  hero: Hero
): { striker: UnitStack; victim: UnitStack; events: BattleEvent[] } {
  let a = striker;
  let v = victim;
  const events: BattleEvent[] = [];
  const abilities = striker.definition.abilities;

  const lsLevel = abilityLevel(striker.definition, 'life_drain');
  if (lsLevel > 0 && a.count > 0) {
    // 10%·level of damage dealt, split across the stack (legacy Vampire = level 10 = 100%).
    const heal = Math.round((damageDealt * lifestealFraction(lsLevel)) / a.count);
    const newHp = Math.min(a.definition.hp, a.hp + heal);
    if (heal > 0 && newHp !== a.hp) {
      a = { ...a, hp: newHp };
      events.push({ type: 'status', data: { effect: 'life_drain', unitId: a.id, heal } });
    }
  }

  if (v.count > 0 && !v.isHero) {
    if (abilities.includes('slow_on_hit') && rng() < 0.3) {
      v = { ...v, speedPenalty: (v.speedPenalty ?? 0) + 1 };
      events.push({ type: 'status', data: { effect: 'slow', unitId: v.id } });
    }
    if (abilities.includes('drain_morale')) {
      v = { ...v, morale: Math.max(-3, v.morale - 1) };
      events.push({ type: 'status', data: { effect: 'drain_morale', unitId: v.id } });
    }
    if (abilities.includes('blind_on_hit') && rng() < 0.2) {
      v = { ...v, blindedUntilRound: round };
      events.push({ type: 'status', data: { effect: 'blind', unitId: v.id } });
    }
    if (abilities.includes('burn')) {
      const burnDamage = striker.side === 'player' ? applyFireMagicBonus(3, hero) : 3;
      v = { ...v, burnDamage, burnRoundsLeft: 2 };
      events.push({ type: 'status', data: { effect: 'burn_apply', unitId: v.id } });
    }
    if (abilities.includes('bind')) {
      v = { ...v, boundUntilRound: round };
      events.push({ type: 'status', data: { effect: 'bind', unitId: v.id } });
    }
  }

  return { striker: a, victim: v, events };
}

/**
 * Logs a death and clears its grid cell. Demon Gating gives a fallen
 * Demon-faction stack on the hero's side a chance to respawn at 1 creature
 * instead, in the same cell.
 */
function handleDeath(s: BattleState, dead: UnitStack, rng: Rng): BattleState {
  const next: BattleState = { ...s, log: [...s.log, { type: 'death', data: { unitId: dead.id } }] };
  const gatingChance = dead.side === 'player' && !dead.isAlly ? getGatingChance(next.hero) : 0;
  if (gatingChance > 0 && DEMON_UNITS.some(u => u.name === dead.definition.name) && rng() < gatingChance) {
    const revived: UnitStack = { ...dead, count: 1, hp: dead.definition.hp };
    return {
      ...next,
      units: next.units.map(u => (u.id === dead.id ? revived : u)),
      grid: setOccupant(next.grid, dead.pos, dead.id),
      log: [...next.log, { type: 'status', data: { effect: 'gating', unitId: dead.id } }],
    };
  }
  return { ...next, grid: setOccupant(next.grid, dead.pos, null) };
}

const GRID_W = 12;
const GRID_H = 10;

export const SPELLS: Record<SpellId, { cost: number; friendly: boolean }> = {
  lightning: { cost: 3, friendly: false },
  bloodlust: { cost: 2, friendly: true },
  stoneskin: { cost: 2, friendly: true },
};

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

function slotToStack(slot: ArmySlot, side: 'player' | 'enemy', index: number, colShift = 0): UnitStack {
  const col = side === 'player' ? 1 + colShift : GRID_W - 2;
  const row = 1 + index * Math.floor((GRID_H - 2) / 6);
  return {
    id: uuidv4(),
    definition: slot.unit,
    count: slot.count,
    hp: slot.unit.hp,
    pos: { col, row },
    side,
    hasRetaliated: false,
    shotsLeft: slot.unit.shots,
    // Bravery: the unit carries its own morale into battle, either side; +level.
    morale: clampProc(abilityLevel(slot.unit, 'bravery')),
    luck: 0,
    atb: 0,
    isDefending: false,
  };
}

const clampProc = (v: number) => Math.max(-3, Math.min(3, v));

export function initBattle(
  playerArmy: ArmySlot[],
  enemyArmy: ArmySlot[],
  hero: Hero,
  seed = Date.now(),
  allyArmy: ArmySlot[] = [],
  armyBonuses?: ArmyBonuses
): BattleState {
  let grid = createGrid(GRID_W, GRID_H);

  const moraleBonus = getMoraleBonus(hero);
  const tacticsShift = getTacticsShift(hero);
  const logisticsBonus = getLogisticsBonus(hero);
  const luckBonus = getNatureLuckBonus(hero);
  const playerUnits: UnitStack[] = playerArmy.map((slot, i) => {
    let stack = slotToStack(slot, 'player', i, tacticsShift);
    if (moraleBonus > 0) stack = { ...stack, morale: stack.morale + moraleBonus };
    if (logisticsBonus > 0) stack = { ...stack, speedBonus: logisticsBonus };
    if (luckBonus > 0) stack = { ...stack, luck: stack.luck + luckBonus };
    if (armyBonuses) {
      stack = {
        ...stack,
        attackBuff: (stack.attackBuff ?? 0) + armyBonuses.attack,
        defenseBuff: (stack.defenseBuff ?? 0) + armyBonuses.defense,
        initiativeBonus: armyBonuses.initiative,
        morale: clampProc(stack.morale + armyBonuses.morale),
        luck: clampProc(stack.luck + armyBonuses.luck),
      };
    }
    return stack;
  });
  const enemyUnits: UnitStack[] = enemyArmy.map((slot, i) => slotToStack(slot, 'enemy', i));
  // Summoned ally: player-side but AI-driven, fielded one column behind the
  // player line. Hero skill bonuses (morale/logistics/luck/gating) deliberately
  // don't apply — the ally fights under its own banner.
  const allyUnits: UnitStack[] = allyArmy.map((slot, i) => ({
    ...slotToStack(slot, 'player', i, -1),
    isAlly: true,
  }));

  // The hero fights too: off-grid on the flank, ATB-scheduled, untargetable.
  // Whole-board ranged strike via the shoot action (no retaliation). attack: 0
  // because the hero's real attack already reaches player damage as heroAttack.
  const heroStack: UnitStack = {
    id: uuidv4(),
    definition: {
      name: 'Hero', tier: 7, speed: 0, initiative: 10, hp: 1,
      attack: 0, defense: hero.defense,
      minDamage: 2 + 3 * hero.level, maxDamage: 5 + 6 * hero.level,
      shots: 9999, range: 99, isLarge: false, abilities: [],
    },
    count: 1,
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
  };

  // LordsWM-style start: every stack gets a seeded random 0–10% head start.
  const rng = mulberry32(seed);
  const allUnits = [...playerUnits, ...allyUnits, ...enemyUnits, heroStack].map(u => ({ ...u, atb: rng() * 0.1 }));

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

  const state: BattleState = {
    grid,
    units: allUnits,
    hero: { ...hero, mana: hero.mana ?? maxMana(hero) },
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [{ type: 'round_start', data: { round: 1 } }],
    result: 'ongoing',
    seed,
    // Battles open in deployment; the first actor is already chosen (advance
    // below), but the UI freezes the turn loop until beginCombat flips this.
    phase: 'deploy',
  };
  return advance(state);
}

/** Left columns the player may deploy in (before Knight Tactics). */
export const DEPLOY_COLS = 3;

/** Max on-field player stacks; splitting is refused past this (HoMM-style). */
export const MAX_FIELD_STACKS = 7;

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
function isDeployable(u: UnitStack | undefined): u is UnitStack {
  return !!u && u.side === 'player' && !u.isHero && !u.isAlly;
}

/** Move one of the player's stacks to `to` during deployment. Empty in-zone
 *  cell → move; another of the player's stacks → swap. Any other target
 *  (out of zone, obstacle, enemy, hero) is a no-op returning the same state. */
export function deployMove(state: BattleState, unitId: string, to: Pos): BattleState {
  const unit = state.units.find(u => u.id === unitId);
  if (!isDeployable(unit)) return state;
  if (!isInDeployZone(to, getTacticsShift(state.hero))) return state;
  const cell = state.grid.cells[to.row][to.col];
  if (cell.blocked) return state;
  if (cell.occupantId === unitId) return state;

  const occupant = cell.occupantId ? state.units.find(u => u.id === cell.occupantId) : undefined;
  if (cell.occupantId && !isDeployable(occupant)) return state; // can't displace enemies/hero

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

/** Peel `amount` creatures off a player stack into a new same-unit stack at an
 *  empty in-zone cell `to`. No-op if amount is out of (0, count), `to` isn't an
 *  empty in-zone cell, or the field-stack cap is reached. Battle-scoped —
 *  survivorsFrom merges same-unit stacks back into the persistent army. */
export function splitStack(state: BattleState, unitId: string, amount: number, to: Pos): BattleState {
  const unit = state.units.find(u => u.id === unitId);
  if (!isDeployable(unit)) return state;
  if (!Number.isInteger(amount) || amount < 1 || amount >= unit.count) return state;
  if (!isInDeployZone(to, getTacticsShift(state.hero))) return state;
  const cell = state.grid.cells[to.row][to.col];
  if (cell.blocked || cell.occupantId) return state;
  const fieldStacks = state.units.filter(u => isDeployable(u) && u.count > 0).length;
  if (fieldStacks >= MAX_FIELD_STACKS) return state;

  const id = uuidv4();
  const created: UnitStack = {
    id,
    definition: unit.definition,
    count: amount,
    hp: unit.definition.hp,
    pos: to,
    side: 'player',
    hasRetaliated: false,
    shotsLeft: unit.definition.shots,
    morale: unit.morale,
    luck: unit.luck,
    atb: 0,
    isDefending: false,
    ...(unit.attackBuff !== undefined ? { attackBuff: unit.attackBuff } : {}),
    ...(unit.defenseBuff !== undefined ? { defenseBuff: unit.defenseBuff } : {}),
    ...(unit.initiativeBonus !== undefined ? { initiativeBonus: unit.initiativeBonus } : {}),
  };
  const units = state.units
    .map(u => (u.id === unitId ? { ...u, count: u.count - amount } : u))
    .concat(created);
  return { ...state, units, grid: setOccupant(state.grid, to, id) };
}

/** Leave deployment and start the battle. The first actor was already chosen
 *  in initBattle, so this only unfreezes the turn loop. */
export function beginCombat(state: BattleState): BattleState {
  return { ...state, phase: 'combat' };
}

/** advanceTurn, plus Wizard Mysticism's mana regen whenever a new round starts. */
function advance(state: BattleState): BattleState {
  const next = advanceTurn(state);
  if (next.round > state.round) {
    const regen = getMysticismRegen(next.hero);
    if (regen > 0) return { ...next, hero: { ...next.hero, mana: (next.hero.mana ?? 0) + regen } };
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

export function applyAction(state: BattleState, action: BattleAction): BattleState {
  const rng = mulberry32(state.seed + state.log.length);
  let s = { ...state, units: [...state.units], log: [...state.log] };

  const actorId = s.currentUnitId;
  if (!actorId) return s;
  const actorIdx = s.units.findIndex(u => u.id === actorId);
  if (actorIdx < 0) return s;
  let actor = s.units[actorIdx];

  // A finished turn re-enters the scale at 0; wait re-enters at 0.5 (half cycle).
  const reenter = (st: BattleState, atb: number): BattleState => ({
    ...st,
    units: st.units.map(u => (u.id === actorId ? { ...u, atb } : u)),
  });

  // Status effects resolve at the start of the acting unit's turn: burn damage first, then a blind skip.
  if (!actor.isHero && actor.count > 0) {
    if ((actor.burnRoundsLeft ?? 0) > 0) {
      const burnDamage = actor.burnDamage ?? 0;
      const { killed, remaining } = applyDamage(actor, burnDamage);
      const roundsLeft = (actor.burnRoundsLeft ?? 0) - 1;
      const burned: UnitStack = {
        ...remaining,
        burnRoundsLeft: roundsLeft > 0 ? roundsLeft : undefined,
        burnDamage: roundsLeft > 0 ? actor.burnDamage : undefined,
      };
      s = { ...s, units: s.units.map((u, i) => (i === actorIdx ? burned : u)) };
      s.log = [...s.log, { type: 'status', data: { effect: 'burn', unitId: actorId, damage: burnDamage, killed } }];
      if (burned.count === 0) {
        s = handleDeath(s, burned, rng);
        const endResult = checkBattleEnd(s);
        if (endResult) {
          s.log = [...s.log, { type: 'battle_end', data: { result: endResult } }];
          return { ...s, result: endResult };
        }
        return advance(reenter(s, 0));
      }
      actor = burned;
    }

    if (actor.blindedUntilRound !== undefined) {
      const cleared = { ...actor, blindedUntilRound: undefined };
      s = { ...s, units: s.units.map((u, i) => (i === actorIdx ? cleared : u)) };
      s.log = [...s.log, { type: 'status', data: { effect: 'blind', unitId: actorId } }];
      return advance(reenter(s, 0));
    }
  }

  // Bind blocks movement for exactly one upcoming turn, then clears.
  const wasBound = actor.boundUntilRound !== undefined;
  if (wasBound) {
    const cleared = { ...actor, boundUntilRound: undefined };
    s = { ...s, units: s.units.map((u, i) => (i === actorIdx ? cleared : u)) };
    actor = cleared;
  }

  // Invalid casts are rejected outright: turn is kept, nothing changes.
  if (action.type === 'cast') {
    const spell = SPELLS[action.spell];
    const target = s.units.find(u => u.id === action.targetId);
    if (
      !actor.isHero ||
      !spell ||
      (s.hero.mana ?? 0) < spell.cost ||
      !target ||
      target.count === 0 ||
      target.isHero ||
      (spell.friendly ? target.side !== actor.side : target.side === actor.side)
    ) {
      return state;
    }
  }

  // Morale check
  const moraleResult = checkMorale(actor, rng);
  if (moraleResult === 'freeze') {
    s.log = [...s.log, { type: 'morale_freeze', data: { unitId: actorId } }];
    return advance(reenter(s, 0));
  }

  if (action.type === 'cast') {
    const spell = SPELLS[action.spell];
    const targetIdx = s.units.findIndex(u => u.id === action.targetId);
    const target = s.units[targetIdx];

    if (action.spell === 'lightning') {
      const damage = Math.round(lightningDamage(s.hero.level) * getSorceryMultiplier(s.hero));
      const { killed, remaining } = applyDamage(target, damage);
      s = { ...s, units: s.units.map((u, i) => (i === targetIdx ? remaining : u)) };
      s.log = [...s.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: target.id, damage, killed } }];
      if (remaining.count === 0) {
        s = handleDeath(s, remaining, rng);
      }
    } else {
      const buffed =
        action.spell === 'bloodlust'
          ? { ...target, attackBuff: (target.attackBuff ?? 0) + 4 }
          : { ...target, defenseBuff: (target.defenseBuff ?? 0) + 4 };
      s = { ...s, units: s.units.map((u, i) => (i === targetIdx ? buffed : u)) };
      s.log = [...s.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: target.id } }];
    }

    s = { ...s, hero: { ...s.hero, mana: (s.hero.mana ?? 0) - spell.cost } };

  } else if (action.type === 'defend') {
    const newUnits = s.units.map((u, i) => (i === actorIdx ? { ...u, isDefending: true } : u));
    s = { ...s, units: newUnits };
    s.log = [...s.log, { type: 'defend', data: { unitId: actorId } }];

  } else if (action.type === 'move') {
    if (wasBound) {
      s.log = [...s.log, { type: 'status', data: { effect: 'bind_block', unitId: actorId } }];
      return advance(reenter(s, 0));
    }
    const newGrid = setOccupant(setOccupant(s.grid, actor.pos, null), action.to, actor.id);
    const updatedActor = { ...actor, pos: action.to, lastMovedFrom: actor.pos };
    const newUnits = s.units.map((u, i) => i === actorIdx ? updatedActor : u);
    s = { ...s, grid: newGrid, units: newUnits };
    s.log = [...s.log, { type: 'move', data: { unitId: actorId, from: updatedActor.lastMovedFrom, to: action.to } }];

  } else if (action.type === 'attack') {
    const targetId = action.targetId;
    const targetIdx = s.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(s, 0));
    const target = s.units[targetIdx];

    // Combined move+attack: relocate the actor before resolving the melee (blocked while bound).
    let attacker = actor;
    if (action.moveTo && wasBound) {
      s.log = [...s.log, { type: 'status', data: { effect: 'bind_block', unitId: actorId } }];
    } else if (action.moveTo) {
      const newGrid = setOccupant(setOccupant(s.grid, actor.pos, null), action.moveTo, actor.id);
      attacker = { ...actor, pos: action.moveTo, lastMovedFrom: actor.pos };
      const movedUnits = s.units.map((u, i) => (i === actorIdx ? attacker : u));
      s = { ...s, grid: newGrid, units: movedUnits };
      s.log = [...s.log, { type: 'move', data: { unitId: actorId, from: attacker.lastMovedFrom, to: action.moveTo } }];
    }

    const { damage, luckEvents } = rollHit(s.hero, attacker, target, rng, s.hero.attack);
    const { killed, remaining: hitTarget } = applyDamage(target, damage);
    const { striker: attackerAfterHit, victim: remaining, events: hitEvents } =
      applyOnHitEffects(rng, attacker, hitTarget, damage, s.round, s.hero);

    s = {
      ...s,
      units: s.units.map((u, i) => {
        if (i === targetIdx) return remaining;
        if (i === actorIdx) return attackerAfterHit;
        return u;
      }),
    };
    s.log = [...s.log, ...luckEvents, { type: 'attack', data: { attackerId: actorId, targetId, damage, killed } }, ...hitEvents];

    if (remaining.count === 0) {
      s = handleDeath(s, remaining, rng);
    }

    // Check end before retaliation
    const endResult = checkBattleEnd(s);
    if (endResult) {
      s.log = [...s.log, { type: 'battle_end', data: { result: endResult } }];
      return { ...s, result: endResult };
    }

    // Retaliation (only on regular attack, not on ranged)
    if (canRetaliate(remaining, attackerAfterHit)) {
      const { damage: retDamage, luckEvents: retLuckEvents } = rollHit(s.hero, remaining, attackerAfterHit, rng, 0);
      const { killed: retKilled, remaining: hitAttacker } = applyDamage(attackerAfterHit, retDamage);
      const { striker: retaliatorAfterHit, victim: retActor, events: retEvents } =
        applyOnHitEffects(rng, remaining, hitAttacker, retDamage, s.round, s.hero);
      const updatedUnits = s.units.map(u => {
        if (u.id === targetId) return { ...retaliatorAfterHit, hasRetaliated: true };
        if (u.id === actorId) return retActor;
        return u;
      });
      s = { ...s, units: updatedUnits };
      s.log = [...s.log, ...retLuckEvents, { type: 'retaliate', data: { attackerId: targetId, targetId: actorId, damage: retDamage, killed: retKilled } }, ...retEvents];
      if (retActor.count === 0) {
        s = handleDeath(s, retActor, rng);
      }
    }

    // Double strike: a second melee hit after the retaliation, no second
    // retaliation. Skipped if either side died in the exchange.
    if (attacker.definition.abilities.includes('double_strike')) {
      const striker = s.units.find(u => u.id === actorId);
      const victim = s.units.find(u => u.id === targetId);
      if (striker && striker.count > 0 && victim && victim.count > 0) {
        const { damage: d2, luckEvents: luck2 } = rollHit(s.hero, striker, victim, rng, s.hero.attack);
        const { killed: k2, remaining: v2 } = applyDamage(victim, d2);
        const { striker: s2after, victim: v2after, events: hit2Events } =
          applyOnHitEffects(rng, striker, v2, d2, s.round, s.hero);
        s = { ...s, units: s.units.map(u => (u.id === targetId ? v2after : u.id === actorId ? s2after : u)) };
        s.log = [...s.log, ...luck2, { type: 'attack', data: { attackerId: actorId, targetId, damage: d2, killed: k2 } }, ...hit2Events];
        if (v2after.count === 0) s = handleDeath(s, v2after, rng);
        const end2 = checkBattleEnd(s);
        if (end2) {
          s.log = [...s.log, { type: 'battle_end', data: { result: end2 } }];
          return { ...s, result: end2 };
        }
      }
    }

  } else if (action.type === 'shoot') {
    const targetId = (action as { type: 'shoot'; targetId: string }).targetId;
    const targetIdx = s.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(s, 0));
    const target = s.units[targetIdx];

    if (actor.shotsLeft <= 0) return advance(reenter(s, 0));
    if (isShootingBlocked(s, actor)) return advance(reenter(s, 0));

    // Grand Elf double_shot fires twice, consuming 2 shots.
    const shotCount = actor.definition.abilities.includes('double_shot') ? 2 : 1;
    // LordsWM far-shot rule: beyond the shooter's range the shot deals half damage.
    const farShot = isBeyondRange(actor, target);
    let currentTarget = target;
    let firstShotDamage = 0;
    for (let shot = 0; shot < shotCount && currentTarget.count > 0; shot++) {
      const { damage: fullDamage, luckEvents } = rollHit(s.hero, actor, currentTarget, rng, s.hero.attack, true);
      const shotDamage = farShot ? Math.max(1, Math.round(fullDamage / 2)) : fullDamage;
      if (shot === 0) firstShotDamage = shotDamage;
      const { killed, remaining } = applyDamage(currentTarget, shotDamage);
      currentTarget = remaining;
      s.log = [...s.log, ...luckEvents, { type: 'shoot', data: { attackerId: actorId, targetId, damage: shotDamage, killed, ...(farShot ? { farShot: true } : {}) } }];
    }

    const shootingActor = { ...actor, shotsLeft: Math.max(0, actor.shotsLeft - shotCount) };
    s = {
      ...s,
      units: s.units.map((u, i) => {
        if (i === actorIdx) return shootingActor;
        if (i === targetIdx) return currentTarget;
        return u;
      }),
    };
    if (currentTarget.count === 0) {
      s = handleDeath(s, currentTarget, rng);
    }

    // Lich area_shot: 50% splash damage to enemy stacks adjacent to the target.
    if (actor.definition.abilities.includes('area_shot')) {
      const splashDamage = Math.max(1, Math.round(firstShotDamage * 0.5));
      const splashTargets = s.units.filter(
        u => u.id !== targetId && u.count > 0 && !u.isHero && u.side !== actor.side
          && chebyshevDistance(u.pos, target.pos) === 1
      );
      for (const victim of splashTargets) {
        const idx = s.units.findIndex(u => u.id === victim.id);
        const { killed: splashKilled, remaining: splashRemaining } = applyDamage(s.units[idx], splashDamage);
        s = { ...s, units: s.units.map((u, i) => (i === idx ? splashRemaining : u)) };
        s.log = [...s.log, { type: 'shoot', data: { attackerId: actorId, targetId: victim.id, damage: splashDamage, killed: splashKilled, splash: true } }];
        if (splashRemaining.count === 0) {
          s = handleDeath(s, splashRemaining, rng);
        }
      }
    }
  }

  // Morale boost = extra turn (don't advance)
  if (moraleResult === 'boost') {
    s.log = [...s.log, { type: 'morale_boost', data: { unitId: actorId } }];
    return s;
  }

  const endResult = checkBattleEnd(s);
  if (endResult) {
    s.log = [...s.log, { type: 'battle_end', data: { result: endResult } }];
    return { ...s, result: endResult };
  }

  return advance(reenter(s, action.type === 'wait' ? 0.5 : 0));
}
