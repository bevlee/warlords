import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { aiTakeTurn } from '../ai';
import { setOccupant } from '../grid';
import { stepsFromLogEntry } from '../../ui/animSteps';
import { statusIconFor } from '../../ui/statusIcons';
import { WOLF_RIDER, GOBLIN, OGRE } from '../barbarian';
import type { Hero, BattleState } from '../types';

const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 5, defense: 3, statPoints: 0, factionSkills: [] };
const GOOD_LUCK_ICON = statusIconFor('good_luck');
const BAD_LUCK_ICON = statusIconFor('bad_luck');
const MORALE_BOOST_ICON = statusIconFor('morale_boost');
const MORALE_FREEZE_ICON = statusIconFor('morale_freeze');

function runBattle(seed: number, morale: number, luck: number): BattleState {
  let state = initBattle([{ unit: WOLF_RIDER, count: 20 }], [{ unit: GOBLIN, count: 60 }], hero, seed);
  state = { ...state, units: state.units.map(u => ({ ...u, morale, luck })) };
  let i = 0;
  while (state.result === 'ongoing' && i < 300) {
    const id = state.currentUnitId;
    if (!id) break;
    state = applyAction(state, aiTakeTurn(state, id));
    i++;
  }
  return state;
}

function iconsOf(state: BattleState): string[] {
  return state.log.flatMap(e => stepsFromLogEntry(e))
    .filter(s => s.kind === 'status')
    .map(s => (s as unknown as { icon: string }).icon);
}

describe('luck + morale reach the fx layer across many battles', () => {
  it('positive stats produce 🍀 and 🎺 somewhere in 40 battles', () => {
    const all: string[] = [];
    for (let seed = 1; seed <= 40; seed++) all.push(...iconsOf(runBattle(seed, 3, 3)));
    const counts = all.reduce<Record<string, number>>((a, i) => ({ ...a, [i]: (a[i] ?? 0) + 1 }), {});
    console.log('POSITIVE icons over 40 battles:', JSON.stringify(counts));
    expect(all).toContain(GOOD_LUCK_ICON);
    expect(all).toContain(MORALE_BOOST_ICON);
  });

  it('negative stats produce 💢 and ❄️ somewhere in 40 battles', () => {
    const all: string[] = [];
    for (let seed = 1; seed <= 40; seed++) all.push(...iconsOf(runBattle(seed, -3, -3)));
    const counts = all.reduce<Record<string, number>>((a, i) => ({ ...a, [i]: (a[i] ?? 0) + 1 }), {});
    console.log('NEGATIVE icons over 40 battles:', JSON.stringify(counts));
    expect(all).toContain(BAD_LUCK_ICON);
    expect(all).toContain(MORALE_FREEZE_ICON);
  });

  it('zero stats produce neither', () => {
    const all: string[] = [];
    for (let seed = 1; seed <= 20; seed++) all.push(...iconsOf(runBattle(seed, 0, 0)));
    const luckOrMorale = all.filter(i =>
      [GOOD_LUCK_ICON, BAD_LUCK_ICON, MORALE_BOOST_ICON, MORALE_FREEZE_ICON].includes(i)
    );
    console.log('ZERO-stat luck/morale icons (expect none):', luckOrMorale.length);
    expect(luckOrMorale).toEqual([]);
  });

  it('does not grant morale when retaliation kills the acting stack', () => {
    // Seed 7 makes the first morale roll succeed at morale +3.
    let state = initBattle(
      [{ unit: GOBLIN, count: 1 }, { unit: GOBLIN, count: 5 }],
      [{ unit: OGRE, count: 10 }],
      hero,
      7,
    );
    const attacker = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const defender = state.units.find(u => u.side === 'enemy')!;
    state = {
      ...state,
      currentUnitId: attacker.id,
      log: [],
      grid: setOccupant(setOccupant(state.grid, attacker.pos, null), { col: defender.pos.col - 1, row: defender.pos.row }, attacker.id),
      units: state.units.map(u => (u.id === attacker.id ? { ...u, pos: { col: defender.pos.col - 1, row: defender.pos.row }, hp: 1, morale: 3 } : u)),
      phase: 'combat',
    };

    const next = applyAction(state, {
      type: 'attack',
      targetId: defender.id,
    });

    expect(next.units.find(u => u.id === attacker.id)?.count).toBe(0);
    expect(next.log).toContainEqual(expect.objectContaining({
      type: 'retaliate',
      data: expect.objectContaining({ targetId: attacker.id }),
    }));
    expect(next.log).not.toContainEqual(expect.objectContaining({
      type: 'morale_boost',
      data: expect.objectContaining({ unitId: attacker.id }),
    }));
    expect(next.result).toBe('ongoing');
    expect(next.currentUnitId).not.toBe(attacker.id);
  });
});
