import { describe, expect, it } from 'vitest';
import { applyAction, initBattle } from '../battle';
import { applyStrike, damageStack, resolveDamagePacket } from '../combat';
import { setOccupant } from '../grid';
import { BLACK_KNIGHT, BLOOD_ACOLYTE, LICH, SKELETON, VAMPIRE } from '../necromancer';
import { addItem } from '../../gauntlet/items';
import { applyItemPick, migrateRunState, newRun } from '../../gauntlet/run';
import { applyUnitSkills } from '../../gauntlet/skills';
import type { BattleState, Hero, UnitDef } from '../types';

const hero: Hero = { class: 'necromancer', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] };
const tank: UnitDef = { ...SKELETON, name: 'Target', hp: 1000, defense: 0, attack: 0, minDamage: 1, maxDamage: 1, abilities: [] };
function setup(unit: UnitDef, artifacts: string[], count = 10, enemies = [{ unit: tank, count: 2 }]) {
  return initBattle([{ unit, count }, { unit: SKELETON, count: 2 }], enemies, hero, 42, [], undefined, { artifacts: { player: artifacts } });
}
function place(state: BattleState, id: string, col: number, row: number): BattleState {
  const old = state.units.find(u => u.id === id)!;
  const grid = setOccupant(setOccupant(state.grid, old.pos, null), { col, row }, id);
  grid.cells[row][col].blocked = false;
  return { ...state, grid, units: state.units.map(u => u.id === id ? { ...u, pos: { col, row } } : u) };
}
function attack(state: BattleState) {
  const actor = state.units.find(u => u.side === 'player' && !u.isHero)!;
  const target = state.units.find(u => u.side === 'enemy')!;
  state = place(state, actor.id, 7, 1);
  state = place(state, target.id, 8, 1);
  return applyAction({ ...state, phase: 'combat', currentUnitId: actor.id }, { type: 'attack', targetId: target.id });
}

