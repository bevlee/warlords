import { describe, expect, it } from 'vitest';
import { applyAction, initBattle } from '../battle';
import { resolveDamagePacket } from '../combat';
import { setOccupant } from '../grid';
import { UNIT_ABILITIES } from '../unitAbilities';
import { ARCHER } from '../knight';
import { GOBLIN } from '../barbarian';
import { GOG, IMP, DEVIL } from '../demon';
import { GREMLIN, STONE_GOLEM, TITAN } from '../wizard';
import { BLACK_KNIGHT, SKELETON } from '../necromancer';
import type { BattleState, Hero, Pos, UnitDef, UnitStack } from '../types';

const hero = (className: Hero['class']): Hero => ({
  class: className,
  level: 1,
  xp: 0,
  attack: 0,
  defense: 0,
  statPoints: 0,
  factionSkills: [],
});

const totalHp = (unit: UnitStack): number => unit.count > 0 ? (unit.count - 1) * unit.definition.hp + unit.hp : 0;

function relocate(state: BattleState, id: string, to: Pos): BattleState {
  const unit = state.units.find(candidate => candidate.id === id)!;
  return {
    ...state,
    grid: setOccupant(setOccupant(state.grid, unit.pos, null), to, id),
    units: state.units.map(candidate => candidate.id === id ? { ...candidate, pos: to } : candidate),
  };
}

const TANK: UnitDef = {
  ...GOBLIN,
  name: 'Tank',
  hp: 1_000,
  attack: 0,
  defense: 0,
  minDamage: 1,
  maxDamage: 1,
  abilities: [],
};

