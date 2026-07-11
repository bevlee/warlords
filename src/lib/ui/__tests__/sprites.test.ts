import { describe, it, expect } from 'vitest';
import { unitSlug, sheetFor, POSE_ROW, POSES, FRAMES } from '../sprites';
import { FACTION_UNITS } from '$lib/engine/factions';

describe('unitSlug', () => {
  it('lowercases and dashes multi-word names', () => {
    expect(unitSlug('Goblin')).toBe('goblin');
    expect(unitSlug('Wolf Rider')).toBe('wolf-rider');
    expect(unitSlug('Black Knight')).toBe('black-knight');
  });
});

describe('sheetFor', () => {
  it('resolves a spritesheet for every unit in every faction roster', () => {
    for (const units of Object.values(FACTION_UNITS)) {
      for (const unit of units) {
        expect(sheetFor(unit.name), `missing sheet for ${unit.name}`).toBeTruthy();
      }
    }
  });

  it('resolves the non-roster battlefield sprites', () => {
    expect(sheetFor('Hero')).toBeTruthy();
    expect(sheetFor('Rock')).toBeTruthy();
  });

  it('returns undefined for unknown names', () => {
    expect(sheetFor('Definitely Not A Unit')).toBeUndefined();
  });
});

describe('sheet layout', () => {
  it('maps each pose to a distinct row', () => {
    const rows = POSES.map((p) => POSE_ROW[p]);
    expect(new Set(rows).size).toBe(POSES.length);
    for (const row of rows) {
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(POSES.length);
    }
  });

  it('idle is the first row so static consumers get it by default', () => {
    expect(POSE_ROW.idle).toBe(0);
  });

  it('has a positive frame count', () => {
    expect(FRAMES).toBeGreaterThan(1);
  });
});
