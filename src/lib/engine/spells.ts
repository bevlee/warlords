import type { BattleEvent, BattleState, FactionClass, Hero, SpellId, UnitStack } from './types';
import type { Rng } from './rng';
import type { DamagePreview } from './selectors';
import { applyDamage, reviveHeal } from './combat';
import { chebyshevDistance } from './grid';
import { applyFireMagicBonus, getSorceryMultiplier } from './factionSkills';
import { NECROMANCER_UNITS } from './necromancer';

export interface SpellCastResult {
  units: UnitStack[];    // full replacement array; deaths are settled by the dispatcher
  events: BattleEvent[]; // log entries to append
}

export interface SpellDef {
  id: SpellId;
  name: string;
  glyph: string;
  ring: string; // spellbook button styling
  cost: number;
  target: 'enemy' | 'friendly';
  factions: FactionClass[] | 'all';
  unlockLevel: number;
  targetHint: string;
  effectLine(hero: Hero): string;
  description(hero: Hero): string;
  /** Extra targeting rule beyond the side check (e.g. "damaged undead only"). */
  canTarget?(hero: Hero, target: UnitStack): boolean;
  /** Damage forecast for the aiming tooltip; undefined/null for pure buffs. */
  preview?(hero: Hero, target: UnitStack): DamagePreview | null;
  resolve(state: BattleState, casterId: string, targetId: string, rng: Rng): SpellCastResult;
}

/** Lightning is true damage: flat, level-scaled, ignores attack/defense. */
export function lightningDamage(level: number): number {
  return 12 + 8 * level;
}

const fireballDamage = (hero: Hero) => Math.round((8 + 4 * hero.level) * getSorceryMultiplier(hero));
const waspDamage = (hero: Hero) => Math.round((6 + 3 * hero.level) * getSorceryMultiplier(hero));
const healAmount = (hero: Hero) => 15 + 5 * hero.level;
const raiseAmount = (hero: Hero) => 20 + 10 * hero.level;
const immolateBurn = (hero: Hero) => applyFireMagicBonus(4 + 2 * hero.level, hero);

const damagePreviewOf = (damage: number, target: UnitStack): DamagePreview => {
  const { killed } = applyDamage(target, damage);
  return { min: damage, max: damage, killsMin: killed, killsMax: killed };
};

const patch = (units: UnitStack[], id: string, f: (u: UnitStack) => UnitStack) =>
  units.map(u => (u.id === id ? f(u) : u));

const isDamaged = (u: UnitStack) =>
  u.hp < u.definition.hp || u.count < (u.startCount ?? u.count);

const castEvent = (
  spell: SpellId,
  casterId: string,
  targetId: string,
  extra: Record<string, unknown> = {}
): BattleEvent => ({ type: 'cast', data: { spell, casterId, targetId, ...extra } });

