import type { BattleEvent, BattleState, Pos } from '$lib/engine/types';
import { applyDamage, applyStrike } from '$lib/engine/combat';
import { BLOOD_FRENZY_DAMAGE } from '$lib/engine/abilityCatalog';
import { setOccupant } from '$lib/engine/grid';
import { statusIconFor } from './statusIcons';
import { addModifierSource, setModifierSource } from '$lib/engine/unitModifiers';

const STATUS_ICON: Partial<Record<string, string>> = {
  burn_apply: statusIconFor('burn'),
  burn: statusIconFor('burn'),
  blind: statusIconFor('blind'),
  bind: statusIconFor('bind'),
  bind_block: statusIconFor('bind'),
  slow: statusIconFor('slow'),
  drain_morale: statusIconFor('morale_drain'),
  life_drain: statusIconFor('life_drain'),
  gating: statusIconFor('gating'),
  // No dedicated art yet — these borrow the nearest existing icon rather than
  // animating silently: infection weakens like a slow, frenzy is an attack
  // buff, and absorbing bones reads as the drain it is.
  infect: statusIconFor('slow'),
  curse: statusIconFor('slow'),
  blood_frenzy: statusIconFor('bloodlust'),
  absorb: statusIconFor('life_drain'),
  absorbed: statusIconFor('life_drain'),
};

export type AnimStep =
  | { unitId: string; kind: 'damage'; value: number; delayed?: boolean; kills?: number }
  | { unitId: string; kind: 'buff'; value: number; label: string; delayed?: boolean }
  // Lifesteal floater: `revived` creatures brought back (green +N) and `topHp`
  // the lead creature's partial health gain (red +M). Either can be 0.
  | { unitId: string; kind: 'heal'; topHp: number; revived: number }
  | { unitId: string; kind: 'death' }
  | { unitId: string; kind: 'status'; icon: string }
  | { unitId: string; kind: 'move'; from: Pos; to: Pos }
  // Melee lunge: the attacker bumps into the target and springs back.
  // Future combat animations (cast flashes, sprite sheets) should follow
  // this pattern: a new kind here, resolved visually in BattleGrid/BattleFx
  // by unit id at beat time.
  | { unitId: string; kind: 'strike'; targetId: string }
  // Ranged shot: unitId is the shooter (or the off-grid hero); BattleGrid
  // resolves both ids to positions at beat time. Anchored at the target cell,
  // flight starts translated back at the source.
  | { unitId: string; kind: 'projectile'; targetId: string }
  // Hit reaction: the target flinches away from the attack direction.
  // `delayed` waits for the projectile flight before flinching (ranged).
  | { unitId: string; kind: 'recoil'; fromId: string; delayed?: boolean }
  // Cast visual at the target cell: lightning bolt flash or buff glow.
  | { unitId: string; kind: 'spell_fx'; spell: 'lightning' | 'bloodlust' | 'stoneskin' };

/** A damage floater step, carrying the stack-kill count only when something died. */
function dmgStep(unitId: string, value: number, killed?: number, delayed?: boolean): AnimStep {
  return {
    unitId,
    kind: 'damage',
    value,
    ...(killed && killed > 0 ? { kills: killed } : {}),
    ...(delayed ? { delayed: true } : {}),
  };
}

