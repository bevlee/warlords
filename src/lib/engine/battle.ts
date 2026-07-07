import { v4 as uuidv4 } from 'uuid';
import type { ArmySlot, BattleAction, BattleState, Hero, SpellId, UnitStack } from './types';
import { createGrid, placeUnits, setBlocked, setOccupant } from './grid';
import { advanceTurn } from './turnOrder';
import { calculateDamage, applyDamage, canRetaliate, checkMorale } from './combat';
import { mulberry32 } from './rng';
import {
  applyOffenseBonus,
  applyArmorerBonus,
  getMoraleBonus,
  getSorceryMultiplier,
  getMysticismRegen,
  getTacticsShift,
  maxMana,
} from './factionSkills';

/** Barbarian Offense boosts damage a player stack deals; Knight/Barbarian Armorer
 *  reduces damage a player stack takes. Both are hero-wide, so they're applied
 *  here rather than inside calculateDamage (which only knows per-unit abilities). */
function withHeroBonus(hero: Hero, attacker: UnitStack, defender: UnitStack, damage: number): number {
  let d = damage;
  if (attacker.side === 'player') d = applyOffenseBonus(d, hero);
  if (defender.side === 'player') d = applyArmorerBonus(d, hero);
  return d;
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
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
  };
}

export function initBattle(
  playerArmy: ArmySlot[],
  enemyArmy: ArmySlot[],
  hero: Hero,
  seed = Date.now()
): BattleState {
  let grid = createGrid(GRID_W, GRID_H);

  const moraleBonus = getMoraleBonus(hero);
  const tacticsShift = getTacticsShift(hero);
  const playerUnits: UnitStack[] = playerArmy.map((slot, i) => {
    const stack = slotToStack(slot, 'player', i, tacticsShift);
    return moraleBonus > 0 ? { ...stack, morale: stack.morale + moraleBonus } : stack;
  });
  const enemyUnits: UnitStack[] = enemyArmy.map((slot, i) => slotToStack(slot, 'enemy', i));

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
  const allUnits = [...playerUnits, ...enemyUnits, heroStack].map(u => ({ ...u, atb: rng() * 0.1 }));

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
  };
  return advance(state);
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
  const actor = s.units[actorIdx];

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

  // A finished turn re-enters the scale at 0; wait re-enters at 0.5 (half cycle).
  const reenter = (st: BattleState, atb: number): BattleState => ({
    ...st,
    units: st.units.map(u => (u.id === actorId ? { ...u, atb } : u)),
  });

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
        s.log = [...s.log, { type: 'death', data: { unitId: target.id } }];
        s = { ...s, grid: setOccupant(s.grid, remaining.pos, null) };
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
    const newGrid = setOccupant(setOccupant(s.grid, actor.pos, null), action.to, actor.id);
    const updatedActor = { ...actor, pos: action.to, lastMovedFrom: actor.pos };
    const newUnits = s.units.map((u, i) => i === actorIdx ? updatedActor : u);
    s = { ...s, grid: newGrid, units: newUnits };
    s.log = [...s.log, { type: 'move', data: { unitId: actorId, to: action.to } }];

  } else if (action.type === 'attack') {
    const targetId = action.targetId;
    const targetIdx = s.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(s, 0));
    const target = s.units[targetIdx];

    // Combined move+attack: relocate the actor before resolving the melee.
    let attacker = actor;
    if (action.moveTo) {
      const newGrid = setOccupant(setOccupant(s.grid, actor.pos, null), action.moveTo, actor.id);
      attacker = { ...actor, pos: action.moveTo, lastMovedFrom: actor.pos };
      const movedUnits = s.units.map((u, i) => (i === actorIdx ? attacker : u));
      s = { ...s, grid: newGrid, units: movedUnits };
      s.log = [...s.log, { type: 'move', data: { unitId: actorId, to: action.moveTo } }];
    }

    const damage = withHeroBonus(s.hero, attacker, target, calculateDamage(attacker, target, s.hero.attack, rng));
    const { killed, remaining } = applyDamage(target, damage);

    const newUnits = s.units.map((u, i) => i === targetIdx ? remaining : u);
    s = { ...s, units: newUnits };
    s.log = [...s.log, { type: 'attack', data: { attackerId: actorId, targetId, damage, killed } }];

    if (remaining.count === 0) {
      s.log = [...s.log, { type: 'death', data: { unitId: targetId } }];
      s = { ...s, grid: setOccupant(s.grid, remaining.pos, null) };
    }

    // Check end before retaliation
    const endResult = checkBattleEnd(s);
    if (endResult) {
      s.log = [...s.log, { type: 'battle_end', data: { result: endResult } }];
      return { ...s, result: endResult };
    }

    // Retaliation (only on regular attack, not on ranged)
    if (action.type === 'attack' && canRetaliate(remaining, attacker)) {
      const retDamage = withHeroBonus(s.hero, remaining, attacker, calculateDamage(remaining, attacker, 0, rng));
      const { killed: retKilled, remaining: retActor } = applyDamage(attacker, retDamage);
      const updatedUnits = s.units.map(u => {
        if (u.id === targetId) return { ...remaining, hasRetaliated: true };
        if (u.id === actorId) return retActor;
        return u;
      });
      s = { ...s, units: updatedUnits };
      s.log = [...s.log, { type: 'retaliate', data: { attackerId: targetId, targetId: actorId, damage: retDamage, killed: retKilled } }];
      if (retActor.count === 0) {
        s.log = [...s.log, { type: 'death', data: { unitId: actorId } }];
        s = { ...s, grid: setOccupant(s.grid, retActor.pos, null) };
      }
    }

  } else if (action.type === 'shoot') {
    const targetId = (action as { type: 'shoot'; targetId: string }).targetId;
    const targetIdx = s.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advance(reenter(s, 0));
    const target = s.units[targetIdx];

    if (actor.shotsLeft <= 0) return advance(reenter(s, 0));

    const damage = withHeroBonus(s.hero, actor, target, calculateDamage(actor, target, s.hero.attack, rng));
    const { killed, remaining } = applyDamage(target, damage);
    const shootingActor = { ...actor, shotsLeft: actor.shotsLeft - 1 };
    const newUnits = s.units.map((u, i) => {
      if (i === actorIdx) return shootingActor;
      if (i === targetIdx) return remaining;
      return u;
    });
    s = { ...s, units: newUnits };
    s.log = [...s.log, { type: 'shoot', data: { attackerId: actorId, targetId, damage, killed } }];
    if (remaining.count === 0) {
      s.log = [...s.log, { type: 'death', data: { unitId: targetId } }];
      s = { ...s, grid: setOccupant(s.grid, remaining.pos, null) };
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
