import { describe, it, expect } from 'vitest';
import { applyHeal } from '../combat.ts';
import type { UnitDef, UnitStack } from '../types.ts';

// Minimal stack: fullHp = 55, started the battle at 3 creatures.
function fiend(count: number, hp: number): UnitStack {
  return {
    id: 'x', definition: { hp: 55 } as UnitDef,
    count, startCount: 3, hp,
    pos: { col: 0, row: 0 }, side: 'player', hasRetaliated: false,
    shotsLeft: 0, morale: 0, luck: 0, atb: 0, isDefending: false,
  };
}

describe('applyHeal', () => {
  it('tops up the lead creature without reviving', () => {
    // count 3, top at 20/55, heal 10 -> top 30, no revive
    const r = applyHeal(fiend(3, 20), 10);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(30);
    expect(r.revived).toBe(0);
    expect(r.healed).toBe(10);
  });

  it('caps healing at the lead creature max when already at startCount', () => {
    // full stack (3 x 55): nothing to heal
    const r = applyHeal(fiend(3, 55), 40);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(55);
    expect(r.revived).toBe(0);
    expect(r.healed).toBe(0);
  });

  it('revives fallen creatures with overflow, up to startCount', () => {
    // count 2, top 20/55 -> total 75; heal 40 -> total 115
    // 115 = 2*55 + 5 -> count 3, top hp 5, revived 1
    const r = applyHeal(fiend(2, 20), 40);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(5);
    expect(r.revived).toBe(1);
    expect(r.healed).toBe(40);
  });

  it('never exceeds startCount even with huge overheal', () => {
    // count 1, top 10/55 -> total 10; heal 9999 -> clamp to 3*55 = 165
    const r = applyHeal(fiend(1, 10), 9999);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(55);
    expect(r.revived).toBe(2);
    expect(r.healed).toBe(165 - 10); // actual HP restored, not the requested 9999
  });

  it('is a no-op for a dead stack', () => {
    const r = applyHeal(fiend(0, 0), 50);
    expect(r.stack.count).toBe(0);
    expect(r.revived).toBe(0);
    expect(r.healed).toBe(0);
  });
});