describe('artifact-enhanced areas are ally-safe', () => {
  const cases: Array<{ name: string; attacker: UnitDef; artifact: string; heroClass: Hero['class'] }> = [
    { name: 'Blackpowder Fletching Area Shot', attacker: { ...ARCHER, range: 99 }, artifact: 'blackpowder_fletching', heroClass: 'knight' },
    { name: 'Barbed Volley Area Shot', attacker: { ...ARCHER, range: 99 }, artifact: 'barbed_volley', heroClass: 'knight' },
    { name: 'Storm Conductor Lightning Strike', attacker: TITAN, artifact: 'storm_fletching', heroClass: 'wizard' },
    { name: 'Overcharged Rods Lightning Strike', attacker: TITAN, artifact: 'overcharged_rods', heroClass: 'wizard' },
    { name: 'Stormcrown Lightning Strike', attacker: TITAN, artifact: 'stormcrown', heroClass: 'wizard' },
    { name: 'Sulfurous Pitch Hellfire Shot', attacker: { ...GOG, range: 99 }, artifact: 'sulfurous_pitch', heroClass: 'demon' },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} damages nearby enemies but not nearby allies`, () => {
      let state = initBattle(
        [{ unit: testCase.attacker, count: 1 }, { unit: TANK, count: 2 }],
        [{ unit: TANK, count: 2 }, { unit: TANK, count: 2 }],
        hero(testCase.heroClass),
        41,
        [],
        undefined,
        { artifacts: { player: [testCase.artifact] } },
      );
      const attacker = state.units.find(unit => unit.side === 'player' && unit.definition.name === testCase.attacker.name)!;
      const ally = state.units.find(unit => unit.side === 'player' && unit.id !== attacker.id && !unit.isHero)!;
      const [target, nearbyEnemy] = state.units.filter(unit => unit.side === 'enemy');
      state = relocate(state, ally.id, { col: 9, row: 2 });
      const allyBefore = totalHp(state.units.find(unit => unit.id === ally.id)!);
      const enemyBefore = totalHp(nearbyEnemy);

      const next = applyAction({ ...state, phase: 'combat', currentUnitId: attacker.id }, { type: 'shoot', targetId: target.id });

      expect(totalHp(next.units.find(unit => unit.id === ally.id)!)).toBe(allyBefore);
      expect(totalHp(next.units.find(unit => unit.id === nearbyEnemy.id)!)).toBeLessThan(enemyBefore);
    });
  }

  it('Pressurised Bile Sac makes the extended Caustic Breath ignore allies', () => {
    let state = initBattle(
      [{ unit: { ...STONE_GOLEM, name: 'Breather', abilities: ['caustic_breath'] }, count: 1 }, { unit: TANK, count: 2 }],
      [{ unit: TANK, count: 2 }],
      hero('wizard'),
      17,
      [],
      undefined,
      { artifacts: { player: ['pressurised_bile_sac'] } },
    );
    const actor = state.units.find(unit => unit.definition.name === 'Breather')!;
    const ally = state.units.find(unit => unit.side === 'player' && unit.id !== actor.id && !unit.isHero)!;
    const enemy = state.units.find(unit => unit.side === 'enemy')!;
    state = relocate(state, actor.id, { col: 7, row: 1 });
    state = relocate(state, ally.id, { col: 8, row: 1 });
    state = relocate(state, enemy.id, { col: 9, row: 1 });
    const allyBefore = totalHp(state.units.find(unit => unit.id === ally.id)!);
    const enemyBefore = totalHp(state.units.find(unit => unit.id === enemy.id)!);

    const next = applyAction({ ...state, phase: 'combat', currentUnitId: actor.id }, { type: 'ability', abilityId: 'caustic_breath', to: { col: 8, row: 1 } });

    expect(totalHp(next.units.find(unit => unit.id === ally.id)!)).toBe(allyBefore);
    expect(totalHp(next.units.find(unit => unit.id === enemy.id)!)).toBeLessThan(enemyBefore);
  });

  it("Hell's Verdict damages adjacent enemies but not adjacent allies", () => {
    let state = initBattle(
      [{ unit: DEVIL, count: 1 }, { unit: TANK, count: 2 }],
      [{ unit: TANK, count: 2 }, { unit: TANK, count: 2 }],
      hero('demon'),
      23,
      [],
      undefined,
      { artifacts: { player: ['hells_verdict'] } },
    );
    const devil = state.units.find(unit => unit.definition.name === 'Devil')!;
    const ally = state.units.find(unit => unit.side === 'player' && unit.id !== devil.id && !unit.isHero)!;
    const [target, nearbyEnemy] = state.units.filter(unit => unit.side === 'enemy');
    state = relocate(state, devil.id, { col: 9, row: 1 });
    state = relocate(state, ally.id, { col: 9, row: 2 });
    state = {
      ...state,
      units: state.units.map(unit => unit.id === target.id ? { ...unit, burnDamage: 1, burnRoundsLeft: 2, burnSourceId: devil.id } : unit),
    };
    const allyBefore = totalHp(state.units.find(unit => unit.id === ally.id)!);
    const enemyBefore = totalHp(nearbyEnemy);

    const next = applyAction({ ...state, phase: 'combat', currentUnitId: devil.id }, { type: 'attack', targetId: target.id });

    expect(totalHp(next.units.find(unit => unit.id === ally.id)!)).toBe(allyBefore);
    expect(totalHp(next.units.find(unit => unit.id === nearbyEnemy.id)!)).toBeLessThan(enemyBefore);
  });
});

describe('enemy-only death effects', () => {
  const EXECUTIONER: UnitDef = { ...GOBLIN, name: 'Executioner', hp: 1_000, attack: 100, minDamage: 100, maxDamage: 100, abilities: [] };

  it('Cinderburst damages nearby enemies of the Imp but not its allies', () => {
    let state = initBattle(
      [{ unit: EXECUTIONER, count: 1 }, { unit: TANK, count: 2 }],
      [{ unit: IMP, count: 1 }, { unit: TANK, count: 2 }],
      hero('demon'),
      29,
    );
    const attacker = state.units.find(unit => unit.definition.name === 'Executioner')!;
    const ally = state.units.find(unit => unit.side === 'player' && unit.id !== attacker.id && !unit.isHero)!;
    const imp = state.units.find(unit => unit.definition.name === 'Imp')!;
    const impAlly = state.units.find(unit => unit.side === 'enemy' && unit.id !== imp.id)!;
    state = relocate(state, attacker.id, { col: 9, row: 1 });
    state = relocate(state, ally.id, { col: 9, row: 2 });
    const attackerBefore = totalHp(state.units.find(unit => unit.id === attacker.id)!);
    const impAllyBefore = totalHp(impAlly);

    const next = applyAction({ ...state, phase: 'combat', currentUnitId: attacker.id }, { type: 'attack', targetId: imp.id });

    expect(totalHp(next.units.find(unit => unit.id === attacker.id)!)).toBeLessThan(attackerBefore);
    expect(totalHp(next.units.find(unit => unit.id === impAlly.id)!)).toBe(impAllyBefore);
  });

  it('Furnace Heart spreads Burn among enemies without burning allies', () => {
    let state = initBattle(
      [{ unit: EXECUTIONER, count: 1 }, { unit: TANK, count: 2 }],
      [{ unit: GOBLIN, count: 1 }, { unit: TANK, count: 2 }],
      hero('demon'),
      31,
      [],
      undefined,
      { artifacts: { player: ['furnace_heart'] } },
    );
    const attacker = state.units.find(unit => unit.definition.name === 'Executioner')!;
    const ally = state.units.find(unit => unit.side === 'player' && unit.id !== attacker.id && !unit.isHero)!;
    const [target, nearbyEnemy] = state.units.filter(unit => unit.side === 'enemy');
    state = relocate(state, attacker.id, { col: 9, row: 1 });
    state = relocate(state, ally.id, { col: 9, row: 2 });
    state = {
      ...state,
      units: state.units.map(unit => unit.id === target.id ? { ...unit, burnDamage: 7, burnRoundsLeft: 2, burnSourceId: attacker.id } : unit),
    };

    const next = applyAction({ ...state, phase: 'combat', currentUnitId: attacker.id }, { type: 'attack', targetId: target.id });

    expect(next.units.find(unit => unit.id === nearbyEnemy.id)?.burnDamage).toBe(7);
    expect(next.units.find(unit => unit.id === ally.id)?.burnDamage).toBeUndefined();
  });
});

describe('artifact rule scopes', () => {
  it('uses the Construct unit type for Repair and never lets Tinker’s Kit revive a perished non-Construct', () => {
    const state = initBattle(
      [{ unit: GREMLIN, count: 5 }, { unit: STONE_GOLEM, count: 2 }, { unit: GOBLIN, count: 5 }],
      [{ unit: GOBLIN, count: 5 }],
      hero('wizard'),
      37,
      [],
      undefined,
      { artifacts: { player: ['tinkers_kit'] } },
    );
    const gremlin = state.units.find(unit => unit.definition.name === 'Gremlin')!;
    const golem = state.units.find(unit => unit.definition.name === 'Stone Golem')!;
    const goblin = state.units.find(unit => unit.side === 'player' && unit.definition.name === 'Goblin')!;
    const wounded = {
      ...state,
      units: state.units.map(unit => unit.id === golem.id || unit.id === goblin.id ? { ...unit, hp: 1 } : unit),
    };
    expect(UNIT_ABILITIES.repair.canUse(wounded, gremlin, golem.id)).toBe(true);
    expect(UNIT_ABILITIES.repair.canUse(wounded, gremlin, goblin.id)).toBe(true);

    const perished = {
      ...wounded,
      units: wounded.units.map(unit => unit.id === goblin.id ? { ...unit, count: 0, hp: 0 } : unit),
    };
    expect(UNIT_ABILITIES.repair.canUse(perished, gremlin, goblin.id)).toBe(false);
  });

  it('gives Black Procession abilities to deployed and raised Skeletons', () => {
    const STRONG_SKELETON: UnitDef = { ...SKELETON, attack: 100, minDamage: 100, maxDamage: 100 };
    let state = initBattle(
      [{ unit: STRONG_SKELETON, count: 1 }],
      [{ unit: GOBLIN, count: 1 }],
      hero('necromancer'),
      43,
      [],
      undefined,
      { artifacts: { player: ['gravewrights_grimoire', 'the_black_procession'] } },
    );
    const skeleton = state.units.find(unit => unit.definition.name === 'Skeleton')!;
    expect(skeleton.definition.abilities).toEqual(expect.arrayContaining(['infecting_strike', 'drain_morale']));
    const target = state.units.find(unit => unit.side === 'enemy')!;
    state = relocate(state, skeleton.id, { col: 9, row: 1 });

    const next = applyAction({ ...state, phase: 'combat', currentUnitId: skeleton.id }, { type: 'attack', targetId: target.id });
    const raised = next.units.find(unit => unit.origin?.type === 'summoned' && unit.origin.source === 'necromancy')!;
    expect(raised.definition.abilities).toEqual(expect.arrayContaining(['infecting_strike', 'drain_morale']));
  });

  it('gives Black Procession abilities to Skeletons raised by other artifacts', () => {
    let state = initBattle(
      [{ unit: BLACK_KNIGHT, count: 1 }],
      [{ unit: TANK, count: 2 }],
      hero('necromancer'),
      47,
      [],
      undefined,
      { artifacts: { player: ['knights_reliquary', 'the_black_procession'] } },
    );
    const knight = state.units.find(unit => unit.definition.name === 'Black Knight')!;
    const target = state.units.find(unit => unit.side === 'enemy')!;
    state = relocate(state, knight.id, { col: 9, row: 1 });

    const next = applyAction({ ...state, phase: 'combat', currentUnitId: knight.id }, { type: 'attack', targetId: target.id });
    const raised = next.units.find(unit => unit.origin?.type === 'summoned' && unit.origin.source === 'knights_reliquary')!;
    expect(raised.definition.abilities).toEqual(expect.arrayContaining(['infecting_strike', 'drain_morale']));
  });

  it('makes Marked for Death increase damage from any source', () => {
    const state = initBattle([{ unit: GOBLIN, count: 5 }], [{ unit: TANK, count: 2 }, { unit: TANK, count: 2 }], hero('barbarian'), 53);
    const source = state.units.find(unit => unit.side === 'enemy')!;
    const target = state.units.filter(unit => unit.side === 'enemy')[1];
    const marked: BattleState = {
      ...state,
      units: state.units.map(unit => unit.id === target.id ? {
        ...unit,
        marks: [{ kind: 'marked_for_death', ownerTeamId: 'player', sourceControllerId: 'player' }],
      } : unit),
    };

    const hit = resolveDamagePacket(marked, {
      sourceId: source.id,
      targetId: target.id,
      amount: 100,
      type: 'physical',
      delivery: 'secondary',
      ranged: false,
      direct: false,
      canTriggerOnHit: false,
      canLifeDrain: false,
    }, () => 0.5);

    expect(hit.outcome.finalDamage).toBe(120);
  });
});
