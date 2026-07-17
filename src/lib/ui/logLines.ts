import type { BattleEvent, Hero, Pos, SpellId, UnitStack } from '$lib/engine/types';
import { controllerOf, type ControllerId } from './controllers';

// Moved from Battle.svelte so log building is a pure, testable module.
export const SPELL_META: Record<SpellId, { glyph: string; label: string }> = {
  lightning: { glyph: '⚡', label: 'Lightning' },
  bloodlust: { glyph: '💪', label: 'Bloodlust' },
  stoneskin: { glyph: '🗿', label: 'Stoneskin' },
};

/** Damage size tiers, shared by the log and the battlefield floaters:
 *  0 ≤50 · 1 >50 · 2 >100 · 3 >1000. */
export type DamageTier = 0 | 1 | 2 | 3;
export function damageTier(value: number): DamageTier {
  return value > 1000 ? 3 : value > 100 ? 2 : value > 50 ? 1 : 0;
}

export type LogSegment = {
  text: string;
  controller?: ControllerId; // unit-name segment — colored by owner
  damage?: DamageTier;       // red damage number, size-tiered
  kills?: boolean;           // "-x 💀" stack-kill segment
  emph?: boolean;            // other emphasized numbers (e.g. HP drained)
};

export type LogLine =
  | { kind: 'round'; round: number }
  | { kind: 'event'; segments: LogSegment[] };

/** Renders one battle event as colored segments.
 *  `enemyHeroName` is the boss-battle seam: named enemy heroes own their
 *  stacks ("Karth's Wolfs"); without one, enemy stacks are "wild Wolfs". */
export function describeEvent(
  ev: BattleEvent,
  units: UnitStack[],
  hero: Hero,
  enemyHeroName?: string
): LogLine {
  const unit = (id: unknown): LogSegment => {
    const u = units.find(u => u.id === id);
    if (!u) return { text: 'a unit' };
    const controller = controllerOf(u);
    if (u.isHero) {
      return u.side === 'enemy'
        ? { text: enemyHeroName ?? 'the enemy hero', controller }
        : { text: hero.name ?? 'your hero', controller };
    }
    const plural = `${u.definition.name}s`;
    if (u.side === 'enemy') {
      return { text: enemyHeroName ? `${enemyHeroName}'s ${plural}` : `wild ${plural}`, controller };
    }
    return { text: u.isAlly ? `allied ${plural}` : plural, controller };
  };

  const dmg = (value: unknown): LogSegment => ({ text: String(value), damage: damageTier(Number(value)) });
  const num = (value: unknown): LogSegment => ({ text: String(value), emph: true });
  const t = (text: string): LogSegment => ({ text });
  // null when nothing died — line() drops it. Leading space keeps the sentence
  // tidy: "…for 12 damage." + " -2 💀".
  const kills = (killed: unknown): LogSegment | null =>
    Number(killed) > 0 ? { text: ` -${killed} 💀`, kills: true } : null;

  // Sentence fragments start lowercase ("your hero", "wild Wolfs") — lines
  // shouldn't. Capitalize the first character of the first segment.
  const line = (...segments: (LogSegment | null)[]): LogLine => {
    const kept = segments.filter((s): s is LogSegment => s !== null);
    const [first, ...rest] = kept;
    return {
      kind: 'event',
      segments: [{ ...first, text: first.text.charAt(0).toUpperCase() + first.text.slice(1) }, ...rest],
    };
  };

  const d = ev.data;
  switch (ev.type) {
    case 'round_start':
      return { kind: 'round', round: d.round as number };
    case 'move':
      return line(unit(d.unitId), t(` move to (${(d.to as Pos).col}, ${(d.to as Pos).row}).`));
    case 'defend':
      return line(unit(d.unitId), t(' brace for defense.'));
    case 'cast':
      return d.spell === 'lightning'
        ? line(unit(d.casterId), t(' casts Lightning at '), unit(d.targetId), t(' for '), dmg(d.damage), t(' damage.'), kills(d.killed))
        : line(unit(d.casterId), t(` casts ${SPELL_META[d.spell as SpellId].label} on `), unit(d.targetId), t('.'));
    case 'attack':
      return line(unit(d.attackerId), t(' strike '), unit(d.targetId), t(' for '), dmg(d.damage), t(' damage.'), kills(d.killed));
    case 'retaliate':
      return line(unit(d.attackerId), t(' retaliate against '), unit(d.targetId), t(' for '), dmg(d.damage), t(' damage.'), kills(d.killed));
    case 'shoot':
      return line(unit(d.attackerId), t(' shoot '), unit(d.targetId), t(' for '), dmg(d.damage), t(`${d.farShot ? ' (long shot — half damage)' : ''} damage.`), kills(d.killed));
    case 'death':
      return line(unit(d.unitId), t(' are wiped out!'));
    case 'morale_boost':
      return line(t('High morale! '), unit(d.unitId), t(' act again.'));
    case 'morale_freeze':
      return line(t('Low morale — '), unit(d.unitId), t(' freeze and skip their turn.'));
    case 'luck':
      return d.kind === 'good'
        ? line(t('Lucky strike! '), unit(d.unitId), t(' land a double-damage blow.'))
        : line(t('Bad luck — '), unit(d.unitId), t(' fumble for half damage.'));
    case 'status': {
      const u = unit(d.unitId);
      switch (d.effect) {
        case 'life_drain': return line(u, t(' drain '), num(d.heal), t(' HP of life.'));
        case 'slow': return line(u, t(' are slowed.'));
        case 'drain_morale': return line(u, t(' morale is drained.'));
        case 'blind': return line(u, t(' are blinded and skip their turn.'));
        case 'burn_apply': return line(u, t(' catch fire.'));
        case 'burn': return line(u, t(' burn for '), dmg(d.damage), t(' damage.'));
        case 'bind': return line(u, t(' are bound in place.'));
        case 'bind_block': return line(u, t(' strain against their bindings and cannot move.'));
        default: return line(u, t(` are affected by ${d.effect}.`));
      }
    }
    case 'battle_end':
      return line(t('The battle is over.'));
    default:
      return line(t(ev.type));
  }
}
