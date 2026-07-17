import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { getKnownSpells, SPELL_DEFS } from '../spells';
import { calculateDamage, reviveHeal } from '../combat';
import { mulberry32 } from '../rng';
import { GOBLIN, OGRE, WOLF_RIDER } from '../barbarian';
import { SKELETON } from '../necromancer';
import type { ArmySlot, BattleState, FactionClass, Hero, UnitStack } from '../types';

const hero: Hero = { class: 'barbarian', level: 2, xp: 0, attack: 4, defense: 2, statPoints: 0, factionSkills: [] };

const heroOf = (cls: FactionClass, level = 5): Hero =>
  ({ class: cls, level, xp: 0, attack: 4, defense: 2, statPoints: 0, factionSkills: [] });

function newBattle(seed = 11): BattleState {
  return initBattle(
    [{ unit: GOBLIN, count: 10 }],
    [{ unit: OGRE, count: 3 }],
    hero,
    seed
  );
}

function battleFor(h: Hero, player: ArmySlot[], enemy: ArmySlot[], seed = 11): BattleState {
  return initBattle(player, enemy, h, seed);
}

function toHeroTurn(state: BattleState): BattleState {
  let s = state;
  for (let i = 0; i < 20 && !s.units.find(u => u.id === s.currentUnitId)?.isHero; i++) {
    s = applyAction(s, { type: 'wait' });
  }
  expect(s.units.find(u => u.id === s.currentUnitId)?.isHero).toBe(true);
  return s;
}

const totalHp = (s: BattleState, id: string) => {
  const u = s.units.find(x => x.id === id)!;
  return u.count > 0 ? (u.count - 1) * u.definition.hp + u.hp : 0;
};

describe('hero spells', () => {
  it('initBattle grants the hero 5 + 3·level mana', () => {
    expect(newBattle().hero.mana).toBe(11);
  });

  it('lightning deals exact level-scaled damage, spends mana, logs, and ends the hero turn', () => {
    const s = toHeroTurn(newBattle());
    const heroId = s.currentUnitId!;
    const enemy = s.units.find(u => u.side === 'enemy' && u.count > 0)!;
    const before = totalHp(s, enemy.id);

    const next = applyAction(s, { type: 'cast', spell: 'lightning', targetId: enemy.id });

    expect(before - totalHp(next, enemy.id)).toBe(12 + 8 * hero.level); // 28
    expect(next.hero.mana).toBe(11 - 3);
    expect(next.log.some(e => e.type === 'cast' && e.data.spell === 'lightning')).toBe(true);
    expect(next.currentUnitId).not.toBe(heroId);
  });

  it('rejects a cast the hero cannot afford, leaving the state untouched', () => {
    const s0 = toHeroTurn(newBattle());
    const s = { ...s0, hero: { ...s0.hero, mana: 1 } };
    const enemy = s.units.find(u => u.side === 'enemy' && u.count > 0)!;

    const next = applyAction(s, { type: 'cast', spell: 'lightning', targetId: enemy.id });

    expect(next.currentUnitId).toBe(s.currentUnitId); // still the hero's turn
    expect(totalHp(next, enemy.id)).toBe(totalHp(s, enemy.id));
    expect(next.hero.mana).toBe(1);
  });

  it('rejects casts from non-hero stacks', () => {
    let s = newBattle();
    // make sure the current unit is not the hero
    if (s.units.find(u => u.id === s.currentUnitId)?.isHero) {
      s = applyAction(s, { type: 'wait' });
    }
    const enemy = s.units.find(u => u.side === 'enemy' && u.count > 0)!;
    const before = totalHp(s, enemy.id);

    const next = applyAction(s, { type: 'cast', spell: 'lightning', targetId: enemy.id });

    expect(next.currentUnitId).toBe(s.currentUnitId);
    expect(totalHp(next, enemy.id)).toBe(before);
  });

  it('bloodlust and stoneskin grant battle-long buffs that feed the damage formula', () => {
    const s = toHeroTurn(newBattle());
    const friendly = s.units.find(u => u.side === 'player' && !u.isHero)!;

    const buffed = applyAction(s, { type: 'cast', spell: 'bloodlust', targetId: friendly.id });
    const buffedStack = buffed.units.find(u => u.id === friendly.id)!;
    expect(buffedStack.attackBuff).toBe(4);
    expect(buffed.hero.mana).toBe(11 - 2);

    // buffs change damage output/intake
    const target = s.units.find(u => u.side === 'enemy')!;
    const plain = calculateDamage(friendly, target, 0, mulberry32(3));
    const strong = calculateDamage(buffedStack, target, 0, mulberry32(3));
    expect(strong).toBeGreaterThan(plain);

    const stoned = { ...target, defenseBuff: 4 };
    const reduced = calculateDamage(friendly, stoned, 0, mulberry32(3));
    expect(reduced).toBeLessThan(plain);
  });
});

