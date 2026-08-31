import type { BattleAction, BattleState } from './types.ts';
import { chebyshevDistance } from './grid.ts';
import { canShootTarget, getDartingRetreatCells, getMeleeApproaches, getReachableCells, isShootingBlocked } from './selectors.ts';
import { UNIT_ABILITIES, activatedAbilitiesOf } from './unitAbilities.ts';
import { validateAction } from './actions.ts';

function threeByThree(state: BattleState, center: { col: number; row: number }): Array<{ col: number; row: number }> {
  const col = Math.max(1, Math.min(state.grid.width - 2, center.col));
  const row = Math.max(1, Math.min(state.grid.height - 2, center.row));
  const area: Array<{ col: number; row: number }> = [];
  for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) area.push({ col: c, row: r });
  return area;
}

export function aiTakeTurn(state: BattleState, unitId: string): BattleAction {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit || unit.count === 0) return { type: 'wait' };

  if (unit.isHero) {
    const hero = unit.controllerId ? state.heroes?.[unit.controllerId] ?? state.hero : state.hero;
    const enemies = state.units.filter(other => other.side !== unit.side && other.count > 0 && !other.isHero);
    const allies = state.units.filter(other => other.side === unit.side && other.count > 0 && !other.isHero && (!unit.controllerId || other.controllerId === unit.controllerId));
    const tryAction = (action: BattleAction): BattleAction | null => validateAction(state, action) ? action : null;
    if (hero.class === 'knight') {
      const current = state.heroActionState?.[unit.controllerId ?? unit.side]?.activeOrder;
      return tryAction({ type: 'hero_action', actionId: current ? 'ready_the_counterattack' : 'hold_the_line' }) ?? { type: 'wait' };
    }
    if (hero.class === 'ranger' && enemies.length) return tryAction({ type: 'hero_action', actionId: 'name_the_quarry', targetId: enemies[0].id }) ?? { type: 'wait' };
    if (hero.class === 'barbarian') {
      const actionId = allies.filter(ally => ally.definition.shots > 0).length >= 2 ? 'loose' : allies.filter(ally => ally.definition.shots === 0).length >= 2 ? 'charge' : 'blood_for_blood';
      return tryAction({ type: 'hero_action', actionId }) ?? (enemies[0] ? { type: 'shoot', targetId: enemies[0].id } : { type: 'wait' });
    }
    if (hero.class === 'demon') {
      const burning = [...enemies, ...allies].find(target => (target.burnRoundsLeft ?? 0) > 0);
      if (burning) return { type: 'hero_action', actionId: 'feed_the_fire', targetId: burning.id };
      const sacrifice = [...allies].sort((a, b) => a.count * a.definition.hp - b.count * b.definition.hp)[0];
      if (sacrifice) return { type: 'hero_action', actionId: 'blood_offering', targetId: sacrifice.id };
    }
    if (hero.class === 'necromancer') {
      const march = tryAction({ type: 'hero_action', actionId: 'death_march' });
      if (march) return march;
      const target = enemies[0];
      if (target) {
        const grasp = tryAction({ type: 'hero_action', actionId: 'grasping_dead', targetId: target.id });
        if (grasp) return grasp;
      }
    }
  }

  // Self-repair before fighting, but only once whole creatures have been lost —
  // otherwise a Bone Dragon grazed for a few HP would spend its turn without doing anything.
  if (unit.count < unit.startCount) {
    const healing = activatedAbilitiesOf(unit).find(id => UNIT_ABILITIES[id].canUse(state, unit));
    if (healing) return { type: 'ability', abilityId: healing };
  }

  const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0 && !u.isHero);
  if (enemies.length === 0) return { type: 'wait' };

  // Find nearest enemy (Chebyshev)
  const target = enemies.reduce((closest, e) =>
    chebyshevDistance(unit.pos, e.pos) < chebyshevDistance(unit.pos, closest.pos) ? e : closest
  );

  const meleeAction = (targetId: string, moveTo?: { col: number; row: number }): BattleAction => {
    if (!moveTo) return { type: 'attack', targetId };
    const retreatCells = getDartingRetreatCells(state, unit, moveTo);
    const retreatTo = retreatCells.sort((a, b) => {
      const aDistance = Math.min(...enemies.map(enemy => chebyshevDistance(a, enemy.pos)));
      const bDistance = Math.min(...enemies.map(enemy => chebyshevDistance(b, enemy.pos)));
      return bDistance - aDistance || a.row - b.row || a.col - b.col;
    })[0];
    return { type: 'attack', targetId, moveTo, ...(retreatTo ? { retreatTo } : {}) };
  };

  if (unit.definition.abilities.includes('haste_ritual') && UNIT_ABILITIES.haste_ritual.canUse(state, unit)) return { type: 'ability', abilityId: 'haste_ritual' };
  if (unit.definition.abilities.includes('gate')) {
    const gateCell = getReachableCells(state.grid, { ...unit, definition: { ...unit.definition, speed: 1, abilities: unit.definition.abilities.filter(id => id !== 'teleport') } }, state)
      .find(to => UNIT_ABILITIES.gate.canUse(state, unit, undefined, to));
    if (gateCell) return { type: 'ability', abilityId: 'gate', to: gateCell };
  }
  if (unit.definition.abilities.includes('caustic_breath')) {
    const dc = Math.sign(target.pos.col - unit.pos.col);
    const dr = Math.sign(target.pos.row - unit.pos.row);
    const to = { col: unit.pos.col + dc, row: unit.pos.row + dr };
    if (UNIT_ABILITIES.caustic_breath.canUse(state, unit, undefined, to)) return { type: 'ability', abilityId: 'caustic_breath', to };
  }

  // Ranged: shoot unless an enemy is in our face — beyond range still beats walking (half damage)
  if (canShootTarget(unit, target) && !isShootingBlocked(state, unit)) {
    return { type: 'shoot', targetId: target.id };
  }

  // Melee: attack in place if adjacent, else move+attack if reachable
  const approaches = getMeleeApproaches(state, unit);
  if (approaches.has(target.id)) {
    const dest = approaches.get(target.id);
    return meleeAction(target.id, dest ?? undefined);
  }

  // Out of reach: advance to the reachable cell nearest the target. This uses
  // the same reachability rules the player has, so flyers fly over rocks and
  // occupants (landing only on free ground) instead of trudging around them.
  const reachable = getReachableCells(state.grid, unit, state);
  if (reachable.length > 0) {
    const here = chebyshevDistance(unit.pos, target.pos);
    const best = reachable.reduce((a, b) =>
      chebyshevDistance(b, target.pos) < chebyshevDistance(a, target.pos) ? b : a
    );
    if (chebyshevDistance(best, target.pos) < here) return { type: 'move', to: best };
  }

  return { type: 'wait' };
}
