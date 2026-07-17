import { v4 as uuidv4 } from 'uuid';
import type { ArmySlot, BattleAction, BattleEvent, BattleState, Hero, SpellId, UnitStack } from './types';
import { chebyshevDistance, createGrid, placeUnits, setBlocked, setOccupant } from './grid';
import { advanceTurn } from './turnOrder';
import { calculateDamage, applyDamage, canRetaliate, checkMorale, type LuckSink } from './combat';
import { isBeyondRange, isShootingBlocked, type DamagePreview } from './selectors';
import { mulberry32, type Rng } from './rng';
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
  getMysticismRegen,
  maxMana,
} from './factionSkills';
import { DEMON_UNITS } from './demon';
import {
  GRID_W,
  GRID_H,
  autoDeploy,
  enemyAutoDeploy,
  generateObstacles,
  validateDeployment,
  type Deployment,
} from './deploy';
import { getKnownSpells, getSpellDef } from './spells';
import { generateStructures, WAR_CHEST_XP } from './structures';

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

  if (abilities.includes('life_drain') && a.count > 0) {
    const heal = Math.round(damageDealt / a.count);
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
 * A stack ending its move on an unclaimed structure claims it for its side,
 * permanently for the battle. Buffs land on every living stack of that side;
 * mana/loot rewards only mean anything to the player.
 */
function claimStructureAt(s: BattleState, actorId: string): BattleState {
  const actor = s.units.find(u => u.id === actorId);
  if (!actor || actor.isHero || actor.count === 0) return s;
  const idx = (s.structures ?? []).findIndex(
    st => !st.claimedBy && st.pos.col === actor.pos.col && st.pos.row === actor.pos.row
  );
  if (idx < 0) return s;

  const structure = s.structures![idx];
  const side = actor.side;
  let next: BattleState = {
    ...s,
    structures: s.structures!.map((st, i) => (i === idx ? { ...st, claimedBy: side } : st)),
    log: [...s.log, { type: 'status', data: { effect: 'structure_claim', kind: structure.kind, unitId: actorId, side } }],
  };

  const buffArmy = (f: (u: UnitStack) => UnitStack): BattleState => ({
    ...next,
    units: next.units.map(u => (u.side === side && !u.isHero && u.count > 0 ? f(u) : u)),
  });

  switch (structure.kind) {
    case 'shrine_attack':
      return buffArmy(u => ({ ...u, attackBuff: (u.attackBuff ?? 0) + 2 }));
    case 'shrine_defense':
      return buffArmy(u => ({ ...u, defenseBuff: (u.defenseBuff ?? 0) + 2 }));
    case 'fountain_luck':
      return buffArmy(u => ({ ...u, luck: Math.min(3, u.luck + 1) }));
    case 'idol_morale':
      return buffArmy(u => ({ ...u, morale: Math.min(3, u.morale + 1) }));
    case 'mana_crystal':
      return side === 'player'
        ? { ...next, hero: { ...next.hero, mana: (next.hero.mana ?? 0) + 4 } }
        : next;
    case 'war_chest':
      return side === 'player' ? { ...next, lootXp: (next.lootXp ?? 0) + WAR_CHEST_XP } : next;
  }
}

/**
 * Logs a death and clears its grid cell. Demon Gating gives a fallen
 * Demon-faction stack on the hero's side a chance to respawn at 1 creature
 * instead, in the same cell.
 */
function handleDeath(s: BattleState, dead: UnitStack, rng: Rng): BattleState {
  const next: BattleState = { ...s, log: [...s.log, { type: 'death', data: { unitId: dead.id } }] };
  const gatingChance = dead.side === 'player' ? getGatingChance(next.hero) : 0;
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

// The spell registry lives in spells.ts; re-exported here for existing callers.
export { SPELLS, lightningDamage, getKnownSpells, getSpellDef } from './spells';

/** Forecast for the spell-aiming tooltip: exact damage for damage spells; null for buffs. */
export function spellPreview(hero: Hero, spell: SpellId, target: UnitStack): DamagePreview | null {
  const def = getSpellDef(spell);
  return def?.preview ? (def.preview(hero, target) ?? null) : null;
}

function deploymentToStack(d: Deployment, side: 'player' | 'enemy'): UnitStack {
  return {
    id: uuidv4(),
    definition: d.unit,
    count: d.count,
    hp: d.unit.hp,
    pos: { ...d.pos },
    side,
    hasRetaliated: false,
    shotsLeft: d.unit.shots,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    startCount: d.count, // ceiling for Healing Light / Raise Dead
  };
}

export function initBattle(
  playerArmy: ArmySlot[],
  enemyArmy: ArmySlot[],
  hero: Hero,
  seed = Date.now(),
  playerDeployment?: Deployment[]
): BattleState {
  let grid = createGrid(GRID_W, GRID_H);

  // Rocks come from their own seeded stream (independent of army makeup), so
  // the deployment preview and the battle always agree on the battlefield.
  const obstacles = generateObstacles(seed);
  for (const pos of obstacles) grid = setBlocked(grid, pos);

  if (playerDeployment) {
    const problem = validateDeployment(playerArmy, playerDeployment, hero);
    if (problem) throw new Error(`invalid deployment: ${problem}`);
  }
  const deployment = playerDeployment ?? autoDeploy(playerArmy, hero);

  const moraleBonus = getMoraleBonus(hero);
  const logisticsBonus = getLogisticsBonus(hero);
  const luckBonus = getNatureLuckBonus(hero);
  // Per-stack bonuses apply to each deployed stack, so splits keep them.
  const playerUnits: UnitStack[] = deployment.map(d => {
    let stack = deploymentToStack(d, 'player');
    if (moraleBonus > 0) stack = { ...stack, morale: stack.morale + moraleBonus };
    if (logisticsBonus > 0) stack = { ...stack, speedBonus: logisticsBonus };
    if (luckBonus > 0) stack = { ...stack, luck: stack.luck + luckBonus };
    return stack;
  });
  const enemyUnits: UnitStack[] = enemyAutoDeploy(enemyArmy).map(d => deploymentToStack(d, 'enemy'));

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

  let state: BattleState = {
    grid,
    units: allUnits,
    hero: { ...hero, mana: hero.mana ?? maxMana(hero) },
    round: 1,
    battleTime: 0,
    currentUnitId: null,
    log: [{ type: 'round_start', data: { round: 1 } }],
    result: 'ongoing',
    seed,
    structures: generateStructures(seed, obstacles),
    lootXp: 0,
  };
  // A stack deployed straight onto a structure claims it at battle start.
  for (const u of state.units) state = claimStructureAt(state, u.id);
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
          s.log = [...s.log, { type: 'battle_end', data: { result: endResult, lootXp: s.lootXp ?? 0 } }];
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
    const def = getSpellDef(action.spell);
    const target = s.units.find(u => u.id === action.targetId);
    if (
      !actor.isHero ||
      !def ||
      !getKnownSpells(s.hero).some(d => d.id === def.id) ||
      (s.hero.mana ?? 0) < def.cost ||
      !target ||
      target.count === 0 ||
      target.isHero ||
      (def.target === 'friendly' ? target.side !== actor.side : target.side === actor.side) ||
      (def.canTarget && !def.canTarget(s.hero, target))
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
    const def = getSpellDef(action.spell)!;
    const countsBefore = new Map(s.units.map(u => [u.id, u.count]));

    const { units, events } = def.resolve(s, actorId, action.targetId, rng);
    s = { ...s, units, hero: { ...s.hero, mana: (s.hero.mana ?? 0) - def.cost } };
    s.log = [...s.log, ...events];

    // Settle any stacks the spell killed (splash can kill several).
    for (const u of s.units) {
      if (u.count === 0 && (countsBefore.get(u.id) ?? 0) > 0) {
        s = handleDeath(s, u, rng);
      }
    }

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
    s = claimStructureAt(s, actorId);

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
      s = claimStructureAt(s, actorId);
      attacker = s.units[actorIdx]; // claim buffs (e.g. War Shrine) apply to this very strike
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
      s.log = [...s.log, { type: 'battle_end', data: { result: endResult, lootXp: s.lootXp ?? 0 } }];
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
    s.log = [...s.log, { type: 'battle_end', data: { result: endResult, lootXp: s.lootXp ?? 0 } }];
    return { ...s, result: endResult };
  }

  return advance(reenter(s, action.type === 'wait' ? 0.5 : 0));
}