describe('spell knowledge', () => {
  it('every hero knows the three shared spells at level 1', () => {
    const ids = getKnownSpells(heroOf('wizard', 1)).map(s => s.id).sort();
    expect(ids).toEqual(['bloodlust', 'lightning', 'stoneskin']);
  });

  it('each faction unlocks exactly its own unique spell at level 3', () => {
    const uniques: Record<FactionClass, string> = {
      barbarian: 'battle_cry', knight: 'healing_light', wizard: 'fireball',
      necromancer: 'raise_dead', ranger: 'wasp_swarm', demon: 'immolate',
    };
    for (const [cls, spell] of Object.entries(uniques) as [FactionClass, string][]) {
      const known = getKnownSpells(heroOf(cls, 3)).map(s => s.id);
      expect(known).toContain(spell);
      expect(known).toHaveLength(4);
      for (const other of Object.values(uniques)) {
        if (other !== spell) expect(known).not.toContain(other);
      }
    }
  });

  it('rejects casting a spell the hero has not unlocked', () => {
    const s = toHeroTurn(newBattle()); // barbarian level 2: battle_cry needs 3
    const friendly = s.units.find(u => u.side === 'player' && !u.isHero)!;
    const next = applyAction(s, { type: 'cast', spell: 'battle_cry', targetId: friendly.id });
    expect(next.currentUnitId).toBe(s.currentUnitId);
    expect(next.hero.mana).toBe(s.hero.mana);
  });

  it('rejects an off-faction unique even at high level', () => {
    const s = toHeroTurn(battleFor(heroOf('barbarian', 10), [{ unit: GOBLIN, count: 10 }], [{ unit: OGRE, count: 3 }]));
    const enemy = s.units.find(u => u.side === 'enemy')!;
    const next = applyAction(s, { type: 'cast', spell: 'fireball', targetId: enemy.id });
    expect(next.hero.mana).toBe(s.hero.mana);
  });
});

describe('reviveHeal', () => {
  const stack = (count: number, hp: number, startCount: number): UnitStack => ({
    id: 'x', definition: GOBLIN, count, hp, pos: { col: 0, row: 0 }, side: 'player',
    hasRetaliated: false, shotsLeft: 0, morale: 0, luck: 0, atb: 0, isDefending: false, startCount,
  });

  it('tops up the wounded creature before reviving whole ones', () => {
    // Goblin hp 5: 2 alive (top at 1 hp) of 6 → 12 HP heals 4 top + revives 1, 3 left over... capped by pool
    const { healed, revived, remaining } = reviveHeal(stack(2, 1, 6), 12);
    expect(remaining.hp).toBe(GOBLIN.hp);
    expect(revived).toBe(1);
    expect(remaining.count).toBe(3);
    expect(healed).toBe(4 + GOBLIN.hp);
  });

  it('never exceeds startCount', () => {
    const { revived, remaining } = reviveHeal(stack(5, GOBLIN.hp, 5), 999);
    expect(revived).toBe(0);
    expect(remaining.count).toBe(5);
  });

  it('does nothing for dead stacks', () => {
    const { healed, remaining } = reviveHeal(stack(0, 0, 5), 50);
    expect(healed).toBe(0);
    expect(remaining.count).toBe(0);
  });
});

