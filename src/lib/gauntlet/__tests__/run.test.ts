import { describe, it, expect } from 'vitest';
import {
  newRun,
  encounterBudget,
  actOf,
  generateGauntletEnemy,
  draftOptions,
  applyPick,
  applyItemPick,
  applySkillPick,
  recordBattle,
  survivorsFrom,
  mixSeed,
} from '../run';
import { itemDraftOptions } from '../items';
import { skillDraftOptions, canLearnSkill } from '../skills';
import { armyCost, UNIT_COSTS } from '../../engine/recruit';
import { FACTION_UNITS } from '../../engine/factions';
import type { UnitStack } from '../../engine/types';

describe('gauntlet run', () => {
  it('newRun starts a level-1 faction hero with a ~90-power T1/T2 army', () => {
    const run = newRun('barbarian', 42);

    expect(run.status).toBe('map');
    expect(run.encounterIndex).toBe(1);
    expect(run.hero.level).toBe(1);
    expect(run.hero.class).toBe('barbarian');
    for (const slot of run.army) expect(slot.unit.tier).toBeLessThanOrEqual(2);
    const power = armyCost(run.army);
    expect(power).toBeGreaterThanOrEqual(70);
    expect(power).toBeLessThanOrEqual(110);
  });

  it('encounter budgets follow the design curve with a boss premium on 3/7/10', () => {
    // The design table's exact numbers drift from its own formula by rounding;
    // hold the curve to within 2% of the published values.
    expect(encounterBudget(1)).toBe(90);
    expect(encounterBudget(2)).toBe(119);
    for (const [n, v] of [[3, 172], [7, 518], [10, 1195]] as const) {
      expect(Math.abs(encounterBudget(n) - v) / v).toBeLessThanOrEqual(0.02);
    }
  });

  it('acts split 1–3 / 4–7 / 8–10', () => {
    expect(actOf(1)).toBe(1);
    expect(actOf(3)).toBe(1);
    expect(actOf(4)).toBe(2);
    expect(actOf(7)).toBe(2);
    expect(actOf(8)).toBe(3);
  });

  it('mixSeed does not collide for seed/node pairs a linear seed*31+n*977 mix would collapse', () => {
    // The old formula seed*31 + n*977 maps (seed, n) and (seed+977, n-31) to
    // the same combined value, so nearby run seeds could draw identical
    // enemies at different nodes. A hash-based mix must not repeat this.
    const seedA = 1_753_000_000_000;
    const nA = 5;
    const seedB = seedA + 977;
    const nB = nA - 31; // deliberately out of the normal 1..10 range, but the
    // mixing function itself must still not collide for any integer inputs.

    expect(mixSeed(seedA, nA)).not.toBe(mixSeed(seedB, nB));
  });

  it('enemy armies are deterministic per seed and spend most of the budget', () => {
    const run = newRun('barbarian', 7);
    const a = generateGauntletEnemy(run);
    const b = generateGauntletEnemy(run);

    expect(a.army.map(s => `${s.unit.name}x${s.count}`)).toEqual(
      b.army.map(s => `${s.unit.name}x${s.count}`)
    );
    const cost = armyCost(a.army);
    expect(cost).toBeLessThanOrEqual(encounterBudget(1));
    expect(cost).toBeGreaterThanOrEqual(encounterBudget(1) * 0.6);
    expect(a.army.length).toBeGreaterThan(0);
  });

  it('draftOptions offers distinct own-faction unit cards, tier-gated by node', () => {
    const run = { ...newRun('knight', 5), encounterIndex: 2 }; // node 1-2: T1-T2
    const cards = draftOptions(run);

    const poolSize = FACTION_UNITS.knight.filter(u => u.tier <= 2).length;
    expect(cards).toHaveLength(Math.min(3, poolSize));
    const names = cards.map(c => c.unitName);
    expect(new Set(names).size).toBe(cards.length);
    for (const c of cards) {
      const unit = FACTION_UNITS.knight.find(u => u.name === c.unitName)!;
      expect(unit).toBeTruthy();
      expect(unit.tier).toBeLessThanOrEqual(2); // node 1-2: T1-T2
      expect(c.count).toBe(Math.max(1, Math.round(60 / UNIT_COSTS[c.unitName])));
    }
  });

  it('applyPick stacks duplicate unit types', () => {
    let run = newRun('barbarian', 3);
    const existing = run.army[0];
    run = { ...run, pendingDraft: [{ unitName: existing.unit.name, count: 10 }], status: 'draft' };

    const next = applyPick(run, run.pendingDraft![0]);

    expect(next.status).toBe('map');
    expect(next.pendingDraft).toBeNull();
    const stack = next.army.find(s => s.unit.name === existing.unit.name)!;
    expect(stack.count).toBe(existing.count + 10);
  });

  it('recordBattle: win levels the hero, keeps survivors, and queues a draft', () => {
    const run = newRun('barbarian', 9);
    const survivors = [{ unit: run.army[0].unit, count: 2 }];

    const next = recordBattle(run, true, survivors);

    expect(next.battlesWon).toBe(1);
    expect(next.hero.level).toBe(2);
    expect(next.encounterIndex).toBe(2);
    expect(next.army).toEqual(survivors); // losses persist
    expect(next.status).toBe('draft');
    const poolSize = FACTION_UNITS.barbarian.filter(u => u.tier <= 2).length; // node 2: T1-T2
    expect(next.pendingDraft).toHaveLength(Math.min(3, poolSize));
  });

  it('recordBattle: losing ends the run anywhere; winning never ends it', () => {
    expect(recordBattle(newRun('barbarian', 9), false, []).status).toBe('lost');
    const run = { ...newRun('barbarian', 9), encounterIndex: 10 };
    expect(recordBattle(run, true, run.army).status).not.toBe('won');
  });

  it('recordBattle past node 10 increments endlessDepth and keeps drafting', () => {
    const run = { ...newRun('barbarian', 9), encounterIndex: 10 };
    const next = recordBattle(run, true, run.army);

    expect(next.status).not.toBe('won');
    expect(next.status).toBe('draft');
    expect(next.encounterIndex).toBe(11);
    expect(next.endlessDepth).toBe(1);

    const next2 = recordBattle(next, true, next.army);
    expect(next2.endlessDepth).toBe(2);
    expect(next2.encounterIndex).toBe(12);
  });

  it('recordBattle offers items on every 3rd win, units-only otherwise', () => {
    let run = newRun('barbarian', 9);
    for (let i = 1; i <= 6; i++) {
      run = recordBattle(run, true, run.army);
      if (i % 3 === 0) {
        expect(run.pendingItems).toHaveLength(2);
      } else {
        expect(run.pendingItems).toBeNull();
      }
      run = applyPick(run, run.pendingDraft![0]);
    }
  });

  it('on an item draft the player takes one of EACH: unit first, then artifact', () => {
    let run = { ...newRun('barbarian', 9), battlesWon: 3 };
    run = { ...run, status: 'draft' as const, pendingDraft: draftOptions(run), pendingItems: itemDraftOptions(run) };

    const afterUnit = applyPick(run, run.pendingDraft![0]);
    expect(afterUnit.pendingDraft).toBeNull();
    expect(afterUnit.pendingItems).toEqual(run.pendingItems); // artifact still owed
    expect(afterUnit.status).toBe('draft');

    const afterBoth = applyItemPick(afterUnit, afterUnit.pendingItems![0]);
    expect(afterBoth.items).toEqual([run.pendingItems![0]]);
    expect(afterBoth.pendingItems).toBeNull();
    expect(afterBoth.status).toBe('map');
  });

  it('on an item draft the player takes one of EACH: artifact first, then unit', () => {
    let run = { ...newRun('barbarian', 9), battlesWon: 3 };
    run = { ...run, status: 'draft' as const, pendingDraft: draftOptions(run), pendingItems: itemDraftOptions(run) };

    const afterItem = applyItemPick(run, run.pendingItems![0]);
    expect(afterItem.items).toEqual([run.pendingItems![0]]);
    expect(afterItem.pendingDraft).toEqual(run.pendingDraft); // unit still owed
    expect(afterItem.status).toBe('draft');
    expect(afterItem.army).toEqual(run.army); // no unit taken yet

    const afterBoth = applyPick(afterItem, afterItem.pendingDraft![0]);
    expect(afterBoth.pendingDraft).toBeNull();
    expect(afterBoth.status).toBe('map');
  });

  it('a units-only draft (no item offer) still returns to the map on one pick', () => {
    let run = newRun('barbarian', 9);
    run = recordBattle(run, true, run.army); // 1st win: no items
    expect(run.pendingItems).toBeNull();

    const next = applyPick(run, run.pendingDraft![0]);
    expect(next.status).toBe('map');
    expect(next.pendingDraft).toBeNull();
  });

  it('survivorsFrom keeps living player stacks, drops the hero and the dead', () => {
    const run = newRun('barbarian', 4);
    const mk = (name: string, count: number, side: 'player' | 'enemy', isHero = false) =>
      ({
        definition: FACTION_UNITS.barbarian.find(u => u.name === name) ?? { name },
        count,
        side,
        isHero,
      }) as unknown as UnitStack;

    const units = [
      mk('Goblin', 7, 'player'),
      mk('Orc', 0, 'player'),
      mk('Hero', 1, 'player', true),
      mk('Imp', 5, 'enemy'),
    ];

    const survivors = survivorsFrom(units);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].unit.name).toBe('Goblin');
    expect(survivors[0].count).toBe(7);
  });

  it('survivorsFrom merges split same-unit stacks back into one slot and drops allies', () => {
    const mk = (name: string, count: number, side: 'player' | 'enemy', extra: Record<string, unknown> = {}) =>
      ({
        definition: FACTION_UNITS.barbarian.find(u => u.name === name) ?? { name },
        count,
        side,
        ...extra,
      }) as unknown as UnitStack;

    const units = [
      mk('Goblin', 4, 'player'),                       // a split half
      mk('Goblin', 6, 'player'),                       // the other half
      mk('Wolf Rider', 3, 'player', { isAlly: true }), // summoned ally — not kept
      mk('Wolf Rider', 2, 'player'),
    ];

    const survivors = survivorsFrom(units);
    const goblin = survivors.filter(s => s.unit.name === 'Goblin');
    expect(goblin).toHaveLength(1);
    expect(goblin[0].count).toBe(10); // 4 + 6 merged back
    expect(survivors.find(s => s.unit.name === 'Wolf Rider')!.count).toBe(2); // ally dropped
  });
});

