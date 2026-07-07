import { describe, it, expect } from 'vitest';
import {
  newCampaign,
  nodeStatus,
  advanceCampaign,
  totalChapters,
  encountersInChapter,
  currentEncounter,
} from '../campaignStore';
import { ENCOUNTERS, CHAPTER_TITLES, generateEnemyArmy } from '../encounters';

describe('campaign state', () => {
  it('starts at chapter 1, encounter 0, not completed', () => {
    expect(newCampaign('hero-1')).toEqual({ chapter: 1, encounter: 0, completed: false, heroSaveId: 'hero-1' });
  });

  it('marks only the current encounter as available', () => {
    const state = newCampaign();
    expect(nodeStatus(state, 1, 0)).toBe('available');
    expect(nodeStatus(state, 1, 1)).toBe('locked');
    expect(nodeStatus(state, 2, 0)).toBe('locked');
  });

  it('advances within a chapter after a win', () => {
    const state = newCampaign();
    const next = advanceCampaign(state);
    expect(next).toEqual({ ...state, encounter: 1 });
    expect(nodeStatus(next, 1, 0)).toBe('completed');
    expect(nodeStatus(next, 1, 1)).toBe('available');
  });

  it("rolls into the next chapter after the current one's last encounter", () => {
    let state = newCampaign();
    const chapter1Count = encountersInChapter(1).length;
    for (let i = 0; i < chapter1Count; i++) state = advanceCampaign(state);
    expect(state.chapter).toBe(2);
    expect(state.encounter).toBe(0);
  });

  it("marks the campaign completed after the final chapter's last encounter", () => {
    let state = newCampaign();
    for (let chapter = 1; chapter <= totalChapters(); chapter++) {
      const count = encountersInChapter(chapter).length;
      for (let i = 0; i < count; i++) state = advanceCampaign(state);
    }
    expect(state.completed).toBe(true);
    expect(state.chapter).toBe(totalChapters());
  });

  it('exposes the current encounter for a given state', () => {
    const state = newCampaign();
    expect(currentEncounter(state)?.id).toBe(encountersInChapter(1)[0].id);
  });

  it('every encounter has a chapter title', () => {
    for (const encounter of ENCOUNTERS) {
      expect(CHAPTER_TITLES[encounter.chapter]).toBeDefined();
    }
  });
});

describe('generateEnemyArmy', () => {
  it('is deterministic for the same encounter and player level', () => {
    const encounter = ENCOUNTERS[0];
    expect(generateEnemyArmy(encounter, 3)).toEqual(generateEnemyArmy(encounter, 3));
  });

  it("only fields units from the encounter's allowed tiers", () => {
    const encounter = ENCOUNTERS.find(e => e.id === 'ch3-1')!;
    const army = generateEnemyArmy(encounter, 5);
    expect(army.length).toBeGreaterThan(0);
    for (const slot of army) {
      expect(encounter.enemyTiers).toContain(slot.unit.tier);
    }
  });

  it('scales army value up with player level', () => {
    const encounter = ENCOUNTERS[ENCOUNTERS.length - 1];
    const totalHp = (army: ReturnType<typeof generateEnemyArmy>) =>
      army.reduce((sum, s) => sum + s.count * s.unit.hp, 0);
    expect(totalHp(generateEnemyArmy(encounter, 20))).toBeGreaterThan(totalHp(generateEnemyArmy(encounter, 1)));
  });

  it('fields a non-empty army for every encounter in the campaign', () => {
    for (const encounter of ENCOUNTERS) {
      expect(generateEnemyArmy(encounter, 5).length).toBeGreaterThan(0);
    }
  });
});
