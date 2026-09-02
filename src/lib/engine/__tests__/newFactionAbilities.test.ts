import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { resolveDamagePacket } from '../combat';
import { setOccupant } from '../grid';
import { getDartingRetreatCells, getReachableCells } from '../selectors';
import { GOBLIN, RAM_RIDER } from '../barbarian';
import { DENDROID, GRAND_ELF, SPRITE, UNICORN } from '../ranger';
import { EFREET } from '../demon';
import type { BattleState, Hero, Pos } from '../types';

function hero(className: Hero['class']): Hero {
  return { class: className, level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] };
}

function relocate(state: BattleState, id: string, to: Pos): BattleState {
  const unit = state.units.find(candidate => candidate.id === id)!;
  const grid = setOccupant(setOccupant(state.grid, unit.pos, null), to, id);
  return { ...state, phase: 'combat', grid, units: state.units.map(candidate => candidate.id === id ? { ...candidate, pos: to } : candidate) };
}

function adjacentBattle(attackerDef: typeof GOBLIN, className: Hero['class'], rank = 1): { state: BattleState; attackerId: string; targetId: string } {
  let state = initBattle([{ unit: attackerDef, count: 5 }], [{ unit: GOBLIN, count: 100 }], hero(className), 3, [], undefined, { gauntletRound: rank });
  const attacker = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
  const target = state.units.find(unit => unit.side === 'enemy' && !unit.isHero)!;
  state = relocate(state, attacker.id, { col: 4, row: 4 });
  state = relocate(state, target.id, { col: 5, row: 4 });
  return { state: { ...state, currentUnitId: attacker.id }, attackerId: attacker.id, targetId: target.id };
}

