/** Player-facing account + client settings, separate from the in-game hero.
 *
 *  These are local client preferences (display name, audio, reduced motion),
 *  so they live in localStorage rather than the server save API — no hero
 *  progression depends on them, and they should apply instantly on the device
 *  without a round-trip. */
export interface Profile {
  name: string;
  audio: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_PROFILE: Profile = { name: 'Warlord', audio: true, reducedMotion: false };

const KEY = 'warlords:profile';

export function loadProfile(): Profile {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PROFILE };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: Profile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
