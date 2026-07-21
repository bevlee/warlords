import { describe, it, expect } from 'vitest';
import { applyAction, beginCombat, deployMove, initBattle } from '../battle';
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

  it('stamps co-op controllers and gives each player their own hero and mana', () => {
    const guestHero = updateFactionSkills({
      class: 'wizard', level: 2, xp: 0, attack: 5, defense: 2, statPoints: 0, factionSkills: [],
    });
    let state = initBattle(
      [slot('knight', 1, 10)],
      [slot('demon', 1, 10)],
      hero,
      11,
      [slot('wizard', 1, 7)],
      undefined,
      { controllers: { player: 'host', ally: 'guest', enemy: 'ai' }, allyHero: guestHero }
    );
    expect(state.units.filter(u => !u.isHero).map(u => u.controllerId)).toEqual(['host', 'guest', 'ai']);
    expect(state.units.filter(u => u.isHero).map(u => u.controllerId)).toEqual(['host', 'guest']);
    expect(state.heroes?.guest.class).toBe('wizard');

    const guestStack = state.units.find(u => u.controllerId === 'guest' && !u.isHero)!;
    expect(deployMove(state, guestStack.id, { col: 2, row: 8 }, 'host')).toBe(state);
    state = deployMove(state, guestStack.id, { col: 2, row: 8 }, 'guest');
    expect(state.units.find(u => u.id === guestStack.id)?.pos).toEqual({ col: 2, row: 8 });

    state = beginCombat(state);
    const guestHeroStack = state.units.find(u => u.controllerId === 'guest' && u.isHero)!;
    const enemy = state.units.find(u => u.controllerId === 'ai' && !u.isHero)!;
    state = { ...state, currentUnitId: guestHeroStack.id };
    const hostMana = state.heroes!.host.mana;
    const guestMana = state.heroes!.guest.mana!;
    state = applyAction(state, { type: 'cast', spell: 'lightning', targetId: enemy.id });
    expect(state.heroes!.guest.mana).toBe(guestMana - 3);
    expect(state.heroes!.host.mana).toBe(hostMana);
  });
});
