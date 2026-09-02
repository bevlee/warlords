import { describe, it, expect } from 'vitest';
import { describeEvent, damageTier, readableEffect, type LogLine } from '../logLines';
import type { BattleEvent, Hero, UnitStack } from '$lib/engine/types';

const HERO: Hero = { class: 'barbarian', level: 3, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [] };

function stack(id: string, name: string, side: 'player' | 'enemy', overrides: Partial<UnitStack> = {}): UnitStack {
  return {
    id,
    definition: { name, tier: 1, speed: 5, initiative: 10, hp: 10, attack: 2, defense: 1, minDamage: 1, maxDamage: 2, shots: 0, range: 0, isLarge: false, abilities: [] },
    count: 5, startCount: 5, hp: 10, pos: { col: 0, row: 0 }, side,
    hasRetaliated: false, shotsLeft: 0, morale: 0, luck: 0, atb: 0, isDefending: false,
    ...overrides,
  };
}

function textOf(line: LogLine): string {
  return line.kind === 'event' ? line.segments.map(s => s.text).join('') : `Round ${line.round}`;
}

describe('damageTier', () => {
  it('tiers at >50, >100, >1000', () => {
    expect(damageTier(1)).toBe(0);
    expect(damageTier(50)).toBe(0);
    expect(damageTier(51)).toBe(1);
    expect(damageTier(100)).toBe(1);
    expect(damageTier(101)).toBe(2);
    expect(damageTier(1000)).toBe(2);
    expect(damageTier(1001)).toBe(3);
  });
});

describe('describeEvent', () => {
  const units = [
    stack('g1', 'Goblin', 'player'),
    stack('e1', 'Wolf', 'enemy'),
    stack('a1', 'Elf', 'player', { isAlly: true }),
    stack('h1', 'Hero', 'player', { isHero: true }),
  ];

  it('turns round_start into a round marker', () => {
    const line = describeEvent({ type: 'round_start', data: { round: 2 } }, units, HERO);
    expect(line).toEqual({ kind: 'round', round: 2 });
  });

  it('colors attacker and target, tiers the damage number, and appends a skull kill segment', () => {
    const line = describeEvent(
      { type: 'attack', data: { attackerId: 'g1', targetId: 'e1', damage: 120, killed: 2 } },
      units, HERO
    );
    expect(line.kind).toBe('event');
    if (line.kind !== 'event') return;
    expect(textOf(line)).toBe('Goblins strike wild Wolfs for 120 damage. -2 💀');
    expect(line.segments.find(s => s.text === 'Goblins')?.controller).toBe('player');
    expect(line.segments.find(s => s.text === 'wild Wolfs')?.controller).toBe('enemy');
    expect(line.segments.find(s => s.text === '120')?.damage).toBe(2);
    expect(line.segments.find(s => s.text === ' -2 💀')?.kills).toBe(true);
  });

  it('omits the kill segment when nothing died', () => {
    const line = describeEvent(
      { type: 'attack', data: { attackerId: 'g1', targetId: 'e1', damage: 3, killed: 0 } },
      units, HERO
    );
    expect(textOf(line)).toBe('Goblins strike wild Wolfs for 3 damage.');
  });

  it('labels enemy stacks as wild when there is no enemy hero', () => {
    const line = describeEvent({ type: 'defend', data: { unitId: 'e1' } }, units, HERO);
    expect(textOf(line)).toBe('Wild Wolfs brace for defense.');
  });

  it("labels enemy stacks possessively when an enemy hero name is given", () => {
    const line = describeEvent({ type: 'defend', data: { unitId: 'e1' } }, units, HERO, 'Karth');
    expect(textOf(line)).toBe("Karth's Wolfs brace for defense.");
  });

  it('labels allied stacks and tags them with the ally controller', () => {
    const line = describeEvent({ type: 'defend', data: { unitId: 'a1' } }, units, HERO);
    expect(textOf(line)).toBe('Allied Elfs brace for defense.');
    if (line.kind !== 'event') return;
    expect(line.segments[0].controller).toBe('ally');
  });

  it('uses the hero name when set, otherwise "your hero"', () => {
    const cast: BattleEvent = { type: 'cast', data: { spell: 'lightning', casterId: 'h1', targetId: 'e1', damage: 20, killed: 1 } };
    expect(textOf(describeEvent(cast, units, HERO))).toBe('Your hero casts Lightning at wild Wolfs for 20 damage. -1 💀');
    expect(textOf(describeEvent(cast, units, { ...HERO, name: 'Aria' }))).toBe('Aria casts Lightning at wild Wolfs for 20 damage. -1 💀');
  });

  it('capitalizes the first letter of a line', () => {
    const line = describeEvent({ type: 'death', data: { unitId: 'e1' } }, units, HERO);
    expect(textOf(line)).toBe('Wild Wolfs are wiped out!');
  });
});

