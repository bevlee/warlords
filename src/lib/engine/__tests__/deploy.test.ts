import { describe, it, expect } from 'vitest';
import {
  GRID_H,
  MAX_FIELD_STACKS,
  autoDeploy,
  enemyAutoDeploy,
  generateObstacles,
  deployColumns,
  deploymentZone,
  validateDeployment,
  splitDraft,
  mergeDraft,
  type Deployment,
  type DraftEntry,
} from '../deploy';
import { initBattle } from '../battle';
import { updateFactionSkills } from '../factionSkills';
import { GOBLIN, ORC, WOLF_RIDER } from '../barbarian';
import type { ArmySlot, Hero } from '../types';

const HERO: Hero = updateFactionSkills({
  class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
});

// Level 5 knight: Tactics is level 2 → deployment zone reaches col 3.
const KNIGHT: Hero = updateFactionSkills({
  class: 'knight', level: 5, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
});

const ARMY: ArmySlot[] = [
  { unit: GOBLIN, count: 10 },
  { unit: ORC, count: 5 },
];

describe('generateObstacles', () => {
  it('is deterministic per seed and independent of army composition', () => {
    expect(generateObstacles(42)).toEqual(generateObstacles(42));
    expect(generateObstacles(42)).not.toEqual(generateObstacles(43));
  });

  it('keeps rocks out of both deployment zones', () => {
    for (const seed of [1, 42, 999, 123456]) {
      const rocks = generateObstacles(seed);
      expect(rocks.length).toBeGreaterThanOrEqual(5);
      for (const r of rocks) {
        expect(r.col).toBeGreaterThanOrEqual(5);
        expect(r.col).toBeLessThanOrEqual(8);
        expect(r.row).toBeGreaterThanOrEqual(0);
        expect(r.row).toBeLessThan(GRID_H);
      }
    }
  });

  it('splitting a stack does not move the rocks (independent stream)', () => {
    const oneStack = initBattle([{ unit: GOBLIN, count: 10 }], ARMY, HERO, 42);
    const twoStacks = initBattle(
      [{ unit: GOBLIN, count: 10 }],
      ARMY,
      HERO,
      42,
      [
        { unit: GOBLIN, count: 6, pos: { col: 1, row: 1 } },
        { unit: GOBLIN, count: 4, pos: { col: 1, row: 5 } },
      ]
    );
    const rocks = (s: typeof oneStack) =>
      s.grid.cells.flat().filter(c => c.blocked).map(c => `${c.col},${c.row}`);
    expect(rocks(oneStack)).toEqual(rocks(twoStacks));
  });
});

describe('deployment zone', () => {
  it('spans cols 0-1 by default and widens with Knight Tactics', () => {
    expect(deployColumns(HERO)).toEqual([0, 1]);
    expect(deployColumns(KNIGHT)).toEqual([0, 1, 2, 3]);
    expect(deploymentZone(HERO)).toHaveLength(2 * GRID_H);
  });
});

describe('validateDeployment', () => {
  const dep = (entries: Array<[number, number, number]>): Deployment[] =>
    entries.map(([count, col, row], i) => ({
      unit: i === 0 ? GOBLIN : ORC, count, pos: { col, row },
    }));

  it('accepts a legal split of the army', () => {
    const d: Deployment[] = [
      { unit: GOBLIN, count: 6, pos: { col: 0, row: 0 } },
      { unit: GOBLIN, count: 4, pos: { col: 1, row: 2 } },
      { unit: ORC, count: 5, pos: { col: 1, row: 4 } },
    ];
    expect(validateDeployment(ARMY, d, HERO)).toBeNull();
  });

  it('rejects out-of-zone, duplicate cells, and count mismatches', () => {
    expect(validateDeployment(ARMY, dep([[10, 5, 0]]), HERO)).toMatch(/outside/);
    const dup: Deployment[] = [
      { unit: GOBLIN, count: 10, pos: { col: 1, row: 1 } },
      { unit: ORC, count: 5, pos: { col: 1, row: 1 } },
    ];
    expect(validateDeployment(ARMY, dup, HERO)).toMatch(/two stacks/);
    const short: Deployment[] = [
      { unit: GOBLIN, count: 9, pos: { col: 1, row: 1 } },
      { unit: ORC, count: 5, pos: { col: 1, row: 3 } },
    ];
    expect(validateDeployment(ARMY, short, HERO)).toMatch(/mismatch/);
  });

  it('rejects more than MAX_FIELD_STACKS and conjured units', () => {
    const eight: Deployment[] = Array.from({ length: 8 }, (_, i) => ({
      unit: GOBLIN, count: 1, pos: { col: i % 2, row: Math.floor(i / 2) },
    }));
    expect(validateDeployment([{ unit: GOBLIN, count: 8 }], eight, HERO)).toMatch(/more than 7/);
    const conjured: Deployment[] = [
      { unit: GOBLIN, count: 10, pos: { col: 0, row: 0 } },
      { unit: ORC, count: 5, pos: { col: 0, row: 2 } },
      { unit: WOLF_RIDER, count: 1, pos: { col: 0, row: 4 } },
    ];
    expect(validateDeployment(ARMY, conjured, HERO)).toMatch(/never recruited/);
  });

  it('accepts the widened Tactics zone only for the knight', () => {
    const forward: Deployment[] = [{ unit: GOBLIN, count: 10, pos: { col: 3, row: 4 } }];
    const army = [{ unit: GOBLIN, count: 10 }];
    expect(validateDeployment(army, forward, KNIGHT)).toBeNull();
    expect(validateDeployment(army, forward, HERO)).toMatch(/outside/);
  });
});

