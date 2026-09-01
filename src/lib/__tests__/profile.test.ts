import { describe, it, expect, beforeEach } from 'vitest';
import { loadProfile, saveProfile, saveBattleSpeed, clearProfile, DEFAULT_PROFILE } from '../profile';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => store.clear());

describe('profile', () => {
  it('falls back to defaults when nothing is saved', () => {
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  it('backfills fields missing from an older save', () => {
    store.set('warlords:profile', JSON.stringify({ name: 'Bev', audio: false }));
    expect(loadProfile()).toEqual({
      name: 'Bev',
      audio: false,
      reducedMotion: false,
      battleSpeed: 'normal',
    });
  });

  it('round-trips a saved battle speed', () => {
    saveBattleSpeed('fast');
    expect(loadProfile().battleSpeed).toBe('fast');
  });

  it('leaves the rest of the profile alone when only the speed changes', () => {
    saveProfile({ name: 'Bev', audio: false, reducedMotion: true, battleSpeed: 'normal' });
    saveBattleSpeed('slow');
    expect(loadProfile()).toEqual({
      name: 'Bev',
      audio: false,
      reducedMotion: true,
      battleSpeed: 'slow',
    });
  });

  it('clears back to defaults', () => {
    saveBattleSpeed('slow');
    clearProfile();
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
  });
});