describe('faction unique spells', () => {
  it('battle cry buffs every friendly stack and spends 4 mana', () => {
    const s = toHeroTurn(battleFor(heroOf('barbarian'), [
      { unit: GOBLIN, count: 5 }, { unit: WOLF_RIDER, count: 3 },
    ], [{ unit: OGRE, count: 3 }]));
    const friendly = s.units.find(u => u.side === 'player' && !u.isHero)!;

    const next = applyAction(s, { type: 'cast', spell: 'battle_cry', targetId: friendly.id });

    for (const u of next.units.filter(x => x.side === 'player' && !x.isHero)) {
      expect(u.attackBuff).toBe(2);
      expect(u.morale).toBe(1);
    }
    const enemyStacks = next.units.filter(x => x.side === 'enemy');
    for (const u of enemyStacks) expect(u.attackBuff ?? 0).toBe(0);
    expect(next.hero.mana).toBe((s.hero.mana ?? 0) - 4);
  });

  it('healing light revives fallen creatures up to startCount and rejects undamaged targets', () => {
    let s = toHeroTurn(battleFor(heroOf('knight'), [{ unit: GOBLIN, count: 10 }], [{ unit: OGRE, count: 3 }]));
    const gobId = s.units.find(u => u.side === 'player' && !u.isHero)!.id;

    // Undamaged: rejected outright, turn kept.
    const rejected = applyAction(s, { type: 'cast', spell: 'healing_light', targetId: gobId });
    expect(rejected.hero.mana).toBe(s.hero.mana);

    // Wound the stack: 3 dead, top at 2 HP.
    s = {
      ...s,
      units: s.units.map(u => (u.id === gobId ? { ...u, count: 7, hp: 2 } : u)),
    };
    const next = applyAction(s, { type: 'cast', spell: 'healing_light', targetId: gobId });
    const healedStack = next.units.find(u => u.id === gobId)!;
    // 15 + 5·5 = 40 HP: top +3, then 7 more goblins... capped at 10 → +3 revived (15 HP), rest wasted by cap
    expect(healedStack.count).toBe(10);
    expect(healedStack.hp).toBe(GOBLIN.hp);
    expect(next.hero.mana).toBe((s.hero.mana ?? 0) - 4);
    expect(next.log.some(e => e.type === 'cast' && e.data.spell === 'healing_light')).toBe(true);
  });

  it('fireball damages the target, splashes adjacent enemies, and applies burn', () => {
    const wiz = heroOf('wizard');
    let s = toHeroTurn(battleFor(wiz, [{ unit: GOBLIN, count: 10 }], [
      { unit: OGRE, count: 30 }, { unit: WOLF_RIDER, count: 30 },
    ]));
    // Enemy line spawns vertically adjacent (rows 1 and 2, col 10).
    const [primary, neighbour] = s.units.filter(u => u.side === 'enemy');
    const hpOf = (st: BattleState, id: string) => {
      const u = st.units.find(x => x.id === id)!;
      return (u.count - 1) * u.definition.hp + u.hp;
    };
    const before = { p: hpOf(s, primary.id), n: hpOf(s, neighbour.id) };

    const next = applyAction(s, { type: 'cast', spell: 'fireball', targetId: primary.id });

    const dmg = 8 + 4 * wiz.level; // 28, no sorcery skill on this bare hero
    expect(before.p - hpOf(next, primary.id)).toBe(dmg);
    expect(before.n - hpOf(next, neighbour.id)).toBe(Math.round(dmg / 2));
    const burned = next.units.find(u => u.id === primary.id)!;
    expect(burned.burnRoundsLeft).toBe(2);
    expect(burned.burnDamage).toBe(3);
  });

  it('raise dead only targets damaged undead stacks', () => {
    const nec = heroOf('necromancer');
    let s = toHeroTurn(battleFor(nec, [
      { unit: SKELETON, count: 10 }, { unit: GOBLIN, count: 10 },
    ], [{ unit: OGRE, count: 3 }]));
    const skel = s.units.find(u => u.definition.name === 'Skeleton')!;
    const gob = s.units.find(u => u.definition.name === 'Goblin' && u.side === 'player')!;

    // Wound both.
    s = {
      ...s,
      units: s.units.map(u =>
        u.id === skel.id || u.id === gob.id ? { ...u, count: u.count - 4 } : u
      ),
    };

    // Goblins aren't undead: rejected.
    const rejected = applyAction(s, { type: 'cast', spell: 'raise_dead', targetId: gob.id });
    expect(rejected.hero.mana).toBe(s.hero.mana);

    const next = applyAction(s, { type: 'cast', spell: 'raise_dead', targetId: skel.id });
    const raised = next.units.find(u => u.id === skel.id)!;
    // 20 + 10·5 = 70 HP of Skeletons (hp 6) → 11 creatures, capped at 4 missing.
    expect(raised.count).toBe(10);
    expect(next.hero.mana).toBe((s.hero.mana ?? 0) - 5);
  });

  it('wasp swarm damages and slows the target', () => {
    const rng = heroOf('ranger');
    const s = toHeroTurn(battleFor(rng, [{ unit: GOBLIN, count: 10 }], [{ unit: OGRE, count: 30 }]));
    const enemy = s.units.find(u => u.side === 'enemy')!;

    // The penalty is applied by the resolver but legitimately clears at the
    // next round boundary — assert the raw resolution, then the logged effect.
    const { units } = SPELL_DEFS.wasp_swarm.resolve(s, s.currentUnitId!, enemy.id, mulberry32(1));
    expect(units.find(u => u.id === enemy.id)!.speedPenalty).toBe(2);

    const next = applyAction(s, { type: 'cast', spell: 'wasp_swarm', targetId: enemy.id });
    expect(next.log.some(e => e.type === 'status' && e.data.effect === 'slow')).toBe(true);
    expect(next.hero.mana).toBe((s.hero.mana ?? 0) - 3);
  });

  it('immolate deals 5 damage and applies a level-scaled burn', () => {
    const dem = heroOf('demon');
    const s = toHeroTurn(battleFor(dem, [{ unit: GOBLIN, count: 10 }], [{ unit: OGRE, count: 30 }]));
    const enemy = s.units.find(u => u.side === 'enemy')!;

    const next = applyAction(s, { type: 'cast', spell: 'immolate', targetId: enemy.id });
    const burning = next.units.find(u => u.id === enemy.id)!;
    expect(burning.burnDamage).toBe(4 + 2 * dem.level); // 14, no Fire Magic on a bare hero
    expect(burning.burnRoundsLeft).toBe(2);
    expect(next.hero.mana).toBe((s.hero.mana ?? 0) - 4);
  });

  it('spell kills are settled through handleDeath (grid cell cleared)', () => {
    const wiz = heroOf('wizard', 10);
    const s = toHeroTurn(battleFor(wiz, [{ unit: GOBLIN, count: 10 }], [{ unit: GOBLIN, count: 1 }]));
    const enemy = s.units.find(u => u.side === 'enemy')!;

    const next = applyAction(s, { type: 'cast', spell: 'fireball', targetId: enemy.id });
    const dead = next.units.find(u => u.id === enemy.id)!;
    expect(dead.count).toBe(0);
    expect(next.grid.cells[enemy.pos.row][enemy.pos.col].occupantId).toBeNull();
    expect(next.log.some(e => e.type === 'death' && e.data.unitId === enemy.id)).toBe(true);
    expect(next.result).toBe('player_wins');
  });

  it('registry sanity: ids match keys, uniques are level-3, costs positive', () => {
    for (const [key, def] of Object.entries(SPELL_DEFS)) {
      expect(def.id).toBe(key);
      expect(def.cost).toBeGreaterThan(0);
      if (def.factions !== 'all') {
        expect(def.factions).toHaveLength(1);
        expect(def.unlockLevel).toBe(3);
      }
    }
  });
});