export const SPELL_DEFS: Record<SpellId, SpellDef> = {
  lightning: {
    id: 'lightning', name: 'Lightning', glyph: '⚡', ring: 'ring-sky-400 bg-sky-100',
    cost: 3, target: 'enemy', factions: 'all', unlockLevel: 1, targetHint: 'Enemy stack',
    effectLine: h => `${Math.round(lightningDamage(h.level) * getSorceryMultiplier(h))} true damage`,
    description: h =>
      `A bolt of raw lightning strikes one enemy stack for ${Math.round(lightningDamage(h.level) * getSorceryMultiplier(h))} damage ` +
      `(12 + 8 × hero level). True damage: ignores attack, defense, and buffs. No retaliation.`,
    preview: (h, t) => damagePreviewOf(Math.round(lightningDamage(h.level) * getSorceryMultiplier(h)), t),
    resolve(s, casterId, targetId) {
      const damage = Math.round(lightningDamage(s.hero.level) * getSorceryMultiplier(s.hero));
      const target = s.units.find(u => u.id === targetId)!;
      const { killed, remaining } = applyDamage(target, damage);
      return {
        units: patch(s.units, targetId, () => remaining),
        events: [castEvent('lightning', casterId, targetId, { damage, killed })],
      };
    },
  },

  bloodlust: {
    id: 'bloodlust', name: 'Bloodlust', glyph: '💪', ring: 'ring-red-400 bg-red-100',
    cost: 2, target: 'friendly', factions: 'all', unlockLevel: 1, targetHint: 'Friendly stack',
    effectLine: () => '+4 attack',
    description: () =>
      'Fills a friendly stack with battle fury: +4 attack for the rest of the battle. ' +
      'Casting it again on the same stack adds another +4.',
    resolve(s, casterId, targetId) {
      return {
        units: patch(s.units, targetId, u => ({ ...u, attackBuff: (u.attackBuff ?? 0) + 4 })),
        events: [castEvent('bloodlust', casterId, targetId)],
      };
    },
  },

  stoneskin: {
    id: 'stoneskin', name: 'Stoneskin', glyph: '🗿', ring: 'ring-stone-400 bg-stone-200',
    cost: 2, target: 'friendly', factions: 'all', unlockLevel: 1, targetHint: 'Friendly stack',
    effectLine: () => '+4 defense',
    description: () =>
      'Turns a friendly stack’s skin to granite: +4 defense for the rest of the battle. ' +
      'Casting it again on the same stack adds another +4.',
    resolve(s, casterId, targetId) {
      return {
        units: patch(s.units, targetId, u => ({ ...u, defenseBuff: (u.defenseBuff ?? 0) + 4 })),
        events: [castEvent('stoneskin', casterId, targetId)],
      };
    },
  },

  battle_cry: {
    id: 'battle_cry', name: 'Battle Cry', glyph: '📣', ring: 'ring-orange-400 bg-orange-100',
    cost: 4, target: 'friendly', factions: ['barbarian'], unlockLevel: 3, targetHint: 'Your whole army',
    effectLine: () => '+2 attack, +1 morale to all',
    description: () =>
      'A war-howl that stirs the whole horde: every friendly stack gains +2 attack for ' +
      'the rest of the battle and +1 morale.',
    resolve(s, casterId, targetId) {
      const units = s.units.map(u =>
        u.side === 'player' && !u.isHero && u.count > 0
          ? { ...u, attackBuff: (u.attackBuff ?? 0) + 2, morale: Math.min(3, u.morale + 1) }
          : u
      );
      return { units, events: [castEvent('battle_cry', casterId, targetId)] };
    },
  },

  healing_light: {
    id: 'healing_light', name: 'Healing Light', glyph: '✨', ring: 'ring-amber-300 bg-amber-50',
    cost: 4, target: 'friendly', factions: ['knight'], unlockLevel: 3, targetHint: 'Damaged friendly stack',
    effectLine: h => `heal ${healAmount(h)} HP, revives the fallen`,
    description: h =>
      `A shaft of consecrated light restores ${healAmount(h)} HP (15 + 5 × hero level) to a ` +
      `friendly stack, reviving fallen creatures up to its starting count.`,
    canTarget: (_h, t) => isDamaged(t),
    resolve(s, casterId, targetId) {
      const target = s.units.find(u => u.id === targetId)!;
      const { healed, revived, remaining } = reviveHeal(target, healAmount(s.hero));
      return {
        units: patch(s.units, targetId, () => remaining),
        events: [castEvent('healing_light', casterId, targetId, { healed, revived })],
      };
    },
  },

  fireball: {
    id: 'fireball', name: 'Fireball', glyph: '🔥', ring: 'ring-rose-400 bg-rose-100',
    cost: 5, target: 'enemy', factions: ['wizard'], unlockLevel: 3, targetHint: 'Enemy stack + neighbours',
    effectLine: h => `${fireballDamage(h)} dmg + half splash + burn`,
    description: h =>
      `A roaring sphere of flame deals ${fireballDamage(h)} damage (8 + 4 × hero level, boosted by ` +
      `Sorcery) to the target, half that to adjacent enemies, and sets the target burning for 2 rounds.`,
    preview: (h, t) => damagePreviewOf(fireballDamage(h), t),
    resolve(s, casterId, targetId) {
      const damage = fireballDamage(s.hero);
      const target = s.units.find(u => u.id === targetId)!;
      const events: BattleEvent[] = [];

      const { killed, remaining } = applyDamage(target, damage);
      let units = patch(s.units, targetId, () => remaining);
      events.push(castEvent('fireball', casterId, targetId, { damage, killed }));

      const splash = Math.max(1, Math.round(damage / 2));
      for (const victim of s.units) {
        if (victim.id === targetId || victim.side !== 'enemy' || victim.count === 0 || victim.isHero) continue;
        if (chebyshevDistance(victim.pos, target.pos) !== 1) continue;
        const current = units.find(u => u.id === victim.id)!;
        const hit = applyDamage(current, splash);
        units = patch(units, victim.id, () => hit.remaining);
        events.push(castEvent('fireball', casterId, victim.id, { damage: splash, killed: hit.killed, splash: true }));
      }

      const burned = units.find(u => u.id === targetId)!;
      if (burned.count > 0) {
        units = patch(units, targetId, u => ({ ...u, burnDamage: 3, burnRoundsLeft: 2 }));
        events.push({ type: 'status', data: { effect: 'burn_apply', unitId: targetId } });
      }
      return { units, events };
    },
  },

  raise_dead: {
    id: 'raise_dead', name: 'Raise Dead', glyph: '💀', ring: 'ring-emerald-400 bg-emerald-100',
    cost: 5, target: 'friendly', factions: ['necromancer'], unlockLevel: 3, targetHint: 'Damaged undead stack',
    effectLine: h => `restore ${raiseAmount(h)} HP of undead`,
    description: h =>
      `Necrotic energy knits bone and sinew: restores ${raiseAmount(h)} HP (20 + 10 × hero level) ` +
      `to a friendly undead stack, reviving creatures up to its starting count.`,
    canTarget: (_h, t) =>
      NECROMANCER_UNITS.some(u => u.name === t.definition.name) && isDamaged(t),
    resolve(s, casterId, targetId) {
      const target = s.units.find(u => u.id === targetId)!;
      const { healed, revived, remaining } = reviveHeal(target, raiseAmount(s.hero));
      return {
        units: patch(s.units, targetId, () => remaining),
        events: [castEvent('raise_dead', casterId, targetId, { healed, revived })],
      };
    },
  },

  wasp_swarm: {
    id: 'wasp_swarm', name: 'Wasp Swarm', glyph: '🐝', ring: 'ring-lime-400 bg-lime-100',
    cost: 3, target: 'enemy', factions: ['ranger'], unlockLevel: 3, targetHint: 'Enemy stack',
    effectLine: h => `${waspDamage(h)} dmg, −2 speed`,
    description: h =>
      `A furious cloud of stinging wasps deals ${waspDamage(h)} damage (6 + 3 × hero level) and ` +
      `slows the target by 2 movement until the next round.`,
    preview: (h, t) => damagePreviewOf(waspDamage(h), t),
    resolve(s, casterId, targetId) {
      const damage = waspDamage(s.hero);
      const target = s.units.find(u => u.id === targetId)!;
      const { killed, remaining } = applyDamage(target, damage);
      let units = patch(s.units, targetId, () => remaining);
      const events: BattleEvent[] = [castEvent('wasp_swarm', casterId, targetId, { damage, killed })];
      if (remaining.count > 0) {
        units = patch(units, targetId, u => ({ ...u, speedPenalty: (u.speedPenalty ?? 0) + 2 }));
        events.push({ type: 'status', data: { effect: 'slow', unitId: targetId } });
      }
      return { units, events };
    },
  },

  immolate: {
    id: 'immolate', name: 'Immolate', glyph: '☄️', ring: 'ring-red-500 bg-red-200',
    cost: 4, target: 'enemy', factions: ['demon'], unlockLevel: 3, targetHint: 'Enemy stack',
    effectLine: h => `5 dmg + burn ${immolateBurn(h)}/turn`,
    description: h =>
      `Hellfire engulfs the target: 5 immediate damage, then ${immolateBurn(h)} burn damage ` +
      `(4 + 2 × hero level, boosted by Fire Magic) at the start of each of its next 2 turns.`,
    preview: (_h, t) => damagePreviewOf(5, t),
    resolve(s, casterId, targetId) {
      const target = s.units.find(u => u.id === targetId)!;
      const { killed, remaining } = applyDamage(target, 5);
      let units = patch(s.units, targetId, () => remaining);
      const events: BattleEvent[] = [castEvent('immolate', casterId, targetId, { damage: 5, killed })];
      if (remaining.count > 0) {
        units = patch(units, targetId, u => ({ ...u, burnDamage: immolateBurn(s.hero), burnRoundsLeft: 2 }));
        events.push({ type: 'status', data: { effect: 'burn_apply', unitId: targetId } });
      }
      return { units, events };
    },
  },
};

export function getSpellDef(id: SpellId): SpellDef | undefined {
  return SPELL_DEFS[id];
}

/** Spells this hero can cast: shared spells plus their faction's unique, level-gated. */
export function getKnownSpells(hero: Hero): SpellDef[] {
  return Object.values(SPELL_DEFS).filter(
    d => (d.factions === 'all' || d.factions.includes(hero.class)) && hero.level >= d.unlockLevel
  );
}

/** Legacy cost/friendliness table, kept for callers that predate the registry. */
export const SPELLS: Record<SpellId, { cost: number; friendly: boolean }> = Object.fromEntries(
  Object.values(SPELL_DEFS).map(d => [d.id, { cost: d.cost, friendly: d.target === 'friendly' }])
) as Record<SpellId, { cost: number; friendly: boolean }>;
