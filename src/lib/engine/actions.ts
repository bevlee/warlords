import type { BattleAction, BattleState, Hero, Pos, SpellId, UnitStack } from './types.ts';
import { canActivate } from './unitAbilities.ts';
import { chebyshevDistance } from './grid.ts';
import { canShootTarget, getDartingRetreatCells, getReachableCells, isShootingBlocked } from './selectors.ts';

export interface ActionContext {
  actionId: string;
  actorId: string;
  kind: 'move' | 'melee' | 'ranged' | 'ability' | 'spell' | 'hero_action' | 'wait' | 'defend';
  startPos?: Pos;
  movedDistance: number;
  primaryTargetId?: string;
  strikeIndex: number;
  isPrimaryHit: boolean;
  isRetaliation: boolean;
  triggeredGoodLuck: boolean;
  deadNonHeroStacksAtStart?: number;
  completion: { proposals: number[]; additive: number };
}

const samePos = (a: Pos, b: Pos) => a.col === b.col && a.row === b.row;
const heroForActor = (state: BattleState, actor: UnitStack): Hero =>
  actor.controllerId ? (state.heroes?.[actor.controllerId] ?? state.hero) : state.hero;
const SPELL_RULES: Record<SpellId, { cost: number; friendly: boolean }> = {
  lightning: { cost: 3, friendly: false }, bloodlust: { cost: 2, friendly: true }, stoneskin: { cost: 2, friendly: true },
  slow: { cost: 2, friendly: false }, chain_lightning: { cost: 3, friendly: false }, resurrect: { cost: 5, friendly: true }, blizzard: { cost: 5, friendly: false },
};
const availableSpells = (heroClass: string, spells: SpellId[] | undefined): SpellId[] => {
  if (heroClass !== 'wizard') return [];
  return spells ?? ['lightning', 'bloodlust', 'stoneskin'];
};
const sameController = (a: UnitStack, b: UnitStack): boolean =>
  (a.controllerId ?? a.side) === (b.controllerId ?? b.side);
const validThreeByThree = (state: BattleState, area: Pos[] | undefined): boolean => {
  if (!area || area.length !== 9 || area.some(pos => !state.grid.cells[pos.row]?.[pos.col])) return false;
  const cols = [...new Set(area.map(pos => pos.col))].sort((a, b) => a - b);
  const rows = [...new Set(area.map(pos => pos.row))].sort((a, b) => a - b);
  return cols.length === 3 && rows.length === 3 && cols[2] - cols[0] === 2 && rows[2] - rows[0] === 2;
};

