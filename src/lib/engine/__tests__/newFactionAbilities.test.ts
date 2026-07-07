import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { calculateDamage } from '../combat';
import { effectiveSpeed } from '../selectors';
import { setOccupant } from '../grid';
import { updateFactionSkills } from '../factionSkills';
import { GOBLIN } from '../barbarian';
import { ZOMBIE, GHOST, VAMPIRE, BLACK_KNIGHT, LICH } from '../necromancer';
import { DENDROID, UNICORN, GRAND_ELF } from '../ranger';
import { EFREET, IMP } from '../demon';
import type { BattleState, Hero, UnitStack } from '../types';

function baseHero(overrides: Partial<Hero> = {}): Hero {
  return updateFactionSkills({
    class: 'necromancer', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [],
    ...overrides,
  });
}

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

function sequenceRng(values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('Ghost drain_morale', () => {
  it('reduces the target stack morale by 1 on hit', () => {
    const hero = baseHero();
    const state = initBattle([{ unit: GHOST, count: 5 }], [{ unit: GOBLIN, count: 100 }], hero, 1);
    const ghost = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const next = applyAction({ ...state, currentUnitId: ghost.id }, { type: 'attack', targetId: goblin.id });
    expect(next.units.find(u => u.id === goblin.id)!.morale).toBe(-1);
  });

  it('caps morale at -3', () => {
    const hero = baseHero();
    let state = initBattle([{ unit: GHOST, count: 5 }], [{ unit: GOBLIN, count: 100 }], hero, 1);
    state = { ...state, units: state.units.map(u => (u.side === 'enemy' ? { ...u, morale: -3 } : u)) };
    const ghost = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const next = applyAction({ ...state, currentUnitId: ghost.id }, { type: 'attack', targetId: goblin.id });
    expect(next.units.find(u => u.id === goblin.id)!.morale).toBe(-3);
  });
});

describe('Vampire life_drain', () => {
  it("heals the striker's top creature by damage/count, capped at full HP", () => {
    const hero = baseHero();
    let state = initBattle([{ unit: VAMPIRE, count: 4 }], [{ unit: GOBLIN, count: 100 }], hero, 2);
    state = { ...state, units: state.units.map(u => (u.definition.name === 'Vampire' ? { ...u, hp: 5 } : u)) };
    const vampire = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const next = applyAction({ ...state, currentUnitId: vampire.id }, { type: 'attack', targetId: goblin.id });
    const updated = next.units.find(u => u.id === vampire.id)!;
    expect(updated.hp).toBeGreaterThan(5);
    expect(updated.hp).toBeLessThanOrEqual(VAMPIRE.hp);
  });
});

describe('Efreet burn', () => {
  it("sets burn on melee hit, and it ticks down on the victim's own turn", () => {
    const hero = baseHero({ class: 'demon' });
    const state = initBattle([{ unit: EFREET, count: 1 }], [{ unit: GOBLIN, count: 100 }], hero, 3);
    const efreet = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const afterHit = applyAction({ ...state, currentUnitId: efreet.id }, { type: 'attack', targetId: goblin.id });
    const burned = afterHit.units.find(u => u.id === goblin.id)!;
    expect(burned.burnDamage).toBe(3);
    expect(burned.burnRoundsLeft).toBe(2);

    const beforeTotalHp = (burned.count - 1) * GOBLIN.hp + burned.hp;
    const afterTick = applyAction({ ...afterHit, currentUnitId: goblin.id }, { type: 'wait' });
    const ticked = afterTick.units.find(u => u.id === goblin.id)!;
    expect(ticked.burnRoundsLeft).toBe(1);
    const afterTotalHp = (ticked.count - 1) * GOBLIN.hp + ticked.hp;
    expect(beforeTotalHp - afterTotalHp).toBe(3);
  });
});

describe('Dendroid bind', () => {
  it("blocks the bound unit's move exactly once, then clears", () => {
    const hero = baseHero({ class: 'ranger' });
    const state = initBattle([{ unit: DENDROID, count: 1 }], [{ unit: GOBLIN, count: 100 }], hero, 4);
    const dendroid = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const afterHit = applyAction({ ...state, currentUnitId: dendroid.id }, { type: 'attack', targetId: goblin.id });
    const bound = afterHit.units.find(u => u.id === goblin.id)!;
    expect(bound.boundUntilRound).toBeDefined();

    const originalPos = bound.pos;
    const moveTarget = { col: originalPos.col + 1, row: originalPos.row };
    const blockedMove = applyAction({ ...afterHit, currentUnitId: goblin.id }, { type: 'move', to: moveTarget });
    const afterBlocked = blockedMove.units.find(u => u.id === goblin.id)!;
    expect(afterBlocked.pos).toEqual(originalPos);
    expect(afterBlocked.boundUntilRound).toBeUndefined();

    const secondMove = applyAction({ ...blockedMove, currentUnitId: goblin.id }, { type: 'move', to: moveTarget });
    expect(secondMove.units.find(u => u.id === goblin.id)!.pos).toEqual(moveTarget);
  });
});

describe('Zombie slow_on_hit', () => {
  it("has a chance to reduce the target's speed for the rest of the round", () => {
    const hero = baseHero();
    let proced = false;
    for (let seed = 1; seed <= 50 && !proced; seed++) {
      const state = initBattle([{ unit: ZOMBIE, count: 3 }], [{ unit: GOBLIN, count: 100 }], hero, seed);
      const zombie = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: zombie.id }, { type: 'attack', targetId: goblin.id });
      const updated = next.units.find(u => u.id === goblin.id)!;
      if (updated.speedPenalty === 1) {
        proced = true;
        expect(effectiveSpeed(updated)).toBe(GOBLIN.speed - 1);
      }
    }
    expect(proced).toBe(true);
  });

  it('clears once a new round begins', () => {
    const hero = baseHero();
    let found: { state: BattleState; goblinId: string } | null = null;
    for (let seed = 1; seed <= 50 && !found; seed++) {
      const state = initBattle([{ unit: ZOMBIE, count: 3 }], [{ unit: GOBLIN, count: 100 }], hero, seed);
      const zombie = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: zombie.id }, { type: 'attack', targetId: goblin.id });
      const updated = next.units.find(u => u.id === goblin.id)!;
      if (updated.speedPenalty === 1) found = { state: next, goblinId: goblin.id };
    }
    expect(found).not.toBeNull();

    let { state } = found!;
    const startRound = state.round;
    let iterations = 0;
    while (state.round === startRound && iterations < 100) {
      state = applyAction(state, { type: 'wait' });
      iterations++;
    }
    expect(state.round).toBeGreaterThan(startRound);
    expect(state.units.find(u => u.id === found!.goblinId)!.speedPenalty).toBeUndefined();
  });
});

