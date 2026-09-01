import { describe, it, expect } from 'vitest';
import { KNIGHT_UNITS } from '../knight';
import { WIZARD_UNITS } from '../wizard';
import { BARBARIAN_UNITS } from '../barbarian';
import { FACTION_UNITS, FACTION_INFO } from '../factions';
import { UNIT_COSTS } from '../recruit';

describe('Knight roster', () => {
  it('has 8 units covering all 7 tiers in non-decreasing order', () => {
    expect(KNIGHT_UNITS).toHaveLength(8);
    const tiers = KNIGHT_UNITS.map(u => u.tier);
    expect(new Set(tiers)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    KNIGHT_UNITS.forEach(u => {
      expect(u.hp).toBeGreaterThan(0);
      expect(u.minDamage).toBeGreaterThan(0);
      expect(u.maxDamage).toBeGreaterThanOrEqual(u.minDamage);
    });
  });

  it('gives Cavalier and Champion distinct cavalry identities', () => {
    const cavalier = KNIGHT_UNITS.find(u => u.name === 'Cavalier')!;
    const champion = KNIGHT_UNITS.find(u => u.name === 'Champion')!;
    expect(cavalier.abilities).toEqual(expect.arrayContaining(['gallop', 'ride_by_attack']));
    expect(cavalier.abilities).not.toContain('grand_joust');
    expect(champion.abilities).toEqual(expect.arrayContaining(['grand_joust', 'overrun']));
    expect(champion.abilities).not.toContain('ride_by_attack');
  });
});

describe('Wizard roster', () => {
  it('has 8 units covering all 7 tiers in non-decreasing order', () => {
    expect(WIZARD_UNITS).toHaveLength(8);
    const tiers = WIZARD_UNITS.map(u => u.tier);
    expect(new Set(tiers)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    WIZARD_UNITS.forEach(u => expect(u.hp).toBeGreaterThan(0));
  });

  it('replaces the legacy Gorgon with the corrosive Bilehorn', () => {
    expect(WIZARD_UNITS.some(u => u.name === 'Gorgon')).toBe(false);
    const bilehorn = WIZARD_UNITS.find(u => u.name === 'Bilehorn')!;
    expect(bilehorn.abilities).toEqual(expect.arrayContaining(['caustic_breath', 'corrosive_carapace']));
    expect(bilehorn.abilities).not.toContain('death_stare');
  });
});

describe('faction registry', () => {
  it('maps every faction class to its roster', () => {
    expect(FACTION_UNITS.barbarian).toBe(BARBARIAN_UNITS);
    expect(FACTION_UNITS.knight).toBe(KNIGHT_UNITS);
    expect(FACTION_UNITS.wizard).toBe(WIZARD_UNITS);
  });

  it('has display info for every faction', () => {
    for (const cls of ['barbarian', 'knight', 'wizard'] as const) {
      expect(FACTION_INFO[cls].name).toBeTruthy();
      expect(FACTION_INFO[cls].description).toBeTruthy();
    }
  });
});

describe('recruiting costs', () => {
  it('prices every knight and wizard unit', () => {
    for (const u of [...KNIGHT_UNITS, ...WIZARD_UNITS]) {
      expect(UNIT_COSTS[u.name]).toBeGreaterThan(0);
    }
  });
});