describe('split and merge drafts', () => {
  const draft: DraftEntry[] = [
    { unit: GOBLIN, count: 10, pos: { col: 1, row: 1 } },
    { unit: ORC, count: 5, pos: { col: 1, row: 3 } },
  ];

  it('split conserves creatures and lands in the tray', () => {
    const next = splitDraft(draft, 0, 4)!;
    expect(next).toHaveLength(3);
    expect(next[0].count).toBe(6);
    expect(next[2]).toEqual({ unit: GOBLIN, count: 4, pos: null });
  });

  it('rejects illegal splits', () => {
    expect(splitDraft(draft, 0, 0)).toBeNull();
    expect(splitDraft(draft, 0, 10)).toBeNull(); // donor must keep one
    const full = Array.from({ length: MAX_FIELD_STACKS }, () => ({ ...draft[0] }));
    expect(splitDraft(full, 0, 1)).toBeNull();
  });

  it('merge combines same-name entries only', () => {
    const split = splitDraft(draft, 0, 4)!;
    const merged = mergeDraft(split, 2, 0)!;
    expect(merged).toHaveLength(2);
    expect(merged[0].count).toBe(10);
    expect(mergeDraft(draft, 0, 1)).toBeNull(); // goblin into orc
  });
});

describe('initBattle with a deployment', () => {
  it('places stacks on the chosen cells with per-stack faction bonuses', () => {
    const ranger: Hero = updateFactionSkills({
      class: 'ranger', level: 5, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
    }); // Logistics 1 at level 5
    const d: Deployment[] = [
      { unit: GOBLIN, count: 6, pos: { col: 0, row: 0 } },
      { unit: GOBLIN, count: 4, pos: { col: 1, row: 9 } },
    ];
    const state = initBattle([{ unit: GOBLIN, count: 10 }], ARMY, ranger, 7, d);
    const goblins = state.units.filter(u => u.side === 'player' && !u.isHero);
    expect(goblins).toHaveLength(2);
    expect(goblins.map(g => `${g.pos.col},${g.pos.row}`).sort()).toEqual(['0,0', '1,9']);
    for (const g of goblins) {
      expect(g.speedBonus).toBe(1); // each split stack gets Logistics
      expect(state.grid.cells[g.pos.row][g.pos.col].occupantId).toBe(g.id);
    }
  });

  it('throws on an invalid deployment', () => {
    expect(() =>
      initBattle([{ unit: GOBLIN, count: 10 }], ARMY, HERO, 7, [
        { unit: GOBLIN, count: 10, pos: { col: 7, row: 4 } },
      ])
    ).toThrow(/invalid deployment/);
  });

  it('matches enemyAutoDeploy/autoDeploy layouts when no deployment is given', () => {
    const state = initBattle(ARMY, ARMY, HERO, 7);
    const auto = autoDeploy(ARMY, HERO);
    const players = state.units.filter(u => u.side === 'player' && !u.isHero);
    expect(players.map(u => u.pos)).toEqual(auto.map(d => d.pos));
    const enemies = state.units.filter(u => u.side === 'enemy');
    expect(enemies.map(u => u.pos)).toEqual(enemyAutoDeploy(ARMY).map(d => d.pos));
  });
});