describe('redesigned faction abilities', () => {
  it('pushes with Battering Ram without advancing the Ram Rider', () => {
    const { state, attackerId, targetId } = adjacentBattle(RAM_RIDER, 'barbarian');
    const charged = {
      ...state,
      units: state.units.map(unit => unit.id === attackerId
        ? { ...unit, lastMovedFrom: { col: 1, row: 4 }, lastMovedDistance: 3 }
        : unit),
    };

    const next = applyAction(charged, { type: 'attack', targetId });

    expect(next.units.find(unit => unit.id === attackerId)?.pos).toEqual({ col: 4, row: 4 });
    expect(next.units.find(unit => unit.id === targetId)?.pos).toEqual({ col: 6, row: 4 });
  });

  it('scales Burn from the stored actual Gauntlet Rank', () => {
    const { state, attackerId, targetId } = adjacentBattle(EFREET, 'demon', 4);
    const afterHit = applyAction(state, { type: 'attack', targetId });
    const burned = afterHit.units.find(unit => unit.id === targetId)!;
    expect(burned.burnDamage).toBe(12);
    expect(burned.burnRoundsLeft).toBe(2);

    const beforeHp = (burned.count - 1) * burned.definition.hp + burned.hp;
    const afterTick = applyAction({ ...afterHit, currentUnitId: targetId }, { type: 'wait' });
    const ticked = afterTick.units.find(unit => unit.id === targetId)!;
    const afterHp = (ticked.count - 1) * ticked.definition.hp + ticked.hp;
    expect(beforeHp - afterHp).toBe(12);
    expect(afterTick.units.find(unit => unit.id === attackerId)).toBeTruthy();
  });

  it('keeps Dendroid Bind until that source Dendroid moves', () => {
    const { state, attackerId, targetId } = adjacentBattle(DENDROID, 'ranger');
    const boundState = applyAction(state, { type: 'attack', targetId });
    const bound = boundState.units.find(unit => unit.id === targetId)!;
    expect(bound.effects?.some(effect => effect.kind === 'bind' && effect.sourceStackId === attackerId)).toBe(true);

    const rejected = applyAction({ ...boundState, currentUnitId: targetId }, { type: 'move', to: { col: 6, row: 4 } });
    expect(rejected.units.find(unit => unit.id === targetId)?.pos).toEqual(bound.pos);
    expect(rejected.actionSeq).toBe(boundState.actionSeq);

    const source = boundState.units.find(unit => unit.id === attackerId)!;
    const destination = getReachableCells(boundState.grid, source)[0];
    expect(destination).toBeTruthy();
    const sourceMoved = applyAction({ ...boundState, currentUnitId: attackerId }, { type: 'move', to: destination });
    expect(sourceMoved.units.find(unit => unit.id === targetId)?.effects?.some(effect => effect.kind === 'bind')).toBe(false);
  });

  it('gives the whole Ranger army Luck while a Unicorn lives', () => {
    const state = initBattle([{ unit: UNICORN, count: 1 }, { unit: GRAND_ELF, count: 1 }], [{ unit: GOBLIN, count: 1 }], hero('ranger'), 1);
    for (const unit of state.units.filter(candidate => candidate.side === 'player' && !candidate.isHero)) {
      expect(unit.luck).toBe(1);
    }
  });

  it('resists hostile magic damage but not physical damage', () => {
    const state = initBattle([{ unit: UNICORN, count: 1 }], [{ unit: GOBLIN, count: 20 }], hero('ranger'), 1);
    const unicorn = state.units.find(unit => unit.definition.name === 'Unicorn')!;
    const source = state.units.find(unit => unit.side === 'enemy' && !unit.isHero)!;
    const magic = resolveDamagePacket(state, {
      sourceId: source.id, targetId: unicorn.id, amount: 30, type: 'magic', attributes: ['fire'],
      delivery: 'primary', direct: true, ranged: false, canTriggerOnHit: false, canLifeDrain: false,
    }, () => 0);
    expect(magic.outcome.resisted).toBe(true);
    expect(magic.outcome.finalDamage).toBe(0);

    const physical = resolveDamagePacket(state, {
      sourceId: source.id, targetId: unicorn.id, amount: 30, type: 'physical', attributes: [],
      delivery: 'primary', direct: true, ranged: false, canTriggerOnHit: false, canLifeDrain: false,
    }, () => 0);
    expect(physical.outcome.finalDamage).toBe(30);
  });

  it('keeps Grand Elf double shot while adding per-arrow Focus Fire', () => {
    const state = initBattle([{ unit: GRAND_ELF, count: 5 }], [{ unit: GOBLIN, count: 200 }], hero('ranger'), 5);
    const elf = state.units.find(unit => unit.side === 'player' && !unit.isHero)!;
    const target = state.units.find(unit => unit.side === 'enemy' && !unit.isHero)!;
    const next = applyAction({ ...state, phase: 'combat', currentUnitId: elf.id }, { type: 'shoot', targetId: target.id });
    const shots = next.log.filter(event => event.type === 'shoot');
    expect(shots).toHaveLength(2);
    expect(Number(shots[1].data.damage)).toBeGreaterThan(Number(shots[0].data.damage));
  });

  it('lets Blinkwing Mantle spend unused movement on a chosen Darting Assault retreat', () => {
    let state = initBattle(
      [{ unit: SPRITE, count: 5 }],
      [{ unit: GOBLIN, count: 100 }],
      hero('ranger'),
      8,
      [],
      undefined,
      { artifacts: { player: ['blinkwing_mantle'] } },
    );
    const sprite = state.units.find(unit => unit.definition.name === 'Sprite')!;
    const target = state.units.find(unit => unit.side === 'enemy' && !unit.isHero)!;
    state = relocate(state, sprite.id, { col: 1, row: 4 });
    state = relocate(state, target.id, { col: 5, row: 4 });
    state = { ...state, currentUnitId: sprite.id };
    const movedSprite = state.units.find(unit => unit.id === sprite.id)!;
    const attackCell = { col: 4, row: 4 };
    const retreatTo = { col: 2, row: 2 };

    expect(getDartingRetreatCells(state, movedSprite, attackCell)).toContainEqual(retreatTo);
    const next = applyAction(state, { type: 'attack', targetId: target.id, moveTo: attackCell, retreatTo });

    expect(next.units.find(unit => unit.id === sprite.id)?.pos).toEqual(retreatTo);
    expect(next.grid.cells[retreatTo.row][retreatTo.col].occupantId).toBe(sprite.id);
    expect(next.log.some(event => event.type === 'retaliate')).toBe(false);
  });
});