/** Translates one battle log entry into the visual steps it should play. */
export function stepsFromLogEntry(entry: BattleEvent): AnimStep[] {
  switch (entry.type) {
    case 'attack':
    case 'retaliate': {
      const { attackerId, targetId, damage, killed } = entry.data as { attackerId: string; targetId: string; damage: number; killed?: number };
      return [
        { unitId: attackerId, kind: 'strike', targetId },
        { unitId: targetId, kind: 'recoil', fromId: attackerId },
        dmgStep(targetId, damage, killed),
      ];
    }
    case 'shoot': {
      const { attackerId, targetId, damage, killed, splash } = entry.data as {
        attackerId: string;
        targetId: string;
        damage: number;
        killed?: number;
        splash?: boolean;
      };
      // Splash hits radiate from the primary impact — no second arrow.
      if (splash) return [dmgStep(targetId, damage, killed)];
      return [
        { unitId: attackerId, kind: 'projectile', targetId },
        { unitId: targetId, kind: 'recoil', fromId: attackerId, delayed: true },
        dmgStep(targetId, damage, killed, true),
      ];
    }
    case 'cast': {
      const { targetId, damage, killed, spell } = entry.data as {
        targetId: string;
        damage?: number;
        killed?: number;
        spell: 'lightning' | 'bloodlust' | 'stoneskin';
      };
      const fx: AnimStep = { unitId: targetId, kind: 'spell_fx', spell };
      if (damage !== undefined) {
        return [fx, dmgStep(targetId, damage, killed, true)];
      }
      if (spell === 'bloodlust') return [fx, { unitId: targetId, kind: 'buff', value: 4, label: 'ATK', delayed: true }];
      if (spell === 'stoneskin') return [fx, { unitId: targetId, kind: 'buff', value: 4, label: 'DEF', delayed: true }];
      return [];
    }
    case 'death': {
      const { unitId } = entry.data as { unitId: string };
      return [{ unitId, kind: 'death' }];
    }
    case 'status': {
      const { unitId, effect } = entry.data as { unitId: string; effect: string };
      const icon = STATUS_ICON[effect];
      const base: AnimStep[] = icon ? [{ unitId, kind: 'status', icon }] : [];
      // Healing effects also float the numbers: green revived count + red partial HP.
      if (effect === 'life_drain' || effect === 'absorb') {
        const { revived = 0, topHp = 0 } = entry.data as { revived?: number; topHp?: number };
        if (revived > 0 || topHp > 0) base.push({ unitId, kind: 'heal', revived, topHp });
      }
      if (effect === 'blood_frenzy') {
        base.push({ unitId, kind: 'buff', value: BLOOD_FRENZY_DAMAGE, label: 'DMG' });
      }
      return base;
    }
    // Morale resolves after the stack's turn, so these arrive as their own log
    // entry and animate on their own beat — no extra sequencing needed.
    case 'morale_boost': {
      const { unitId } = entry.data as { unitId: string };
      return [{ unitId, kind: 'status', icon: statusIconFor('morale_boost') }];
    }
    case 'morale_freeze': {
      const { unitId } = entry.data as { unitId: string };
      return [{ unitId, kind: 'status', icon: statusIconFor('morale_freeze') }];
    }
    // Luck is rolled before damage lands, and the engine emits it as its own
    // entry ahead of the attack — the flash reads as the cause of the big hit.
    case 'luck': {
      const { unitId, kind } = entry.data as { unitId: string; kind: 'good' | 'bad' };
      return [{ unitId, kind: 'status', icon: statusIconFor(kind === 'good' ? 'good_luck' : 'bad_luck') }];
    }
    case 'move': {
      const { unitId, from, to } = entry.data as { unitId: string; from?: Pos; to: Pos };
      return from ? [{ unitId, kind: 'move', from, to }] : [];
    }
    default:
      return [];
  }
}

/** Unit ids that die anywhere in this entry batch. Known before the reveal
 *  starts, so the grid can keep doomed units mounted at count 0 until their
 *  death beat starts the fade — otherwise they unmount the instant the
 *  lethal hit's damage is applied, one beat before dyingIds knows. */
export function deathIdsIn(entries: BattleEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.type === 'death') ids.add((e.data as { unitId: string }).unitId);
  }
  return ids;
}

/** Patches only what an animation step needs to read (count/hp/buffs) from
 *  one log entry. Not a full engine replica — Battle.svelte always
 *  overwrites with the engine's real result after the last entry. */