describe('Unicorn blind_on_hit', () => {
  it('can blind the target, causing it to skip its next turn', () => {
    const hero = baseHero({ class: 'ranger' });
    let procState: BattleState | null = null;
    let blindedId = '';
    for (let seed = 1; seed <= 80 && !procState; seed++) {
      const state = initBattle([{ unit: UNICORN, count: 3 }], [{ unit: GOBLIN, count: 100 }], hero, seed);
      const unicorn = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: unicorn.id }, { type: 'attack', targetId: goblin.id });
      const updated = next.units.find(u => u.id === goblin.id)!;
      if (updated.blindedUntilRound !== undefined) {
        procState = next;
        blindedId = goblin.id;
      }
    }
    expect(procState).not.toBeNull();

    const skip = applyAction({ ...procState!, currentUnitId: blindedId }, { type: 'wait' });
    expect(skip.currentUnitId).not.toBe(blindedId);
    const blindEvent = skip.log.find(
      e => e.type === 'status' && e.data.effect === 'blind' && e.data.unitId === blindedId
    );
    expect(blindEvent).toBeDefined();
    expect(skip.units.find(u => u.id === blindedId)!.blindedUntilRound).toBeUndefined();
  });
});

describe('Black Knight death_blow', () => {
  it('doubles damage on proc', () => {
    const attacker = makeStack({ definition: BLACK_KNIGHT, count: 1 });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', count: 100 });
    const damage = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.1]));
    const withoutProc = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.5]));
    expect(damage).toBe(withoutProc * 2);
  });

  it('does not apply to units without death_blow', () => {
    const attacker = makeStack({ definition: GOBLIN, count: 1 });
    const defender = makeStack({ definition: GOBLIN, side: 'enemy', count: 100 });
    const damage = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.01]));
    const base = calculateDamage(attacker, defender, 0, sequenceRng([0, 0.5]));
    expect(damage).toBe(base);
  });
});

