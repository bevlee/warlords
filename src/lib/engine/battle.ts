import { v4 as uuidv4 } from 'uuid';
import type { ArmySlot, BattleAction, BattleState, Hero, UnitStack } from './types';
import { createGrid, placeUnits, setOccupant } from './grid';
import { advanceTurn } from './turnOrder';
import { calculateDamage, applyDamage, canRetaliate, checkMorale } from './combat';
import { mulberry32 } from './rng';

const GRID_W = 12;
const GRID_H = 10;

function slotToStack(slot: ArmySlot, side: 'player' | 'enemy', index: number): UnitStack {
  const col = side === 'player' ? 1 : GRID_W - 2;
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
  };
}

export function initBattle(
  playerArmy: ArmySlot[],
  enemyArmy: ArmySlot[],
  hero: Hero,
  seed = Date.now()
): BattleState {
  let grid = createGrid(GRID_W, GRID_H);

  const playerUnits: UnitStack[] = playerArmy.map((slot, i) => slotToStack(slot, 'player', i));
  const enemyUnits: UnitStack[] = enemyArmy.map((slot, i) => slotToStack(slot, 'enemy', i));

  // LordsWM-style start: every stack gets a seeded random 0–10% head start.
  const rng = mulberry32(seed);
  const allUnits = [...playerUnits, ...enemyUnits].map(u => ({ ...u, atb: rng() * 0.1 }));

  grid = placeUnits(grid, allUnits);

  const state: BattleState = {
    grid,
    units: allUnits,
    hero,
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [{ type: 'round_start', data: { round: 1 } }],
    result: 'ongoing',
    seed,
  };
  return advanceTurn(state);
}

export function checkBattleEnd(state: BattleState): 'player_wins' | 'enemy_wins' | null {
  const playerAlive = state.units.some(u => u.side === 'player' && u.count > 0);
  const enemyAlive = state.units.some(u => u.side === 'enemy' && u.count > 0);
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

  // A finished turn re-enters the scale at 0; wait re-enters at 0.5 (half cycle).
  const reenter = (st: BattleState, atb: number): BattleState => ({
    ...st,
    units: st.units.map(u => (u.id === actorId ? { ...u, atb } : u)),
  });

  // Morale check
  const moraleResult = checkMorale(actor, rng);
  if (moraleResult === 'freeze') {
    s.log = [...s.log, { type: 'morale_freeze', data: { unitId: actorId } }];
    return advanceTurn(reenter(s, 0));
  }

  if (action.type === 'move') {
    const newGrid = setOccupant(setOccupant(s.grid, actor.pos, null), action.to, actor.id);
    const updatedActor = { ...actor, pos: action.to };
    const newUnits = s.units.map((u, i) => i === actorIdx ? updatedActor : u);
    s = { ...s, grid: newGrid, units: newUnits };
    s.log = [...s.log, { type: 'move', data: { unitId: actorId, to: action.to } }];

  } else if (action.type === 'attack') {
    const targetId = action.targetId;
    const targetIdx = s.units.findIndex(u => u.id === targetId);
    if (targetIdx < 0) return advanceTurn(reenter(s, 0));
    const target = s.units[targetIdx];

    // Combined move+attack: relocate the actor before resolving the melee.
    let attacker = actor;
    if (action.moveTo) {
      const newGrid = setOccupant(setOccupant(s.grid, actor.pos, null), action.moveTo, actor.id);
      attacker = { ...actor, pos: action.moveTo };
      const movedUnits = s.units.map((u, i) => (i === actorIdx ? attacker : u));
      s = { ...s, grid: newGrid, units: movedUnits };
      s.log = [...s.log, { type: 'move', data: { unitId: actorId, to: action.moveTo } }];
    }

    const damage = calculateDamage(attacker, target, s.hero.attack, rng);
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
    if (endResult) return { ...s, result: endResult };

    // Retaliation (only on regular attack, not on ranged)
    if (action.type === 'attack' && canRetaliate(remaining)) {
      const retDamage = calculateDamage(remaining, attacker, 0, rng);
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
    if (targetIdx < 0) return advanceTurn(reenter(s, 0));
    const target = s.units[targetIdx];

    if (actor.shotsLeft <= 0) return advanceTurn(reenter(s, 0));

    const damage = calculateDamage(actor, target, s.hero.attack, rng);
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
  if (endResult) return { ...s, result: endResult };

  return advanceTurn(reenter(s, action.type === 'wait' ? 0.5 : 0));
}
