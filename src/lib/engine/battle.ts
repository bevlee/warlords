import type { ArmyBonuses, ArmySlot, BattleAction, BattleEvent, BattleState, Hero, Pos, SpellId, UnitStack } from './types.ts';
import { chebyshevDistance, createGrid, placeUnits, setBlocked, setOccupant } from './grid.ts';
import { advanceTurn } from './turnOrder.ts';
import { calculateDamage, applyDamage, applyHeal, applyStrike, damageStack, canRetaliate, checkMorale, type LuckSink } from './combat.ts';
import { isBeyondRange, isShootingBlocked, type DamagePreview } from './selectors.ts';
import { mulberry32, type Rng } from './rng.ts';
import { abilityLevel, lifestealFraction, INFECT_PENALTY } from './abilityCatalog.ts';
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
    if (attacker.definition.abilities.includes('area_shot')) d = applyDeathMagicBonus(d, attackerHero);
    if (attacker.definition.abilities.includes('burn')) d = applyFireMagicBonus(d, attackerHero);
  }
  if (defender.side === 'player') d = applyArmorerBonus(d, defenderHero);
  return d;
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
  ranged = false
): { damage: number; luckEvents: BattleEvent[] } {
  const sink: LuckSink = { luck: null };
  const attackerHero = heroFor(state, attacker);
  const defenderHero = heroFor(state, defender);
  const raw = calculateDamage(attacker, defender, heroAttack, rng, sink);
  return {
    damage: withHeroBonus(attackerHero, defenderHero, attacker, defender, raw, ranged),
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
    // Heal the striking stack by 10%·level of the total damage dealt (legacy
    // Vampire = level 10 = 100%), reviving fallen creatures up to the count it
    // started the battle with. Heals the stack as a whole, never per-creature.
    const heal = Math.round(damageDealt * lifestealFraction(lsLevel));
    const oldHp = a.hp;
    const { stack, healed, revived } = applyHeal(a, heal);
    if (healed > 0) {
      a = stack;
      // Floater split: `revived` creatures shown green, and the current lead
      // creature's partial HP shown red (its fresh HP after a revive, else the
      // plain top-up).
      const topHp = revived > 0 ? a.hp : a.hp - oldHp;
      events.push({ type: 'status', data: { effect: 'life_drain', unitId: a.id, heal: healed, revived, topHp } });
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
    // Zombie infecting_strike: the rot compounds — every hit takes another
    // 5 attack and 5 defense off the victim for the rest of the battle.
    // modifiedDamage floors both at 0.
    if (abilities.includes('infecting_strike')) {
      v = {
        ...v,
        attackBuff: (v.attackBuff ?? 0) - INFECT_PENALTY,
        defenseBuff: (v.defenseBuff ?? 0) - INFECT_PENALTY,
      };
      events.push({ type: 'status', data: { effect: 'infect', unitId: v.id, penalty: INFECT_PENALTY } });
    }
  }

  return { striker: a, victim: v, events };
}

/**
 * Logs a death and clears its grid cell. Demon Gating gives a fallen
 * Demon-faction stack on the hero's side a chance to respawn at 1 creature
 * instead, in the same cell.
 */
function handleDeath(state: BattleState, dead: UnitStack, rng: Rng): BattleState {
  const nextState: BattleState = { ...state, log: [...state.log, { type: 'death', data: { unitId: dead.id } }] };
  const hasOwnHero = !!(dead.controllerId && nextState.heroes?.[dead.controllerId]);
  const gatingChance = dead.side === 'player' && (!dead.isAlly || hasOwnHero)
    ? getGatingChance(heroFor(nextState, dead))
    : 0;
  if (gatingChance > 0 && DEMON_UNITS.some(u => u.name === dead.definition.name) && rng() < gatingChance) {
    const revived: UnitStack = { ...dead, count: 1, hp: dead.definition.hp };
    return {
      ...nextState,
      units: nextState.units.map(u => (u.id === dead.id ? revived : u)),
      grid: setOccupant(nextState.grid, dead.pos, dead.id),
      log: [...nextState.log, { type: 'status', data: { effect: 'gating', unitId: dead.id } }],
    };
  }
  return { ...nextState, grid: setOccupant(nextState.grid, dead.pos, null) };
}

const GRID_W = 12;
const GRID_H = 10;

export interface BattleInitOptions {
  controllers?: { player: string; ally: string; enemy: string };
  allyHero?: Hero;
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

function slotToStack(
  slot: ArmySlot,
  side: 'player' | 'enemy',
  index: number,
  id: string,
  colShift = 0,
  controllerId?: string
): UnitStack {
  const col = side === 'player' ? 1 + colShift : GRID_W - 2;
  const row = 1 + index * Math.floor((GRID_H - 2) / 6);
  return {
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
    morale: clampProc(abilityLevel(slot.unit, 'bravery')),
    luck: 0,
    atb: 0,
    isDefending: false,
    ...(controllerId ? { controllerId } : {}),
  };
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
  const playerUnits: UnitStack[] = playerArmy.map((slot, i) => {
    let stack = slotToStack(slot, 'player', i, allocateId(), tacticsShift, options.controllers?.player);
    if (moraleBonus > 0) stack = { ...stack, morale: stack.morale + moraleBonus };
    if (logisticsBonus > 0) stack = { ...stack, speedBonus: logisticsBonus };
    if (luckBonus > 0) stack = { ...stack, luck: stack.luck + luckBonus };
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
    }
    return stack;
  });
  const enemyUnits: UnitStack[] = enemyArmy.map((slot, i) =>
    slotToStack(slot, 'enemy', i, allocateId(), 0, options.controllers?.enemy)
  );
  // Summoned ally: player-side but AI-driven, fielded one column behind the
  // player line. Hero skill bonuses (morale/logistics/luck/gating) deliberately
  // don't apply — the ally fights under its own banner.
  const allyUnits: UnitStack[] = allyArmy.map((slot, i) => {
    let stack: UnitStack = {
      ...slotToStack(slot, 'player', i, allocateId(), -1, options.controllers?.ally),
      isAlly: true,
    };
    if (options.allyHero) {
      const allyMorale = getMoraleBonus(options.allyHero);
      const allyLogistics = getLogisticsBonus(options.allyHero);
      const allyLuck = getNatureLuckBonus(options.allyHero);
      if (allyMorale > 0) stack = { ...stack, morale: stack.morale + allyMorale };
      if (allyLogistics > 0) stack = { ...stack, speedBonus: allyLogistics };
      if (allyLuck > 0) stack = { ...stack, luck: stack.luck + allyLuck };
    }
    return stack;
  });

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

  // LordsWM-style start: every stack gets a seeded random 0–10% head start.
  const rng = mulberry32(seed);
  const allUnits = [...playerUnits, ...allyUnits, ...enemyUnits, heroStack, ...(allyHeroStack ? [allyHeroStack] : [])]
    .map(u => ({ ...u, atb: rng() * 0.1 }));

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
    ...(options.controllers ? {
      heroes: {
        [options.controllers.player]: { ...hero, mana: hero.mana ?? maxMana(hero) },
        ...(options.allyHero ? {
          [options.controllers.ally]: { ...options.allyHero, mana: options.allyHero.mana ?? maxMana(options.allyHero) },
        } : {}),
      },
    } : {}),
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [{ type: 'round_start', data: { round: 1 } }],
    result: 'ongoing',
    seed,
    nextId,
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

/** Peel `amount` creatures off a player stack into a new same-unit stack at an
 *  empty in-zone cell `to`. No-op if amount is out of (0, count), `to` isn't an
 *  empty in-zone cell, or the field-stack cap is reached. Battle-scoped —
 *  survivorsFrom merges same-unit stacks back into the persistent army. */
export function splitStack(state: BattleState, unitId: string, amount: number, to: Pos, controllerId?: string): BattleState {
  const unit = state.units.find(u => u.id === unitId);
  if (!isDeployable(unit, controllerId)) return state;
  if (!Number.isInteger(amount) || amount < 1 || amount >= unit.count) return state;
  if (!isInDeployZone(to, getTacticsShift(heroFor(state, unit)))) return state;
  const cell = state.grid.cells[to.row]?.[to.col];
  if (!cell) return state;
  if (cell.blocked || cell.occupantId) return state;
  const fieldStacks = state.units.filter(u => isDeployable(u, controllerId) && u.count > 0).length;
  if (fieldStacks >= MAX_FIELD_STACKS) return state;

  const id = `u${state.nextId}`;
  const created: UnitStack = {
    id,
    definition: unit.definition,
    count: amount,
    startCount: amount,
    hp: unit.definition.hp,
    pos: to,
    side: 'player',
    hasRetaliated: false,
    shotsLeft: unit.definition.shots,
    morale: unit.morale,
    luck: unit.luck,
    atb: 0,
    isDefending: false,
    ...(unit.isAlly ? { isAlly: true } : {}),
    ...(unit.controllerId ? { controllerId: unit.controllerId } : {}),
    ...(unit.attackBuff !== undefined ? { attackBuff: unit.attackBuff } : {}),
    ...(unit.defenseBuff !== undefined ? { defenseBuff: unit.defenseBuff } : {}),
    ...(unit.initiativeBonus !== undefined ? { initiativeBonus: unit.initiativeBonus } : {}),
  };
  const units = state.units
    .map(u => (u.id === unitId ? { ...u, count: u.count - amount, startCount: u.startCount - amount } : u))
    .concat(created);
  return { ...state, units, grid: setOccupant(state.grid, to, id), nextId: state.nextId + 1 };
}

/** Leave deployment and start the battle. The first actor was already chosen
 *  in initBattle, so this only unfreezes the turn loop. */
export function beginCombat(state: BattleState): BattleState {
  return { ...state, phase: 'combat', log: [] };
}

/** advanceTurn, plus Wizard Mysticism's mana regen whenever a new round starts. */
function advance(state: BattleState): BattleState {
  const next = advanceTurn(state);
  if (next.round > state.round) {
    if (next.heroes) {
      const heroes = Object.fromEntries(Object.entries(next.heroes).map(([id, hero]) => {
        const regen = getMysticismRegen(hero);
        return [id, regen > 0 ? { ...hero, mana: (hero.mana ?? 0) + regen } : hero];
      }));
      const hostId = next.units.find(unit => unit.isHero && !unit.isAlly)?.controllerId;
      return { ...next, heroes, hero: hostId ? heroes[hostId] : next.hero };
    }
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
  let nextState = { ...state, units: [...state.units], log: [...state.log] };

  const actorId = nextState.currentUnitId;
  if (!actorId) return nextState;
  const actorIdx = nextState.units.findIndex(u => u.id === actorId);
  if (actorIdx < 0) return nextState;
  let actor = nextState.units[actorIdx];
  let actorHero = heroFor(nextState, actor);

  // A finished turn re-enters the scale at 0; wait re-enters at 0.5 (half cycle).
  const reenter = (st: BattleState, atb: number): BattleState => ({
    ...st,
    units: st.units.map(u => (u.id === actorId ? { ...u, atb } : u)),
  });

  // Status effects resolve at the start of the acting unit's turn: burn damage first, then a blind skip.
  if (!actor.isHero && actor.count > 0) {
    if ((actor.burnRoundsLeft ?? 0) > 0) {
      const burnDamage = actor.burnDamage ?? 0;
      const { killed, remaining, events: burnEvents } = damageStack(actor, burnDamage);
      const roundsLeft = (actor.burnRoundsLeft ?? 0) - 1;
      const burned: UnitStack = {
        ...remaining,
        burnRoundsLeft: roundsLeft > 0 ? roundsLeft : undefined,
        burnDamage: roundsLeft > 0 ? actor.burnDamage : undefined,
      };
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === actorIdx ? burned : u)) };
      nextState.log = [...nextState.log, { type: 'status', data: { effect: 'burn', unitId: actorId, damage: burnDamage, killed } }, ...burnEvents];
      if (burned.count === 0) {
        nextState = handleDeath(nextState, burned, rng);
        const endResult = checkBattleEnd(nextState);
        if (endResult) {
          nextState.log = [...nextState.log, { type: 'battle_end', data: { result: endResult } }];
          return { ...nextState, result: endResult };
        }
        return advance(reenter(nextState, 0));
      }
      actor = burned;
    }

    if (actor.blindedUntilRound !== undefined) {
      const cleared = { ...actor, blindedUntilRound: undefined };
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === actorIdx ? cleared : u)) };
      nextState.log = [...nextState.log, { type: 'status', data: { effect: 'blind', unitId: actorId } }];
      return advance(reenter(nextState, 0));
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
  if (action.type === 'cast') {
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
  if (action.type === 'ability' && !canActivate(nextState, actor, action.abilityId)) {
    return state;
  }

  // Morale check
  const moraleResult = checkMorale(actor, rng);
  if (moraleResult === 'freeze') {
    nextState.log = [...nextState.log, { type: 'morale_freeze', data: { unitId: actorId } }];
    return advance(reenter(nextState, 0));
  }

  if (action.type === 'cast') {
    const spell = SPELLS[action.spell];
    const targetIdx = nextState.units.findIndex(u => u.id === action.targetId);
    const target = nextState.units[targetIdx];

    if (action.spell === 'lightning') {
      const damage = Math.round(lightningDamage(actorHero.level) * getSorceryMultiplier(actorHero));
      const { killed, remaining, events: boltEvents } = damageStack(target, damage);
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === targetIdx ? remaining : u)) };
      nextState.log = [...nextState.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: target.id, damage, killed } }, ...boltEvents];
      if (remaining.count === 0) {
        nextState = handleDeath(nextState, remaining, rng);
      }
    } else {
      const buffed =
        action.spell === 'bloodlust'
          ? { ...target, attackBuff: (target.attackBuff ?? 0) + 4 }
          : { ...target, defenseBuff: (target.defenseBuff ?? 0) + 4 };
      nextState = { ...nextState, units: nextState.units.map((u, i) => (i === targetIdx ? buffed : u)) };
      nextState.log = [...nextState.log, { type: 'cast', data: { spell: action.spell, casterId: actorId, targetId: target.id } }];
    }

    nextState = updateHeroFor(nextState, actor, hero => ({ ...hero, mana: (hero.mana ?? 0) - spell.cost }));
    actorHero = heroFor(nextState, actor);

  } else if (action.type === 'ability') {
    // The ability returns replacement stacks and log entries; grid cleanup and
    // deaths stay here, so consuming a stack whole frees its cell like any
    // other death would.
    const { units: patched, events } = UNIT_ABILITIES[action.abilityId].resolve(nextState, actor);
    const byId = new Map(patched.map(u => [u.id, u]));
    nextState = { ...nextState, units: nextState.units.map(u => byId.get(u.id) ?? u) };
    nextState.log = [...nextState.log, ...events];
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
      return advance(reenter(nextState, 0));
    }
    const newGrid = setOccupant(setOccupant(nextState.grid, actor.pos, null), action.to, actor.id);
    const updatedActor = { ...actor, pos: action.to, lastMovedFrom: actor.pos };
    const newUnits = nextState.units.map((u, i) => i === actorIdx ? updatedActor : u);
    nextState = { ...nextState, grid: newGrid, units: newUnits };
    nextState.log = [...nextState.log, { type: 'move', data: { unitId: actorId, from: updatedActor.lastMovedFrom, to: action.to } }];

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
      const newGrid = setOccupant(setOccupant(nextState.grid, actor.pos, null), action.moveTo, actor.id);
      attacker = { ...actor, pos: action.moveTo, lastMovedFrom: actor.pos };
      const movedUnits = nextState.units.map((u, i) => (i === actorIdx ? attacker : u));
      nextState = { ...nextState, grid: newGrid, units: movedUnits };
      nextState.log = [...nextState.log, { type: 'move', data: { unitId: actorId, from: attacker.lastMovedFrom, to: action.moveTo } }];
    }

    const { damage, luckEvents } = rollHit(nextState, attacker, target, rng, heroFor(nextState, attacker).attack);
    const { killed, remaining: hitTarget, events: hurtEvents } = applyStrike(attacker, target, damage);
    const { striker: attackerAfterHit, victim: remaining, events: hitEvents } =
      applyOnHitEffects(rng, attacker, hitTarget, damage, nextState.round, heroFor(nextState, attacker));

    nextState = {
      ...nextState,
      units: nextState.units.map((u, i) => {
        if (i === targetIdx) return remaining;
        if (i === actorIdx) return attackerAfterHit;
        return u;
      }),
    };
    nextState.log = [...nextState.log, ...luckEvents, { type: 'attack', data: { attackerId: actorId, targetId, damage, killed } }, ...hurtEvents, ...hitEvents];

    if (remaining.count === 0) {
      nextState = handleDeath(nextState, remaining, rng);
    }

    // Check end before retaliation
    const endResult = checkBattleEnd(nextState);
    if (endResult) {
      nextState.log = [...nextState.log, { type: 'battle_end', data: { result: endResult } }];
      return { ...nextState, result: endResult };
    }

    // Retaliation (only on regular attack, not on ranged)
    if (canRetaliate(remaining, attackerAfterHit)) {
      const { damage: retDamage, luckEvents: retLuckEvents } = rollHit(nextState, remaining, attackerAfterHit, rng, 0);
      const { killed: retKilled, remaining: hitAttacker, events: retHurtEvents } =
        applyStrike(remaining, attackerAfterHit, retDamage);
      const { striker: retaliatorAfterHit, victim: retActor, events: retEvents } =
        applyOnHitEffects(rng, remaining, hitAttacker, retDamage, nextState.round, heroFor(nextState, remaining));
      const updatedUnits = nextState.units.map(u => {
        if (u.id === targetId) return { ...retaliatorAfterHit, hasRetaliated: true };
        if (u.id === actorId) return retActor;
        return u;
      });
      nextState = { ...nextState, units: updatedUnits };
      nextState.log = [...nextState.log, ...retLuckEvents, { type: 'retaliate', data: { attackerId: targetId, targetId: actorId, damage: retDamage, killed: retKilled } }, ...retHurtEvents, ...retEvents];
      if (retActor.count === 0) {
        nextState = handleDeath(nextState, retActor, rng);
      }
    }

    // Double strike: a second melee hit after the retaliation, no second
    // retaliation. Skipped if either side died in the exchange.
    if (attacker.definition.abilities.includes('double_strike')) {
      const striker = nextState.units.find(u => u.id === actorId);
      const victim = nextState.units.find(u => u.id === targetId);
      if (striker && striker.count > 0 && victim && victim.count > 0) {
        const { damage: d2, luckEvents: luck2 } = rollHit(nextState, striker, victim, rng, heroFor(nextState, striker).attack);
        const { killed: k2, remaining: v2, events: hurt2Events } = applyStrike(striker, victim, d2);
        const { striker: s2after, victim: v2after, events: hit2Events } =
          applyOnHitEffects(rng, striker, v2, d2, nextState.round, heroFor(nextState, striker));
        nextState = { ...nextState, units: nextState.units.map(u => (u.id === targetId ? v2after : u.id === actorId ? s2after : u)) };
        nextState.log = [...nextState.log, ...luck2, { type: 'attack', data: { attackerId: actorId, targetId, damage: d2, killed: k2 } }, ...hurt2Events, ...hit2Events];
        if (v2after.count === 0) nextState = handleDeath(nextState, v2after, rng);
        const end2 = checkBattleEnd(nextState);
        if (end2) {
          nextState.log = [...nextState.log, { type: 'battle_end', data: { result: end2 } }];
          return { ...nextState, result: end2 };
        }
      }
    }

  } else if (action.type === 'shoot') {
    const targetId = (action as { type: 'shoot'; targetId: string }).targetId;
    const targetIdx = nextState.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(nextState, 0));
    const target = nextState.units[targetIdx];

    if (actor.shotsLeft <= 0) return advance(reenter(nextState, 0));
    if (isShootingBlocked(nextState, actor)) return advance(reenter(nextState, 0));

    // Grand Elf double_shot fires twice, consuming 2 shots.
    const shotCount = actor.definition.abilities.includes('double_shot') ? 2 : 1;
    // LordsWM far-shot rule: beyond the shooter's range the shot deals half damage.
    const farShot = isBeyondRange(actor, target);
    let currentTarget = target;
    let firstShotDamage = 0;
    for (let shot = 0; shot < shotCount && currentTarget.count > 0; shot++) {
      const { damage: fullDamage, luckEvents } = rollHit(nextState, actor, currentTarget, rng, actorHero.attack, true);
      const shotDamage = farShot ? Math.max(1, Math.round(fullDamage / 2)) : fullDamage;
      if (shot === 0) firstShotDamage = shotDamage;
      const { killed, remaining, events: shotEvents } = damageStack(currentTarget, shotDamage);
      currentTarget = remaining;
      nextState.log = [...nextState.log, ...luckEvents, { type: 'shoot', data: { attackerId: actorId, targetId, damage: shotDamage, killed, ...(farShot ? { farShot: true } : {}) } }, ...shotEvents];
    }

    const shootingActor = { ...actor, shotsLeft: Math.max(0, actor.shotsLeft - shotCount) };
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

    // Lich area_shot: 50% splash damage to enemy stacks adjacent to the target.
    if (actor.definition.abilities.includes('area_shot')) {
      const splashDamage = Math.max(1, Math.round(firstShotDamage * 0.5));
      const splashTargets = nextState.units.filter(
        u => u.id !== targetId && u.count > 0 && !u.isHero && u.side !== actor.side
          && chebyshevDistance(u.pos, target.pos) === 1
      );
      for (const victim of splashTargets) {
        const idx = nextState.units.findIndex(u => u.id === victim.id);
        const { killed: splashKilled, remaining: splashRemaining, events: splashEvents } =
          damageStack(nextState.units[idx], splashDamage);
        nextState = { ...nextState, units: nextState.units.map((u, i) => (i === idx ? splashRemaining : u)) };
        nextState.log = [...nextState.log, { type: 'shoot', data: { attackerId: actorId, targetId: victim.id, damage: splashDamage, killed: splashKilled, splash: true } }, ...splashEvents];
        if (splashRemaining.count === 0) {
          nextState = handleDeath(nextState, splashRemaining, rng);
        }
      }
    }
  }

  // Morale boost = extra turn (don't advance)
  if (moraleResult === 'boost') {
    nextState.log = [...nextState.log, { type: 'morale_boost', data: { unitId: actorId } }];
    return nextState;
  }

  const endResult = checkBattleEnd(nextState);
  if (endResult) {
    nextState.log = [...nextState.log, { type: 'battle_end', data: { result: endResult } }];
    return { ...nextState, result: endResult };
  }

  return advance(reenter(nextState, action.type === 'wait' ? 0.5 : 0));
}
