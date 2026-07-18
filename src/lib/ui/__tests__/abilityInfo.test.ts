import { describe, it, expect } from 'vitest';
import { abilityInfo } from '../abilities';

describe('abilityInfo with levels', () => {
  it('suffixes leveled abilities with roman numerals and shows the magnitude', () => {
    expect(abilityInfo('life_drain', 3)).toEqual({
      label: 'Lifesteal III',
      description: 'Heals 30% of the damage this stack deals.',
    });
    expect(abilityInfo('defense_reduction', 4).label).toBe('Defense reduction IV');
    expect(abilityInfo('defense_reduction', 4).description).toContain('20%');
    expect(abilityInfo('bravery', 2)).toEqual({ label: 'Bravery II', description: '+2 morale.' });
    expect(abilityInfo('fleet_footwork', 3)).toEqual({ label: 'Fleet footwork III', description: '+3 speed.' });
  });

  it('level 1 leveled abilities still show the magnitude but no numeral clutter', () => {
    expect(abilityInfo('bravery', 1)).toEqual({ label: 'Bravery', description: '+1 morale.' });
  });

  it('unique abilities ignore the level argument', () => {
    const plain = abilityInfo('double_strike');
    expect(abilityInfo('double_strike', 1)).toEqual(plain);
    expect(plain.label).toBe('Double strike');
  });

  it('without a level, leveled abilities fall back to their static entry', () => {
    expect(abilityInfo('life_drain').label).toBeTruthy();
  });
});
