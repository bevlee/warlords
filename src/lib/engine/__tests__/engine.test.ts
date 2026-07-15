import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../rng';
import { calculateDamage, applyDamage, canRetaliate, checkMorale } from '../combat';
import { createGrid, findPath, chebyshevDistance } from '../grid';
import { initBattle, applyAction, checkBattleEnd } from '../battle';
import { GOBLIN, WOLF_RIDER, ORC, BEHEMOTH } from '../barbarian';
import { CAVALIER, ARCHER } from '../knight';
import { GORGON, MAGE } from '../wizard';
import { updateFactionSkills } from '../factionSkills';
import type { UnitStack, Hero, ArmySlot } from '../types';

const mockHero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 5, defense: 3, statPoints: 0, factionSkills: [] };

function makeStack(overrides: Partial<UnitStack>): UnitStack {
  return {
    id: 'test-' + Math.random(),
    definition: GOBLIN,
    count: 10,
    hp: GOBLIN.hp,
    pos: { col: 0, row: 0 },
    side: 'player',
    hasRetaliated: false,
    shotsLeft: 0,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    ...overrides,
  };
}

const deterministicRng = mulberry32(42);

describe('calculateDamage', () => {
  it('attack > defense increases damage', () => {
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 20 }, count: 10 });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 5 }, side: 'enemy' });
    const rng = mulberry32(1);
    const dmg = calculateDamage(attacker, defender, 0, rng);
    expect(dmg).toBeGreaterThan(10); // base would be ~15, should be boosted
  });

  it('defense > attack reduces damage', () => {
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 2 }, count: 10 });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 20 }, side: 'enemy' });
    const rng = mulberry32(1);
    const dmg = calculateDamage(attacker, defender, 0, rng);
    const rng2 = mulberry32(1);
    const baseDmg = calculateDamage(makeStack({ count: 10 }), makeStack({ side: 'enemy' }), 0, rng2);
    expect(dmg).toBeLessThan(baseDmg);
  });

  it('hero attack bonus applies for player units', () => {
    const rng1 = mulberry32(5);
    const rng2 = mulberry32(5);
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 5 }, count: 10, side: 'player' });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 5 }, side: 'enemy' });
    const dmgWithHero = calculateDamage(attacker, defender, 10, rng1);
    const dmgNoHero = calculateDamage(attacker, defender, 0, rng2);
    expect(dmgWithHero).toBeGreaterThanOrEqual(dmgNoHero);
  });

  it('always returns at least 1', () => {
    const attacker = makeStack({ definition: { ...GOBLIN, attack: 1, minDamage: 1, maxDamage: 1 }, count: 1 });
    const defender = makeStack({ definition: { ...GOBLIN, defense: 100 }, side: 'enemy' });
    const rng = mulberry32(1);
    expect(calculateDamage(attacker, defender, 0, rng)).toBeGreaterThanOrEqual(1);
  });
});

describe('applyDamage', () => {
  it('kills creatures correctly', () => {
    const stack = makeStack({ count: 10, hp: GOBLIN.hp, definition: GOBLIN });
    // damage = 9 * 5 (kill 9 goblins, leaving 1 with 5hp)
    const { killed, remaining } = applyDamage(stack, 45);
    expect(killed).toBe(9);
    expect(remaining.count).toBe(1);
    expect(remaining.hp).toBe(5);
  });

  it('kills all creatures', () => {
    const stack = makeStack({ count: 5, hp: GOBLIN.hp, definition: GOBLIN });
    const { killed, remaining } = applyDamage(stack, 999);
    expect(killed).toBe(5);
    expect(remaining.count).toBe(0);
  });

  it('partial damage on top creature', () => {
    const stack = makeStack({ count: 3, hp: 3, definition: GOBLIN }); // top creature at 3hp
    const { killed, remaining } = applyDamage(stack, 2);
    expect(killed).toBe(0);
    expect(remaining.count).toBe(3);
    expect(remaining.hp).toBe(1);
  });
});

describe('canRetaliate', () => {
  it('returns true if not retaliated', () => {
    const stack = makeStack({ hasRetaliated: false });
    expect(canRetaliate(stack)).toBe(true);
  });

  it('returns false if already retaliated', () => {
    const stack = makeStack({ hasRetaliated: true });
    expect(canRetaliate(stack)).toBe(false);
  });

  it('returns false if count is 0', () => {
    const stack = makeStack({ count: 0 });
    expect(canRetaliate(stack)).toBe(false);
  });
});

