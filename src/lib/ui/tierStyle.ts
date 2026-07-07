import type { UnitDef } from '$lib/engine/types';

/** Rarity-style ramp for unit tiers 1–7: muted commons, glowing top ends.
    Literal Tailwind class strings so the JIT compiler sees them. */
export interface TierStyle {
  /** Rarity word shown on cards ("Common", "Legendary", …). */
  label: string;
  /** Text color for the unit name / tier chip. */
  text: string;
  /** Border color for cards and rows. */
  border: string;
  /** Card-level glow; empty for low tiers so commons stay muted. */
  glow: string;
  /** Small ring for inline sprites (army list). */
  ring: string;
}

export const TIER_STYLE: Record<UnitDef['tier'], TierStyle> = {
  1: {
    label: 'Common',
    text: 'text-slate-300',
    border: 'border-slate-500',
    glow: '',
    ring: 'ring-slate-500/70',
  },
  2: {
    label: 'Sturdy',
    text: 'text-emerald-300',
    border: 'border-emerald-500',
    glow: '',
    ring: 'ring-emerald-500/70',
  },
  3: {
    label: 'Uncommon',
    text: 'text-sky-300',
    border: 'border-sky-400',
    glow: '',
    ring: 'ring-sky-400/70',
  },
  4: {
    label: 'Rare',
    text: 'text-violet-300',
    border: 'border-violet-400',
    glow: 'shadow-[0_0_10px_rgba(167,139,250,0.35)]',
    ring: 'ring-violet-400/80',
  },
  5: {
    label: 'Exotic',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-400',
    glow: 'shadow-[0_0_12px_rgba(232,121,249,0.4)]',
    ring: 'ring-fuchsia-400/80',
  },
  6: {
    label: 'Mythic',
    text: 'text-orange-300',
    border: 'border-orange-400',
    glow: 'shadow-[0_0_14px_rgba(251,146,60,0.5)]',
    ring: 'ring-orange-400/90',
  },
  7: {
    label: 'Legendary',
    text: 'text-amber-300',
    border: 'border-amber-300',
    glow: 'shadow-[0_0_18px_rgba(252,211,77,0.55)]',
    ring: 'ring-amber-300',
  },
};
