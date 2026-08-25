import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { applyStrike, damageStack, effectiveAttack, effectiveDefense, modifiedDamage } from '../combat';
import { damagePreview } from '../selectors';
import { aiTakeTurn } from '../ai';
import { updateFactionSkills } from '../factionSkills';
import { UNIT_ABILITIES, activatedAbilitiesOf } from '../unitAbilities';
import { INFECT_PENALTY, BLOOD_FRENZY_DAMAGE } from '../abilityCatalog';
import { GOBLIN } from '../barbarian';
import { ZOMBIE, SKELETON, BLACK_KNIGHT, BONE_DRAGON, VAMPIRE, BLOOD_ACOLYTE } from '../necromancer';
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
    startCount: 10,
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

/** Puts `attacker` next to `defender` and hands the turn to the attacker. */
function meleeSetup(attackerDef: typeof GOBLIN, defenderDef: typeof GOBLIN, counts = [5, 100]) {
  const state = initBattle(
    [{ unit: attackerDef, count: counts[0] }],
    [{ unit: defenderDef, count: counts[1] }],
    baseHero(),
    1
  );
  const attacker = state.units.find(u => u.side === 'player' && !u.isHero)!;
  const defender = state.units.find(u => u.side === 'enemy')!;
  return { state: { ...state, currentUnitId: attacker.id } as BattleState, attacker, defender };
}

describe('Zombie infecting strike', () => {
  it('takes 5 attack and 5 defense off the target on a hit', () => {
    const { state, attacker, defender } = meleeSetup(ZOMBIE, GOBLIN);
    const next = applyAction(state, { type: 'attack', targetId: defender.id });
    const hit = next.units.find(u => u.id === defender.id)!;
    expect(hit.attackBuff).toBe(-INFECT_PENALTY);
    expect(hit.defenseBuff).toBe(-INFECT_PENALTY);
    expect(attacker.definition.abilities).toContain('infecting_strike');
  });

  it('stacks with every further hit', () => {
    let { state, defender } = meleeSetup(ZOMBIE, GOBLIN);
    const zombie = state.units.find(u => u.side === 'player' && !u.isHero)!;
    for (let i = 0; i < 3; i++) {
      state = applyAction({ ...state, currentUnitId: zombie.id }, { type: 'attack', targetId: defender.id });
    }
    const hit = state.units.find(u => u.id === defender.id)!;
    expect(hit.attackBuff).toBe(-3 * INFECT_PENALTY);
    expect(hit.defenseBuff).toBe(-3 * INFECT_PENALTY);
  });

  it('floors the stats the formula and the info panel both read at 0', () => {
    // Goblins are attack 2 / defense 1, so one infection takes both under zero.
    const infected = makeStack({
      definition: GOBLIN, side: 'enemy',
      attackBuff: -INFECT_PENALTY, defenseBuff: -INFECT_PENALTY,
    });
    expect(effectiveAttack(infected)).toBe(0);
    expect(effectiveDefense(infected)).toBe(0);
    // A second infection changes nothing — the floor holds.
    const worse = { ...infected, attackBuff: -2 * INFECT_PENALTY, defenseBuff: -2 * INFECT_PENALTY };
    expect(effectiveAttack(worse)).toBe(0);
    expect(effectiveDefense(worse)).toBe(0);
  });

  it('floors effective attack and defense at 0 rather than inverting them', () => {
    // 100 stacked infections would take a 5-defense unit far below zero.
    const attacker = makeStack({ definition: ZOMBIE, count: 1 });
    const stripped = makeStack({ definition: GOBLIN, count: 1, side: 'enemy', defenseBuff: -500 });
    const floored = makeStack({ definition: GOBLIN, count: 1, side: 'enemy', defenseBuff: -GOBLIN.defense });
    // Once defense hits 0 more infection changes nothing — no runaway bonus.
    expect(modifiedDamage(attacker, stripped, 0, 10)).toBe(modifiedDamage(attacker, floored, 0, 10));
  });
});

describe('Black Knight soul reaper', () => {
  it('kills one creature beyond what the damage alone would', () => {
    const knight = makeStack({ definition: BLACK_KNIGHT, count: 1 });
    const plain = makeStack({ definition: VAMPIRE, count: 1 });
    const victims = makeStack({ definition: GOBLIN, count: 10, side: 'enemy' });
    const damage = GOBLIN.hp * 2; // exactly two creatures' worth

    expect(applyStrike(plain, victims, damage).killed).toBe(2);
    expect(applyStrike(knight, victims, damage).killed).toBe(3);
  });

  it('claims a creature even when the damage kills none', () => {
    const knight = makeStack({ definition: BLACK_KNIGHT, count: 1 });
    const victims = makeStack({ definition: GOBLIN, count: 10, side: 'enemy' });
    const result = applyStrike(knight, victims, 1);
    expect(result.killed).toBe(1);
    expect(result.remaining.count).toBe(9);
    // The reaped creature dies whole, so the next one steps up undamaged.
    expect(result.remaining.hp).toBe(GOBLIN.hp);
  });

  it('never kills more creatures than the stack has', () => {
    const knight = makeStack({ definition: BLACK_KNIGHT, count: 1 });
    const victims = makeStack({ definition: GOBLIN, count: 2, side: 'enemy' });
    const result = applyStrike(knight, victims, GOBLIN.hp * 50);
    expect(result.killed).toBe(2);
    expect(result.remaining.count).toBe(0);
  });

  it('shows the extra kill in the melee damage forecast', () => {
    const knight = makeStack({ definition: BLACK_KNIGHT, count: 1 });
    const victims = makeStack({ definition: GOBLIN, count: 20, side: 'enemy' });
    const preview = damagePreview(knight, victims, 0);
    const plainKills = damageStack(victims, preview.min).killed;
    expect(preview.killsMin).toBe(plainKills + 1);
  });
});

