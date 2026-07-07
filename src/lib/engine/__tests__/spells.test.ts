import { describe, it, expect } from 'vitest';
import { initBattle, applyAction } from '../battle';
import { calculateDamage } from '../combat';
import { mulberry32 } from '../rng';
import { GOBLIN, OGRE, WOLF_RIDER } from '../barbarian';
import type { BattleState, Hero } from '../types';

const hero: Hero = { class: 'barbarian', level: 2, xp: 0, attack: 4, defense: 2, statPoints: 0 };

function newBattle(seed = 11): BattleState {
  return initBattle(
    [{ unit: GOBLIN, count: 10 }],
    [{ unit: OGRE, count: 3 }],
    hero,
    seed
  );
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
