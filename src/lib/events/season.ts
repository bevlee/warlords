/** Seasonal event data.
 *
 *  This is a STUB. Real seasons are scheduled server-side and co-op play needs
 *  matchmaking + a shared-battle backend (see the design plan's "Out of
 *  scope"). Everything here is a typed, in-memory stand-in so the hub, the
 *  events screen, and party composition are fully buildable and testable
 *  without a backend. Swap this module for a real events service later — the
 *  shapes below are the contract the UI depends on. */

export interface EventModifier {
  icon: string;
  label: string;
}

export interface EventReward {
  icon: string;
  name: string;
  note: string;
}

export interface EventSeason {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Epoch ms the season closes. */
  endsAt: number;
  coopMax: number;
  waves: number;
  modifiers: EventModifier[];
  reward: EventReward;
}

export interface PastEvent {
  slug: string;
  name: string;
  /** Epoch ms the season closed. */
  endedAt: number;
  reward: EventReward;
  claimed: boolean;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** The live season, or null between seasons. Anchored relative to now so the
 *  countdown always reads as active in the stub. */
export function getCurrentSeason(): EventSeason | null {
  return {
    slug: 'frostfall-siege',
    name: 'Frostfall Siege',
    tagline: 'Hold the Winter Gate',
    description:
      'Hold the Winter Gate against three waves of the Rime Legion. Frostbite chills any unit that ends its turn in the open — keep your warband moving.',
    endsAt: Date.now() + 6 * DAY + 14 * HOUR + 22 * MINUTE,
    coopMax: 4,
    waves: 3,
    modifiers: [
      { icon: '❄️', label: 'Frostbite aura' },
      { icon: '🏰', label: 'Fortified gate' },
      { icon: '🌊', label: '3 waves' },
    ],
    reward: { icon: '🗡️', name: 'Rimeblade', note: 'Clear all waves this week to claim' },
  };
}

/** Finished seasons, newest first — the archive behind the "Past events" link. */
export function getPastEvents(): PastEvent[] {
  return [
    {
      slug: 'harvest-warding',
      name: 'Harvest Warding',
      endedAt: Date.now() - 9 * DAY,
      reward: { icon: '🛡️', name: 'Wardstone Aegis', note: 'Claimed' },
      claimed: true,
    },
    {
      slug: 'emberfall-raid',
      name: 'Emberfall Raid',
      endedAt: Date.now() - 37 * DAY,
      reward: { icon: '🔥', name: 'Cinderbrand', note: 'Not claimed' },
      claimed: false,
    },
  ];
}

/** Resolve a slug to the live season or a past event. */
export function getEventBySlug(slug: string): { current: EventSeason } | { past: PastEvent } | null {
  const current = getCurrentSeason();
  if (current && current.slug === slug) return { current };
  const past = getPastEvents().find((e) => e.slug === slug);
  return past ? { past } : null;
}