describe('new Necromancer artifacts', () => {
  it('replaces either grimoire upgrade and keeps the replacement on reload', () => {
    const items = addItem(['dragon_ossuary'], 'putrid_grimoire');
    expect(items).toEqual(['putrid_grimoire']);
    expect(addItem(items, 'dragon_ossuary')).toEqual(['dragon_ossuary']);
    expect(migrateRunState({ ...newRun('necromancer', 42), items })!.items).toEqual(items);
  });
  it('raises Zombies using enemy starting HP, without Skeletons or their ATB bonus', () => {
    const state = setup({ ...VAMPIRE, minDamage: 9999, maxDamage: 9999 }, ['putrid_grimoire', 'marrow_crown'], 1);
    const next = attack(state);
    const raised = next.units.filter(u => u.origin?.type === 'summoned');
    expect(raised).toHaveLength(1);
    expect(raised[0].definition.name).toBe('Zombie');
    expect(raised[0].count).toBe(7);
    expect(raised[0].origin).toMatchObject({ source: 'putrid_grimoire' });
  });
  it('grows the killing Vampire stack from starting HP, and does not grow on a nonkill', () => {
    const strong = setup({ ...VAMPIRE, minDamage: 9999, maxDamage: 9999 }, ['chalice_of_conquest'], 1);
    const next = attack(strong);
    const vampire = next.units.find(u => u.definition.name === 'Vampire')!;
    expect(vampire.count).toBe(5);
    expect(vampire.startCount).toBe(5);
    const weak = attack(setup({ ...VAMPIRE, minDamage: 1, maxDamage: 1 }, ['chalice_of_conquest'], 1));
    expect(weak.units.find(u => u.definition.name === 'Vampire')!.count).toBe(1);
  });
  it('does not grant growth to other killing units', () => {
    const next = attack(setup({ ...BLACK_KNIGHT, minDamage: 9999, maxDamage: 9999 }, ['chalice_of_conquest'], 1));
    expect(next.units.find(u => u.definition.name === 'Black Knight')!.startCount).toBe(1);
  });
  it('converts all Acolytes once, merges counts, and grants Frenzy to Vampires in previews and combat', () => {
    const run = { ...newRun('necromancer', 42), army: [{ unit: BLOOD_ACOLYTE, count: 7 }, { unit: VAMPIRE, count: 3 }] };
    const next = applyItemPick(run, 'crimson_ascension');
    expect(next.army.map(s => [s.unit.name, s.count])).toEqual([['Vampire', 10]]);
    expect(applyItemPick(next, 'crimson_ascension').army).toEqual(next.army);
    expect(migrateRunState(next)!.army[0].count).toBe(10);
    const preview = applyUnitSkills(next.army, {}, 'necromancer', next.items);
    expect(preview[0].unit.abilities).toContain('blood_frenzy');
    const battle = setup(VAMPIRE, next.items);
    const vampire = battle.units.find(u => u.definition.name === 'Vampire')!;
    expect(damageStack(vampire, 1, battle).remaining.damageBonus).toBe(2);
    expect(VAMPIRE.abilities).not.toContain('blood_frenzy');
  });
  it('creates a Vampire stack if none exists at conversion', () => {
    const run = { ...newRun('necromancer', 42), army: [{ unit: BLOOD_ACOLYTE, count: 7 }] };
    expect(applyItemPick(run, 'crimson_ascension').army).toEqual([{ unit: VAMPIRE, count: 7 }]);
  });
  it('bounces twice, applies upgraded curses, skips allies and spends one shot', () => {
    let state = setup(LICH, ['chain_of_lament', 'withered_quiver', 'crown_of_ruin'], 1, Array.from({ length: 4 }, () => ({ unit: tank, count: 2 })));
    const actor = state.units.find(u => u.definition.name === 'Lich')!;
    const enemies = state.units.filter(u => u.side === 'enemy');
    const ally = state.units.find(u => u.definition.name === 'Skeleton')!;
    state = place(state, actor.id, 0, 1);
    state = place(state, enemies[0].id, 7, 1);
    state = place(state, enemies[1].id, 8, 1);
    state = place(state, enemies[2].id, 9, 1);
    state = place(state, enemies[3].id, 11, 8);
    state = place(state, ally.id, 7, 2);
    const next = applyAction({ ...state, phase: 'combat', currentUnitId: actor.id }, { type: 'shoot', targetId: enemies[0].id });
    for (const enemy of enemies.slice(0, 3)) {
      const hit = next.units.find(u => u.id === enemy.id)!;
      expect(hit.hp).toBeLessThan(tank.hp);
      expect(hit.attackBuff).toBe(-10);
      expect(hit.defenseBuff).toBe(-10);
    }
    expect(next.units.find(u => u.id === enemies[3].id)!.hp).toBe(tank.hp);
    expect(next.units.find(u => u.id === ally.id)!.attackBuff ?? 0).toBe(0);
    expect(next.units.find(u => u.id === actor.id)!.shotsLeft).toBe(5);
    expect(next.log.filter(e => e.type === 'shoot')).toHaveLength(3);
  });
  it('protects Black Knights from lethal melee, ranged and magic while another army stack lives', () => {
    const state = setup(BLACK_KNIGHT, ['montys_python'], 3);
    const knight = state.units.find(u => u.definition.name === 'Black Knight')!;
    const enemy = state.units.find(u => u.side === 'enemy')!;
    expect(damageStack(knight, 99999, state).remaining).toMatchObject({ count: 1, hp: 1 });
    expect(applyStrike({ ...enemy, definition: BLACK_KNIGHT }, knight, 99999, state).remaining).toMatchObject({ count: 1, hp: 1 });
    expect(resolveDamagePacket(state, { sourceId: enemy.id, targetId: knight.id, amount: 99999, type: 'magic', delivery: 'secondary', ranged: false, direct: true, canTriggerOnHit: false, canLifeDrain: false }, () => 0.5).target).toMatchObject({ count: 1, hp: 1 });
    const alone = { ...state, units: state.units.map(u => u.side === 'player' && !u.isHero && u.id !== knight.id ? { ...u, count: 0, hp: 0 } : u) };
    expect(damageStack(knight, 99999, alone).remaining.count).toBe(0);
  });
  it('does not use another controller’s army to protect a Black Knight', () => {
    const state = setup(BLACK_KNIGHT, ['montys_python']);
    const knight = state.units.find(u => u.definition.name === 'Black Knight')!;
    const otherController = { ...state, units: state.units.map(u => u.definition.name === 'Skeleton' ? { ...u, controllerId: 'ally' } : u) };
    expect(damageStack(knight, 99999, otherController).remaining.count).toBe(0);
  });
});
