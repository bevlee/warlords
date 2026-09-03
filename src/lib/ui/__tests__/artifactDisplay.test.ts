import { describe, expect, it } from 'vitest';
import { initBattle } from '$lib/engine/battle';
import { ZOMBIE } from '$lib/engine/necromancer';
import { ORC } from '$lib/engine/barbarian';
import type { Hero } from '$lib/engine/types';
import { artifactInteractionsFor, artifactModifierSources } from '../artifactDisplay';

const hero: Hero = { class: 'necromancer', level: 1, xp: 0, attack: 1, defense: 1, statPoints: 0, factionSkills: [] };

describe('artifactInteractionsFor', () => {
  it('describes Plague Bell as a Zombie interaction without equipping it', () => {
    const state = initBattle([{ unit: ZOMBIE, count: 10 }], [{ unit: ORC, count: 10 }], hero, 3);
    const zombie = state.units.find(unit => unit.definition.name === 'Zombie')!;

    expect(artifactInteractionsFor(zombie, ['plague_bell'])).toEqual([{
      id: 'plague_bell',
      name: 'Plague Bell',
      description: 'Gravewright’s Grimoire raises twice as many creatures from enemy stacks carrying [[infecting_strike]].',
    }]);
  });

  it('does not attach an unrelated army artifact to the selected unit', () => {
    const state = initBattle([{ unit: ZOMBIE, count: 10 }], [{ unit: ORC, count: 10 }], hero, 3);
    const zombie = state.units.find(unit => unit.definition.name === 'Zombie')!;

    expect(artifactInteractionsFor(zombie, ['funeral_drum'])).toEqual([]);
  });

  it('attaches only genuine numeric bonuses to every unit', () => {
    expect(artifactModifierSources(['plague_bell'])).toEqual([]);
    expect(artifactModifierSources(['blade_of_the_vanguard'])).toEqual([{
      id: 'item:blade_of_the_vanguard',
      label: 'Blade of the Vanguard',
      stats: { attack: 4 },
      stacks: 1,
    }]);
  });
});