describe('skill offers', () => {
  it('recordBattle offers skills on battles 2, 5, 8 — never colliding with items', () => {
    let run = newRun('barbarian', 9);
    for (let i = 1; i <= 8; i++) {
      run = recordBattle(run, true, run.army);
      if (i % 3 === 2) expect(run.pendingSkills).toHaveLength(3);
      else expect(run.pendingSkills).toBeNull();
      if (run.pendingSkills) expect(run.pendingItems).toBeNull(); // no double-offer battles
      run = applyPick(run, run.pendingDraft![0]);
      if (run.pendingSkills) {
        // Every offered skill has at least one unit that can still learn it.
        const skill = run.pendingSkills[0];
        const learner = run.army.find(s => canLearnSkill(s, run.unitSkills, skill))!;
        expect(learner).toBeTruthy();
        run = applySkillPick(run, skill, learner.unit.name);
      }
      if (run.pendingItems) run = applyItemPick(run, run.pendingItems[0]);
      expect(run.status).toBe('map');
    }
  });

  it('applySkillPick grants the skill and resolves like the item pick', () => {
    let run = { ...newRun('barbarian', 9), battlesWon: 2 };
    run = { ...run, status: 'draft' as const, pendingDraft: draftOptions(run), pendingSkills: skillDraftOptions(run) };
    const skill = run.pendingSkills![0];
    const unitName = run.army[0].unit.name;

    const afterSkill = applySkillPick(run, skill, unitName);
    expect(afterSkill.unitSkills[unitName]?.[skill]).toBe(1);
    expect(afterSkill.pendingSkills).toBeNull();
    expect(afterSkill.status).toBe('draft'); // unit card still owed

    const done = applyPick(afterSkill, afterSkill.pendingDraft![0]);
    expect(done.status).toBe('map');
  });
});
