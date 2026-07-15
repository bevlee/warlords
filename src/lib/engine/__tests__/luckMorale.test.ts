import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { stepsFromLogEntry } from '../../ui/animSteps';
import { WOLF_RIDER, GOBLIN } from '../barbarian';
import type { Hero, BattleState } from '../types';

const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 5, defense: 3, statPoints: 0, factionSkills: [] };

function runBattle(seed: number, morale: number, luck: number): BattleState {
  let state = initBattle([{ unit: WOLF_RIDER, count: 20 }], [{ unit: GOBLIN, count: 60 }], hero, seed);
  state = { ...state, units: state.units.map(u => ({ ...u, morale, luck })) };
  let i = 0;
  while (state.result === 'ongoing' && i < 300) {
    const id = state.currentUnitId;
    if (!id) break;
    const unit = state.units.find(u => u.id === id)!;
    const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0);
    if (!enemies.length) break;
    state = applyAction(state, { type: 'attack', targetId: enemies[0].id });
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
    expect(all).toContain('🍀');
    expect(all).toContain('🎺');
  });

  it('negative stats produce 💢 and ❄️ somewhere in 40 battles', () => {
    const all: string[] = [];
    for (let seed = 1; seed <= 40; seed++) all.push(...iconsOf(runBattle(seed, -3, -3)));
    const counts = all.reduce<Record<string, number>>((a, i) => ({ ...a, [i]: (a[i] ?? 0) + 1 }), {});
    console.log('NEGATIVE icons over 40 battles:', JSON.stringify(counts));
    expect(all).toContain('💢');
    expect(all).toContain('❄️');
  });

  it('zero stats produce neither', () => {
    const all: string[] = [];
    for (let seed = 1; seed <= 20; seed++) all.push(...iconsOf(runBattle(seed, 0, 0)));
    const luckOrMorale = all.filter(i => ['🍀', '💢', '🎺', '❄️'].includes(i));
    console.log('ZERO-stat luck/morale icons (expect none):', luckOrMorale.length);
    expect(luckOrMorale).toEqual([]);
  });
});