describe('Blood Acolyte blood frenzy', () => {
  it('gains min and max damage every time it is wounded', () => {
    const acolyte = makeStack({ definition: BLOOD_ACOLYTE, count: 5 });
    const once = damageStack(acolyte, 3).remaining;
    expect(once.damageBonus).toBe(BLOOD_FRENZY_DAMAGE);
    expect(damageStack(once, 3).remaining.damageBonus).toBe(2 * BLOOD_FRENZY_DAMAGE);
  });

  it('grows from retaliation damage during a normal exchange', () => {
    const { state, defender } = meleeSetup(GOBLIN, GOBLIN);
    // Swap the enemy for an Acolyte so the player's attack draws its retaliation.
    const withAcolyte: BattleState = {
      ...state,
      units: state.units.map(u =>
        u.id === defender.id ? { ...u, definition: BLOOD_ACOLYTE, hp: BLOOD_ACOLYTE.hp } : u
      ),
    };
    const next = applyAction(withAcolyte, { type: 'attack', targetId: defender.id });
    expect(next.units.find(u => u.id === defender.id)!.damageBonus).toBe(BLOOD_FRENZY_DAMAGE);
  });

  it('feeds the accrued bonus into the damage it deals', () => {
    const plain = makeStack({ definition: BLOOD_ACOLYTE, count: 4 });
    const grown = { ...plain, damageBonus: 10 };
    const target = makeStack({ definition: GOBLIN, count: 50, side: 'enemy' });
    // 4 creatures × +10 each, before the attack/defense modifier.
    expect(modifiedDamage(grown, target, 0, 5)).toBeGreaterThan(modifiedDamage(plain, target, 0, 5));
    expect(damagePreview(grown, target, 0).min).toBeGreaterThan(damagePreview(plain, target, 0).min);
  });

  it('does not grow when the wound wipes the stack out', () => {
    const acolyte = makeStack({ definition: BLOOD_ACOLYTE, count: 1, hp: 1 });
    expect(damageStack(acolyte, 9999).remaining.damageBonus).toBeUndefined();
  });
});