export function applyLogEntry(state: BattleState, entry: BattleEvent): BattleState {
  const patchUnit = (unitId: string, patch: (u: BattleState['units'][number]) => BattleState['units'][number]) => ({
    ...state,
    units: state.units.map(u => (u.id === unitId ? patch(u) : u)),
  });

  switch (entry.type) {
    case 'attack':
    case 'retaliate': {
      // Melee goes through applyStrike so a soul_reaper's extra kill is gone
      // from the board on the same beat the floater reports it.
      const { attackerId, targetId, damage } = entry.data as { attackerId: string; targetId: string; damage: number };
      const attacker = state.units.find(u => u.id === attackerId);
      return patchUnit(targetId, u =>
        attacker ? applyStrike(attacker, u, damage).remaining : applyDamage(u, damage).remaining
      );
    }
    case 'shoot': {
      const { targetId, damage } = entry.data as { targetId: string; damage: number };
      return patchUnit(targetId, u => applyDamage(u, damage).remaining);
    }
    case 'death': {
      const { unitId } = entry.data as { unitId: string };
      return patchUnit(unitId, u => ({ ...u, count: 0 }));
    }
    case 'move': {
      const { unitId, to } = entry.data as { unitId: string; to: Pos };
      const mover = state.units.find(u => u.id === unitId);
      if (!mover) return state;
      const moved = patchUnit(unitId, u => ({ ...u, pos: to }));
      return { ...moved, grid: setOccupant(setOccupant(moved.grid, mover.pos, null), to, unitId) };
    }
    case 'cast': {
      const { targetId, damage, spell } = entry.data as {
        targetId: string;
        damage?: number;
        spell: 'lightning' | 'bloodlust' | 'stoneskin';
      };
      if (damage !== undefined) return patchUnit(targetId, u => applyDamage(u, damage).remaining);
      if (spell === 'bloodlust') {
        return patchUnit(targetId, u => addModifierSource(
          { ...u, attackBuff: (u.attackBuff ?? 0) + 4 },
          { id: 'bloodlust', label: 'Bloodlust', stats: { attack: 4 } },
        ));
      }
      if (spell === 'stoneskin') {
        return patchUnit(targetId, u => addModifierSource(
          { ...u, defenseBuff: (u.defenseBuff ?? 0) + 4 },
          { id: 'stoneskin', label: 'Stoneskin', stats: { defense: 4 } },
        ));
      }
      return state;
    }
    case 'status': {
      const { unitId, effect } = entry.data as { unitId: string; effect: string };
      if (effect === 'curse') {
        const penalty = Number(entry.data.penalty) || 0;
        return patchUnit(unitId, u => addModifierSource(
          { ...u, attackBuff: (u.attackBuff ?? 0) - penalty },
          { id: 'curse_shot', label: 'Lich — Curse Shot', stats: { attack: -penalty } },
        ));
      }
      if (effect === 'infect') {
        const penalty = Number(entry.data.penalty) || 0;
        return patchUnit(unitId, u => addModifierSource(
          {
            ...u,
            attackBuff: (u.attackBuff ?? 0) - penalty,
            defenseBuff: (u.defenseBuff ?? 0) - penalty,
          },
          { id: 'infecting_strike', label: 'Zombie — Infecting Strike', stats: { attack: -penalty, defense: -penalty } },
        ));
      }
      if (effect === 'blood_frenzy') {
        const bonus = Number(entry.data.bonus) || 0;
        return patchUnit(unitId, u => {
          if ((u.damageBonus ?? 0) >= bonus) return u;
          return setModifierSource(
            { ...u, damageBonus: bonus },
            {
              id: 'blood_frenzy',
              label: 'Blood Frenzy',
              stats: { damage: bonus },
              stacks: Math.max(1, Math.round(bonus / BLOOD_FRENZY_DAMAGE)),
            },
          );
        });
      }
      return state;
    }
    default:
      return state;
  }
}