describe('findPath', () => {
  it('finds a straight path', () => {
    const grid = createGrid(5, 5);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 3, row: 0 });
    expect(path.length).toBe(3);
    expect(path[2]).toEqual({ col: 3, row: 0, blocked: false, occupantId: null });
  });

  it('returns empty path for same cell', () => {
    const grid = createGrid(5, 5);
    expect(findPath(grid, { col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([]);
  });

  it('returns empty path for unreachable cell', () => {
    const grid = createGrid(3, 3);
    // wall off all paths to (2,1)
    grid.cells[0][1].blocked = true;
    grid.cells[1][0].blocked = true;
    grid.cells[2][1].blocked = true;
    grid.cells[1][2].blocked = true;
    const path = findPath(grid, { col: 0, row: 1 }, { col: 2, row: 1 });
    expect(path).toEqual([]);
  });
});

describe('checkBattleEnd', () => {
  it('returns player_wins when no enemies', () => {
    const state = initBattle(
      [{ unit: GOBLIN, count: 10 }],
      [{ unit: GOBLIN, count: 10 }],
      mockHero,
      42
    );
    const noEnemies = { ...state, units: state.units.map(u => u.side === 'enemy' ? { ...u, count: 0 } : u) };
    expect(checkBattleEnd(noEnemies)).toBe('player_wins');
  });

  it('returns enemy_wins when no player units', () => {
    const state = initBattle(
      [{ unit: GOBLIN, count: 10 }],
      [{ unit: GOBLIN, count: 10 }],
      mockHero,
      42
    );
    const noPlayer = { ...state, units: state.units.map(u => u.side === 'player' ? { ...u, count: 0 } : u) };
    expect(checkBattleEnd(noPlayer)).toBe('enemy_wins');
  });

  it('returns null when both sides alive', () => {
    const state = initBattle(
      [{ unit: GOBLIN, count: 10 }],
      [{ unit: GOBLIN, count: 10 }],
      mockHero,
      42
    );
    expect(checkBattleEnd(state)).toBeNull();
  });
});

describe('initBattle obstacles', () => {
  it('scatters impassable rocks in the middle columns, deterministic per seed, never under units', () => {
    const armies: [ArmySlot[], ArmySlot[]] = [
      [{ unit: GOBLIN, count: 10 }, { unit: ORC, count: 5 }],
      [{ unit: WOLF_RIDER, count: 8 }],
    ];
    const a = initBattle(armies[0], armies[1], mockHero, 42);
    const b = initBattle(armies[0], armies[1], mockHero, 42);

    const blocked = (s: typeof a) =>
      s.grid.cells.flat().filter(c => c.blocked).map(c => `${c.col},${c.row}`);

    expect(blocked(a).length).toBeGreaterThanOrEqual(5); // a real battlefield, not one pebble
    expect(blocked(a)).toEqual(blocked(b)); // deterministic per seed

    for (const c of a.grid.cells.flat()) {
      if (c.blocked) {
        expect(c.col).toBeGreaterThanOrEqual(3);
        expect(c.col).toBeLessThanOrEqual(8);
        expect(c.occupantId).toBeNull(); // never under a unit
      }
    }
  });
});

describe('luck events', () => {
  it('emits the luck entry immediately before the hit it explains', () => {
    // Nature's Luck-style: every stack has luck, so a run of attacks will fire
    // some rolls. The ordering is the contract — the UI plays entries as beats,
    // so a luck entry after its attack would flash the cause after the effect.
    const hero: Hero = { class: 'ranger', level: 1, xp: 0, attack: 5, defense: 3, statPoints: 0, factionSkills: [] };
    let state = initBattle([{ unit: WOLF_RIDER, count: 20 }], [{ unit: GOBLIN, count: 50 }], hero, 7);
    state = { ...state, units: state.units.map(u => ({ ...u, luck: 3 })) };

    let iterations = 0;
    while (state.result === 'ongoing' && iterations < 400) {
      const unitId = state.currentUnitId;
      if (!unitId) break;
      const unit = state.units.find(u => u.id === unitId)!;
      const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0);
      if (enemies.length === 0) break;
      state = applyAction(state, { type: 'attack', targetId: enemies[0].id });
      iterations++;
    }

    const luckIdxs = state.log.flatMap((e, i) => (e.type === 'luck' ? [i] : []));
    expect(luckIdxs.length).toBeGreaterThan(0); // luck 3 over a whole battle must fire

    for (const i of luckIdxs) {
      const next = state.log[i + 1];
      expect(next, 'a luck entry must be followed by the hit it explains').toBeDefined();
      expect(['attack', 'retaliate', 'shoot']).toContain(next.type);
      // and it must describe the same striker
      expect((next.data as { attackerId: string }).attackerId)
        .toBe((state.log[i].data as { unitId: string }).unitId);
    }
  });
});

describe('full battle simulation', () => {
  it('eventually ends with a winner', () => {
    const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 10, defense: 5, statPoints: 0, factionSkills: [] };
    let state = initBattle(
      [{ unit: WOLF_RIDER, count: 20 }, { unit: ORC, count: 10 }],
      [{ unit: GOBLIN, count: 50 }],
      hero,
      99
    );

    let iterations = 0;
    while (state.result === 'ongoing' && iterations < 2000) {
      const unitId = state.currentUnitId;
      if (!unitId) break;
      const unit = state.units.find(u => u.id === unitId)!;
      // Simple: always attack the first enemy
      const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0);
      if (enemies.length === 0) break;
      const action = unit.shotsLeft > 0
        ? { type: 'shoot' as const, targetId: enemies[0].id }
        : { type: 'attack' as const, targetId: enemies[0].id };
      state = applyAction(state, action);
      iterations++;
    }

    expect(['player_wins', 'enemy_wins']).toContain(state.result);
  });

  it('eventually ends with a winner when Knight and Wizard units are involved', () => {
    const hero: Hero = updateFactionSkills({
      class: 'knight', level: 1, xp: 0, attack: 10, defense: 5, statPoints: 0, factionSkills: [],
    });
    let state = initBattle(
      [{ unit: CAVALIER, count: 15 }, { unit: ARCHER, count: 10 }],
      [{ unit: GORGON, count: 8 }, { unit: MAGE, count: 10 }],
      hero,
      123
    );

    let iterations = 0;
    while (state.result === 'ongoing' && iterations < 2000) {
      const unitId = state.currentUnitId;
      if (!unitId) break;
      const unit = state.units.find(u => u.id === unitId)!;
      const enemies = state.units.filter(u => u.side !== unit.side && u.count > 0);
      if (enemies.length === 0) break;
      const action = unit.shotsLeft > 0
        ? { type: 'shoot' as const, targetId: enemies[0].id }
        : { type: 'attack' as const, targetId: enemies[0].id };
      state = applyAction(state, action);
      iterations++;
    }

    expect(['player_wins', 'enemy_wins']).toContain(state.result);
  });
});