describe('Bone Dragon absorb skeleton', () => {
  function dragonSetup(dragons = 4, skeletons = 10) {
    const state = initBattle(
      [{ unit: BONE_DRAGON, count: dragons }, { unit: SKELETON, count: skeletons }],
      [{ unit: GOBLIN, count: 200 }],
      baseHero(),
      1
    );
    const dragon = state.units.find(u => u.definition.name === 'Bone Dragon')!;
    const bones = state.units.find(u => u.definition.name === 'Skeleton')!;
    return { state, dragon, bones };
  }

  /** Knocks the dragon stack down to `count` living creatures, the leader on `hp`. */
  function wound(state: BattleState, dragonId: string, count: number, hp = 1): BattleState {
    return { ...state, units: state.units.map(u => (u.id === dragonId ? { ...u, count, hp } : u)) };
  }

  it('is offered only while wounded and only with skeletons on the field', () => {
    const { state, dragon } = dragonSetup();
    expect(activatedAbilitiesOf(dragon)).toEqual(['absorb_skeleton']);
    // Untouched: nothing to heal.
    expect(UNIT_ABILITIES.absorb_skeleton.canUse(state, dragon)).toBe(false);

    const hurt = wound(state, dragon.id, 2);
    expect(UNIT_ABILITIES.absorb_skeleton.canUse(hurt, hurt.units.find(u => u.id === dragon.id)!)).toBe(true);

    const boneless: BattleState = { ...hurt, units: hurt.units.filter(u => u.definition.name !== 'Skeleton') };
    expect(UNIT_ABILITIES.absorb_skeleton.canUse(boneless, boneless.units.find(u => u.id === dragon.id)!)).toBe(false);
  });

  it('eats one skeleton per bone dragon in the starting stack, healing a dragon each', () => {
    const { state, dragon, bones } = dragonSetup(4, 10);
    const hurt = wound(state, dragon.id, 1);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });

    // 4 skeletons eaten (startCount), each worth a full Bone Dragon's HP.
    expect(next.units.find(u => u.id === bones.id)!.count).toBe(6);
    const healed = next.units.find(u => u.id === dragon.id)!;
    expect(healed.count).toBe(4);
    expect(healed.hp).toBe(BONE_DRAGON.hp);
  });

  it('takes every remaining skeleton when there are fewer than dragons', () => {
    const { state, dragon, bones } = dragonSetup(6, 2);
    const hurt = wound(state, dragon.id, 1);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });

    const eaten = next.units.find(u => u.id === bones.id)!;
    expect(eaten.count).toBe(0);
    // The emptied stack dies properly and frees its cell.
    expect(next.grid.cells[bones.pos.row][bones.pos.col].occupantId).toBeNull();
    expect(next.log.some(e => e.type === 'death' && e.data.unitId === bones.id)).toBe(true);
  });

  it('eats only what it can use, leaving the rest of the pile standing', () => {
    // 1 of 10 dragons left, at full health: 9 are missing, so 9 bones are eaten.
    const { state, dragon, bones } = dragonSetup(10, 20);
    const hurt = wound(state, dragon.id, 1, BONE_DRAGON.hp);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });

    expect(next.units.find(u => u.id === bones.id)!.count).toBe(11);
    expect(next.units.find(u => u.id === dragon.id)!.count).toBe(10);
  });

  it('takes one more when the survivor is also wounded', () => {
    // Same stack, but the last dragon is on 1 HP: 9 revives plus a top-up = 10.
    const { state, dragon, bones } = dragonSetup(10, 20);
    const hurt = wound(state, dragon.id, 1, 1);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });

    expect(next.units.find(u => u.id === bones.id)!.count).toBe(10);
    const healed = next.units.find(u => u.id === dragon.id)!;
    expect(healed.count).toBe(10);
    expect(healed.hp).toBe(BONE_DRAGON.hp);
  });

  it('spends a single skeleton on a scratch', () => {
    const { state, dragon, bones } = dragonSetup(10, 20);
    const hurt = wound(state, dragon.id, 10, BONE_DRAGON.hp - 5);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });

    expect(next.units.find(u => u.id === bones.id)!.count).toBe(19);
    expect(next.units.find(u => u.id === dragon.id)!.hp).toBe(BONE_DRAGON.hp);
  });

  it('never revives past the count the stack started the battle with', () => {
    const { state, dragon } = dragonSetup(2, 50);
    const hurt = wound(state, dragon.id, 1);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });
    expect(next.units.find(u => u.id === dragon.id)!.count).toBe(2);
  });

  it('spends the turn — the dragon is no longer the acting unit', () => {
    const { state, dragon } = dragonSetup();
    const hurt = wound(state, dragon.id, 1);
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });
    expect(next.currentUnitId).not.toBe(dragon.id);
  });

  it('rejects the action outright when it is not usable, keeping the turn', () => {
    const { state, dragon } = dragonSetup();
    const ready = { ...state, currentUnitId: dragon.id };
    // Full health: nothing to absorb.
    expect(applyAction(ready, { type: 'ability', abilityId: 'absorb_skeleton' })).toBe(ready);
    // A unit that does not have the ability cannot borrow it.
    const goblin = state.units.find(u => u.side === 'enemy')!;
    const enemyTurn = { ...state, currentUnitId: goblin.id };
    expect(applyAction(enemyTurn, { type: 'ability', abilityId: 'absorb_skeleton' })).toBe(enemyTurn);
    expect(applyAction(ready, { type: 'ability', abilityId: 'nonexistent' })).toBe(ready);
  });

  it('is used by the AI once whole dragons have fallen', () => {
    const { state, dragon } = dragonSetup();
    expect(aiTakeTurn(state, dragon.id)).not.toEqual({ type: 'ability', abilityId: 'absorb_skeleton' });
    const hurt = wound(state, dragon.id, 2);
    expect(aiTakeTurn(hurt, dragon.id)).toEqual({ type: 'ability', abilityId: 'absorb_skeleton' });
  });

  it('drains the largest skeleton stack, not the nearest', () => {
    const { state, dragon } = dragonSetup(3, 4);
    const bones = state.units.find(u => u.definition.name === 'Skeleton')!;
    const bigger = makeStack({
      id: 'bones-big',
      definition: SKELETON,
      count: 40,
      startCount: 40,
      hp: SKELETON.hp,
      pos: { col: 0, row: 9 },
      controllerId: dragon.controllerId,
    });
    let hurt = wound(state, dragon.id, 1);
    hurt = { ...hurt, units: [...hurt.units, bigger] };
    const next = applyAction({ ...hurt, currentUnitId: dragon.id }, { type: 'ability', abilityId: 'absorb_skeleton' });

    expect(next.units.find(u => u.id === bones.id)!.count).toBe(4);
    expect(next.units.find(u => u.id === bigger.id)!.count).toBe(37);
  });
});
