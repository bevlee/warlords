/** Player-facing account + client settings, separate from the in-game hero.
 *
 *  These are local client preferences (display name, audio, reduced motion),
 *  so they live in localStorage rather than the server save API — no hero
 *  progression depends on them, and they should apply instantly on the device
 *  without a round-trip. */
/** How fast battles play out. Chosen once — from the home cog or the battle
 *  screen's own cog — and remembered, so it never has to be set per battle. */
export type BattleSpeed = 'slow' | 'normal' | 'fast';

export interface Profile {
  name: string;
  audio: boolean;
  reducedMotion: boolean;
  battleSpeed: BattleSpeed;
}

export const DEFAULT_PROFILE: Profile = {
  name: 'Warlord',
  audio: true,
  reducedMotion: false,
  battleSpeed: 'normal',
};

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

/** Write only the battle speed, leaving the rest of the profile alone — the
 *  speed is changed from screens that know nothing else about the profile. */
export function saveBattleSpeed(speed: BattleSpeed): void {
  saveProfile({ ...loadProfile(), battleSpeed: speed });
}

export function clearProfile(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
