import { describe, it, expect } from 'vitest';
import { initBattle } from '../battle';
import { aiTakeTurn } from '../ai';
import { FACTION_UNITS } from '../factions';
import { updateFactionSkills } from '../factionSkills';
import type { ArmySlot, Hero } from '../types';

const hero: Hero = updateFactionSkills({
  class: 'knight',
  level: 1,
  xp: 0,
  attack: 1,
  defense: 1,
  statPoints: 0,
  factionSkills: [],
});

const slot = (faction: keyof typeof FACTION_UNITS, tier: number, count: number): ArmySlot => ({
  unit: FACTION_UNITS[faction].find((u) => u.tier === tier)!,
  count,
});

describe('ally stacks in battle', () => {
  it('fields allies on the player side, flagged and behind the player line', () => {
    const state = initBattle(
      [slot('knight', 1, 10)],
      [slot('demon', 1, 10)],
      hero,
      7,
      [slot('ranger', 2, 5), slot('ranger', 3, 3)]
    );
    const allies = state.units.filter((u) => u.isAlly);
    expect(allies).toHaveLength(2);
    for (const a of allies) {
      expect(a.side).toBe('player');
      expect(a.pos.col).toBe(0);
      expect(a.isHero).toBeFalsy();
    }
  });

  it('no allies by default (existing callers unaffected)', () => {
    const state = initBattle([slot('knight', 1, 10)], [slot('demon', 1, 10)], hero, 7);
    expect(state.units.some((u) => u.isAlly)).toBe(false);
  });

  it('aiTakeTurn produces an aggressive action for an ally stack', () => {
    const state = initBattle([slot('knight', 1, 10)], [slot('demon', 1, 10)], hero, 7, [
      slot('ranger', 2, 5),
    ]);
    const ally = state.units.find((u) => u.isAlly)!;
    const action = aiTakeTurn(state, ally.id);
    expect(['move', 'attack', 'shoot']).toContain(action.type);
  });
});