// A status event with no case of its own used to print its internal id
// verbatim — "Wild Stone Golems are affected by follow_through." Nothing the
// engine logs may reach a player as a snake_case identifier.
describe('status effects never show a raw engine id', () => {
  const units = [
    stack('g1', 'Goblin', 'player'),
    stack('e1', 'Stone Golem', 'enemy'),
  ];
  const describe_ = (data: Record<string, unknown>) =>
    textOf(describeEvent({ type: 'status', data } as BattleEvent, units, HERO));

  it('names the ability that dealt the damage, target first', () => {
    expect(describe_({ effect: 'thunder_dive', unitId: 'e1', damage: 55, killed: 2 }))
      .toBe('Wild Stone Golems take 55 damage from Thunder Dive. -2 💀');
  });

  it('covers every effect that deals damage in passing', () => {
    for (const effect of ['overrun', 'shockwave', 'splash', 'collision', 'cinderburst', 'three_headed_strike']) {
      const text = describe_({ effect, unitId: 'e1', damage: 5 });
      expect(text, effect).toMatch(/^Wild Stone Golems take 5 damage from .+\.$/);
      expect(text, effect).not.toContain('_');
    }
  });

  it('makes the named ability hoverable, so the log explains itself', () => {
    const l = describeEvent(
      { type: 'status', data: { effect: 'thunder_dive', unitId: 'e1', damage: 55 } } as BattleEvent,
      units, HERO,
    );
    const keyword = l.kind === 'event' ? l.segments.find(seg => seg.keyword) : undefined;
    expect(keyword?.text).toBe('Thunder Dive');
    expect(keyword?.keyword).toEqual({ entryKind: 'ability', id: 'thunder_dive' });
  });

  it('links an artifact proc to the artifact, not to an ability', () => {
    const l = describeEvent(
      { type: 'status', data: { effect: 'funeral_drum', lost: 5 } } as BattleEvent, units, HERO,
    );
    const keyword = l.kind === 'event' ? l.segments.find(seg => seg.keyword) : undefined;
    expect(keyword?.keyword).toEqual({ entryKind: 'item', id: 'funeral_drum' });
  });

  it('names hero orders instead of their ids', () => {
    expect(describe_({ effect: 'hero_action', actionId: 'blood_for_blood', casterId: 'g1' }))
      .toBe('Goblins order Blood for Blood!.');
  });

  it('writes a sentence for artifact and ability procs', () => {
    expect(describe_({ effect: 'rebirth', unitId: 'e1', count: 3 }))
      .toBe('Wild Stone Golems claw their way back — 3 return.');
    expect(describe_({ effect: 'blood_tithe_ready', unitId: 'g1', count: 1 }))
      .toBe('Blood Tithe pays out — 1 Skeleton rises.');
  });

  it('falls back to a readable name for an effect nobody has worded yet', () => {
    expect(readableEffect('some_new_proc')).toBe('Some New Proc');
    expect(describe_({ effect: 'some_new_proc', unitId: 'e1' }))
      .toBe('Wild Stone Golems are affected by Some New Proc.');
  });

  it('leaves no underscore in any status line the engine can emit', () => {
    const emitted = [
      'animus_engine', 'blighted_soil', 'blood_offering', 'blood_tithe_ready', 'caustic_breath',
      'cinderburst', 'claim_blessing', 'cleanse', 'corpse_raise', 'feed_the_fire', 'focus',
      'funeral_drum', 'gate', 'haste_ritual', 'hero_action', 'overfeed', 'rebirth', 'repair',
      'ride_by_attack', 'shroud_of_preservation', 'splash', 'follow_through', 'overrun',
      'shockwave', 'collision', 'three_headed_strike', 'life_drain', 'slow', 'infect', 'curse',
      'blood_frenzy', 'absorbed', 'absorb', 'drain_morale', 'blind', 'burn_apply', 'burn',
      'bind', 'bind_block',
    ];
    for (const effect of emitted) {
      const text = describe_({
        effect, unitId: 'e1', sourceId: 'g1', casterId: 'g1', targetId: 'g1',
        actionId: 'charge', damage: 4, count: 2, heal: 3, penalty: 5, bonus: 2,
        lost: 5, sacrificed: 1, overheal: 6,
      });
      expect(text, `${effect} leaked an id: ${text}`).not.toMatch(/[a-z]_[a-z]/);
    }
  });
});