describe('Grand Elf double_shot', () => {
  it('fires twice and consumes 2 shots', () => {
    const hero = baseHero({ class: 'ranger' });
    const state = initBattle([{ unit: GRAND_ELF, count: 5 }], [{ unit: GOBLIN, count: 200 }], hero, 5);
    const elf = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const next = applyAction({ ...state, currentUnitId: elf.id }, { type: 'shoot', targetId: goblin.id });
    expect(next.log.filter(e => e.type === 'shoot').length).toBe(2);
    expect(next.units.find(u => u.id === elf.id)!.shotsLeft).toBe(GRAND_ELF.shots - 2);
  });
});

describe('Lich area_shot', () => {
  it('splashes 50% damage to enemy stacks adjacent to the target', () => {
    const hero = baseHero();
    let state = initBattle(
      [{ unit: LICH, count: 3 }],
      [{ unit: GOBLIN, count: 50 }, { unit: GOBLIN, count: 50 }],
      hero,
      6
    );
    const lich = state.units.find(u => u.side === 'player' && !u.isHero)!;
    const enemies = state.units.filter(u => u.side === 'enemy');
    const [primary, splashTarget] = enemies;
    const adjacentPos = { col: primary.pos.col, row: primary.pos.row + 1 };
    state = {
      ...state,
      units: state.units.map(u => (u.id === splashTarget.id ? { ...u, pos: adjacentPos } : u)),
      grid: setOccupant(setOccupant(state.grid, splashTarget.pos, null), adjacentPos, splashTarget.id),
    };

    const next = applyAction({ ...state, currentUnitId: lich.id }, { type: 'shoot', targetId: primary.id });
    const splashEvent = next.log.find(e => e.type === 'shoot' && e.data.splash === true);
    expect(splashEvent).toBeDefined();
    const splashed = next.units.find(u => u.id === splashTarget.id)!;
    expect(splashed.count < splashTarget.count || splashed.hp < splashTarget.hp).toBe(true);
  });
});

describe('Demon Gating', () => {
  it('never revives a fallen Demon unit without the skill unlocked', () => {
    const hero = baseHero({ class: 'demon', level: 1 }); // gating unlocks at level 5
    for (let seed = 1; seed <= 15; seed++) {
      const state = initBattle([{ unit: IMP, count: 1 }], [{ unit: GOBLIN, count: 100 }], hero, seed);
      const imp = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: goblin.id }, { type: 'attack', targetId: imp.id });
      expect(next.units.find(u => u.id === imp.id)!.count).toBe(0);
    }
  });

  it('has a chance to revive a fallen Demon unit once unlocked', () => {
    const hero = baseHero({ class: 'demon', level: 15 }); // gating level 3 => 60% chance
    let revived = false;
    for (let seed = 1; seed <= 40 && !revived; seed++) {
      const state = initBattle([{ unit: IMP, count: 1 }], [{ unit: GOBLIN, count: 100 }], hero, seed);
      const imp = state.units.find(u => u.side === 'player' && !u.isHero)!;
      const goblin = state.units.find(u => u.side === 'enemy')!;
      const next = applyAction({ ...state, currentUnitId: goblin.id }, { type: 'attack', targetId: imp.id });
      if (next.units.find(u => u.id === imp.id)!.count === 1) revived = true;
    }
    expect(revived).toBe(true);
  });
});
