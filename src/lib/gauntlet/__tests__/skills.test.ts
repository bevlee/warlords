import { describe, it, expect } from 'vitest';
import { UNIT_SKILLS, SKILL_IDS, skillDraftOptions, applyUnitSkills, type SkillId } from '../skills';
import { newRun } from '../run';
import { GOBLIN, WOLF_RIDER } from '../../engine/barbarian';

describe('catalog', () => {
  it('has the five launch skills with names and descriptions', () => {
    expect(new Set(SKILL_IDS)).toEqual(
      new Set(['life_drain', 'double_strike', 'no_retaliation', 'fleet_footwork', 'bravery'])
    );
    for (const id of SKILL_IDS) {
      expect(UNIT_SKILLS[id].name).toBeTruthy();
      expect(UNIT_SKILLS[id].description).toBeTruthy();
    }
  });
});

describe('skillDraftOptions', () => {
  it('offers 3 distinct skills, deterministic per run state', () => {
    const run = { ...newRun('barbarian', 42), battlesWon: 2 };
    const a = skillDraftOptions(run);
    expect(a).toEqual(skillDraftOptions(run));
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
  });

  it('excludes a skill every army unit already has', () => {
    const base = newRun('barbarian', 7);
    const run = {
      ...base,
      battlesWon: 5,
      unitSkills: Object.fromEntries(base.army.map(s => [s.unit.name, ['bravery' as SkillId]])),
    };
    for (let seed = 0; seed < 100; seed++) {
      expect(skillDraftOptions({ ...run, seed })).not.toContain('bravery');
    }
  });
});

describe('applyUnitSkills', () => {
  it('merges granted abilities into matching units, adds fleet speed, stamps provenance', () => {
    const army = [{ unit: GOBLIN, count: 10 }, { unit: WOLF_RIDER, count: 5 }];
    const out = applyUnitSkills(army, { Goblin: ['fleet_footwork', 'life_drain'] });
    const g = out.find(s => s.unit.name === 'Goblin')!;
    expect(g.unit.abilities).toContain('fleet_footwork');
    expect(g.unit.abilities).toContain('life_drain');
    expect(g.unit.speed).toBe(GOBLIN.speed + 1);
    // Provenance for the UI: granted skills render in a different color than
    // the unit's base abilities.
    expect(g.unit.grantedAbilities).toEqual(['fleet_footwork', 'life_drain']);
    expect(out.find(s => s.unit.name === 'Wolf Rider')!.unit).toBe(WOLF_RIDER); // untouched
  });

  it('is idempotent — reapplying never stacks speed or duplicates abilities', () => {
    const army = [{ unit: GOBLIN, count: 10 }];
    const once = applyUnitSkills(army, { Goblin: ['fleet_footwork'] });
    const twice = applyUnitSkills(once, { Goblin: ['fleet_footwork'] });
    expect(twice[0].unit.speed).toBe(GOBLIN.speed + 1);
    expect(twice[0].unit.abilities.filter(a => a === 'fleet_footwork')).toHaveLength(1);
    expect(twice[0].unit.grantedAbilities).toEqual(['fleet_footwork']);
  });
});