export function validateAction(state: BattleState, action: BattleAction): boolean {
  if (state.result !== 'ongoing') return false;
  if (action.type === 'debug') return true;
  const actor = state.units.find(unit => unit.id === state.currentUnitId && unit.count > 0);
  if (!actor) return false;
  if (action.type === 'wait' || action.type === 'defend') return true;
  if (action.type === 'move') {
    if (actor.isHero || actor.boundUntilRound !== undefined || (actor.effects ?? []).some(effect => effect.kind === 'bind' || effect.data?.noMove === true)) return false;
    return getReachableCells(state.grid, actor, state).some(cell => samePos(cell, action.to));
  }
  if (action.type === 'attack') {
    if (actor.isHero) return false;
    const target = state.units.find(unit => unit.id === action.targetId && unit.count > 0 && !unit.isHero && unit.side !== actor.side);
    if (!target) return false;
    if (!action.moveTo) return action.retreatTo === undefined && chebyshevDistance(actor.pos, target.pos) === 1;
    if (actor.boundUntilRound !== undefined || (actor.effects ?? []).some(effect => effect.kind === 'bind' || effect.data?.noMove === true)) return false;
    const legalApproach = chebyshevDistance(action.moveTo, target.pos) === 1 && getReachableCells(state.grid, actor, state).some(cell => samePos(cell, action.moveTo!));
    if (!legalApproach) return false;
    return action.retreatTo === undefined || getDartingRetreatCells(state, actor, action.moveTo).some(cell => samePos(cell, action.retreatTo!));
  }
  if (action.type === 'shoot') {
    const target = state.units.find(unit => unit.id === action.targetId && unit.count > 0 && !unit.isHero && unit.side !== actor.side);
    return !!target && canShootTarget(actor, target) && (actor.isHero || !isShootingBlocked(state, actor));
  }
  if (action.type === 'cast') {
    const hero = heroForActor(state, actor);
    const spell = SPELL_RULES[action.spell];
    const target = state.units.find(unit => unit.id === action.targetId && unit.count > 0 && !unit.isHero);
    return !!actor.isHero && hero.class === 'wizard' && availableSpells(hero.class, hero.spells).includes(action.spell) &&
      !!spell && (hero.mana ?? 0) >= spell.cost && !!target && (spell.friendly ? target.side === actor.side : target.side !== actor.side);
  }
  if (action.type === 'ability') return canActivate(state, actor, action.abilityId, action.targetId, action.to);
  if (action.type === 'hero_action') {
    if (!actor.isHero) return false;
    const heroClass = heroForActor(state, actor).class;
    const allowed: Record<string, string[]> = {
      knight: ['hold_the_line', 'ready_the_counterattack', 'advance_by_ranks'],
      ranger: ['name_the_quarry', 'set_the_ambush', 'open_an_escape_route'],
      barbarian: ['charge', 'loose', 'blood_for_blood'],
      demon: ['blood_offering', 'feed_the_fire', 'demonic_bargain'],
      necromancer: ['reknit_the_dead', 'grasping_dead', 'death_march'],
      wizard: [],
    };
    if (!allowed[heroClass].includes(action.actionId)) return false;
    const target = action.targetId ? state.units.find(unit => unit.id === action.targetId && unit.count > 0 && !unit.isHero) : undefined;
    if (heroClass === 'ranger') {
      if (action.actionId === 'name_the_quarry') return !!target && target.side !== actor.side;
      return validThreeByThree(state, action.area);
    }
    if (heroClass === 'demon') {
      if (!target) return false;
      if (action.actionId === 'feed_the_fire') return (target.burnRoundsLeft ?? 0) > 0;
      return target.side === actor.side && sameController(actor, target);
    }
    if (heroClass === 'necromancer') {
      const skeletons = state.units.filter(unit => unit.count > 0 && unit.definition.name === 'Skeleton' && sameController(actor, unit)).reduce((sum, unit) => sum + unit.count, 0);
      if (action.actionId === 'death_march') return skeletons >= 10;
      if (!target) return false;
      if (action.actionId === 'grasping_dead') return target.side !== actor.side && skeletons >= 5;
      const wounded = target.count < target.startCount || target.hp < target.definition.hp;
      return sameController(actor, target) && target.definition.name !== 'Skeleton' && wounded && skeletons > 0;
    }
    if (heroClass === 'barbarian') {
      const current = state.heroActionState?.[actor.controllerId ?? actor.side] ?? {};
      const uses = Number(current[`${action.actionId}Uses`] ?? 0);
      return uses < (state.artifacts?.[actor.controllerId ?? actor.side]?.includes('voice_of_the_warchief') ? 2 : 1);
    }
    return true;
  }
  return false;
}

export function createActionContext(state: BattleState, action: BattleAction): ActionContext | null {
  if (!validateAction(state, action)) return null;
  const actor = state.units.find(unit => unit.id === state.currentUnitId)!;
  const targetId = 'targetId' in action ? action.targetId : undefined;
  const to = action.type === 'move' ? action.to : action.type === 'attack' ? action.moveTo : undefined;
  return {
    actionId: `${state.seed}:${state.actionSeq ?? 0}`,
    actorId: actor.id,
    kind: action.type === 'attack' ? 'melee' : action.type === 'shoot' ? 'ranged' : action.type === 'cast' ? 'spell' : action.type as ActionContext['kind'],
    startPos: actor.isHero ? undefined : actor.pos,
    movedDistance: to ? chebyshevDistance(actor.pos, to) : 0,
    primaryTargetId: targetId,
    strikeIndex: 0,
    isPrimaryHit: true,
    isRetaliation: false,
    triggeredGoodLuck: false,
    deadNonHeroStacksAtStart: state.units.filter(unit => !unit.isHero && unit.count <= 0).length,
    completion: { proposals: [0], additive: 0 },
  };
}

export const resolveTurnReentry = (context: ActionContext): number =>
  Math.min(1, Math.max(0, ...context.completion.proposals) + context.completion.additive);
