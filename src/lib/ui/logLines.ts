import type { BattleEvent, Hero, Pos, SpellId, UnitStack } from '$lib/engine/types';
import { controllerOf, type ControllerId } from './controllers';
import type { EntryKind } from '$lib/compendium/entries';

// Moved from Battle.svelte so log building is a pure, testable module.
export const SPELL_META: Record<SpellId, { glyph: string; label: string }> = {
  lightning: { glyph: '⚡', label: 'Lightning' },
  bloodlust: { glyph: '💪', label: 'Bloodlust' },
  stoneskin: { glyph: '🗿', label: 'Stoneskin' },
  slow: { glyph: '🐌', label: 'Slow' },
  chain_lightning: { glyph: '🌩️', label: 'Chain Lightning' },
  resurrect: { glyph: '✨', label: 'Resurrect' },
  blizzard: { glyph: '❄️', label: 'Blizzard' },
};

/**
 * Effects that deal damage on the way past — splash, chain hits, a charge that
 * shoves a stack into a wall. They all carry `damage`/`killed` and read best as
 * "<Effect> hits <stack> for N damage", the same shape as an ordinary attack.
 */
const SECONDARY_DAMAGE: Record<string, string> = {
  area_shot: 'Area Shot',
  boulder_burst: 'Boulder Burst',
  caustic_breath: 'Caustic Breath',
  cinderburst: 'Cinderburst',
  collision: 'the collision',
  feed_the_fire: 'Feed the Fire',
  follow_through: 'Follow Through',
  hellfire_shot: 'Hellfire Shot',
  hells_verdict: "Hell's Verdict",
  lightning_strike: 'Lightning Strike',
  overrun: 'Overrun',
  rain_of_iron: 'Rain of Iron',
  shockwave: 'Shockwave',
  splash: 'the splash',
  three_headed_strike: 'Three-Headed Strike',
  thunder_dive: 'Thunder Dive',
};

/**
 * Which compendium entry a named effect links to, when the log names it. Most
 * are abilities whose id is the effect id; the rest are artifacts, whose proc
 * the log calls out by the artifact's own name.
 */
const EFFECT_ENTRY: Record<string, { entryKind: EntryKind; id: string }> = {
  area_shot: { entryKind: 'ability', id: 'area_shot' },
  boulder_burst: { entryKind: 'ability', id: 'boulder_burst' },
  caustic_breath: { entryKind: 'ability', id: 'caustic_breath' },
  cinderburst: { entryKind: 'ability', id: 'cinderburst' },
  follow_through: { entryKind: 'ability', id: 'follow_through' },
  hellfire_shot: { entryKind: 'ability', id: 'hellfire_shot' },
  hells_verdict: { entryKind: 'item', id: 'hells_verdict' },
  lightning_strike: { entryKind: 'ability', id: 'lightning_strike' },
  overrun: { entryKind: 'ability', id: 'overrun' },
  rain_of_iron: { entryKind: 'item', id: 'rain_of_iron' },
  shockwave: { entryKind: 'ability', id: 'shockwave' },
  three_headed_strike: { entryKind: 'ability', id: 'three_headed_strike' },
  thunder_dive: { entryKind: 'ability', id: 'thunder_dive' },
  animus_engine: { entryKind: 'item', id: 'animus_engine' },
  blighted_soil: { entryKind: 'item', id: 'blighted_soil' },
  blood_tithe_ready: { entryKind: 'item', id: 'blood_tithe' },
  funeral_drum: { entryKind: 'item', id: 'funeral_drum' },
  haste_ritual: { entryKind: 'ability', id: 'haste_ritual' },
  shroud_of_preservation: { entryKind: 'item', id: 'shroud_of_preservation' },
};

/** Hero battle orders, by the id the engine logs. */
const HERO_ACTIONS: Record<string, string> = {
  hold_the_line: 'Hold the Line',
  ready_the_counterattack: 'Counterattack',
  advance_by_ranks: 'Advance by Ranks',
  name_the_quarry: 'Name the Quarry',
  set_the_ambush: 'Set the Ambush',
  open_an_escape_route: 'Escape Route',
  charge: 'Charge!',
  loose: 'Loose!',
  blood_for_blood: 'Blood for Blood!',
  blood_offering: 'Blood Offering',
  feed_the_fire: 'Feed the Fire',
  demonic_bargain: 'Demonic Bargain',
  reknit_the_dead: 'Reknit the Dead',
  grasping_dead: 'Grasping Dead',
  death_march: 'Death March',
};

/** Last resort for an effect nobody has written a line for yet: "follow_through"
 *  is an internal id and must never reach a player, so at minimum it reads as
 *  "Follow Through". */
export const readableEffect = (id: unknown): string =>
  String(id)
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

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
  /** A game term: rendered as a hoverable keyword pointing at its entry. The
   *  log is where a player meets an ability mid-fight, so the name of the thing
   *  that just hit them should explain itself on the spot. */
  keyword?: { entryKind: EntryKind; id: string };
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
  /** A named game term. Falls back to plain text when the effect has no entry
   *  to point at, so the sentence still reads. */
  const term = (effect: string, label: string): LogSegment => {
    const entry = EFFECT_ENTRY[effect];
    return entry ? { text: label, keyword: entry } : { text: label };
  };
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
        case 'life_drain': {
          const revived = (d.revived as number) ?? 0;
          return revived > 0
            ? line(u, t(' drain '), num(d.heal), t(' HP, reviving '), num(revived), t(revived === 1 ? ' creature.' : ' creatures.'))
            : line(u, t(' drain '), num(d.heal), t(' HP of life.'));
        }
        case 'slow': return line(u, t(' are slowed.'));
        case 'infect':
          return line(u, t(' fester — '), num(`−${d.penalty}`), t(' attack and defense.'));
        case 'curse':
          return line(u, t(' are cursed — '), num(`−${d.penalty}`), t(' attack.'));
        case 'blood_frenzy':
          return line(u, t(' feed on their own wounds — damage up to +'), num(d.bonus), t('.'));
        case 'absorbed': {
          const eaten = (d.consumed as number) ?? 0;
          return line(u, t(eaten === 1 ? ' crumble as one of them is devoured.' : ` crumble as ${eaten} of them are devoured.`));
        }
        case 'absorb': {
          const revived = (d.revived as number) ?? 0;
          return revived > 0
            ? line(u, t(' absorb the bones for '), num(d.heal), t(' HP, reviving '), num(revived), t(revived === 1 ? ' creature.' : ' creatures.'))
            : line(u, t(' absorb the bones for '), num(d.heal), t(' HP.'));
        }
        case 'drain_morale': return line(u, t(' morale is drained.'));
        case 'blind': return line(u, t(' are blinded and skip their turn.'));
        case 'burn_apply': return line(u, t(' catch fire.'));
        case 'burn': return line(u, t(' burn for '), dmg(d.damage), t(' damage.'));
        case 'bind': return line(u, t(' are bound in place.'));
        case 'bind_block': return line(u, t(' strain against their bindings and cannot move.'));
        // --- Hero orders and artifact procs ---
        case 'hero_action':
          return line(unit(d.casterId), t(` order ${HERO_ACTIONS[String(d.actionId)] ?? readableEffect(d.actionId)}.`));
        case 'focus':
          return line(u, t(' focus — +1 Initiative and damage, for good.'));
        case 'cleanse':
          return line(u, t(' are cleansed.'));
        case 'repair': {
          const revived = (d.revived as number) ?? 0;
          return revived > 0
            ? line(u, t(' are repaired for '), num(d.heal), t(' HP, rebuilding '), num(revived), t(revived === 1 ? ' construct.' : ' constructs.'))
            : line(u, t(' are repaired for '), num(d.heal), t(' HP.'));
        }
        case 'animus_engine':
          return line(u, t(' are rebuilt by '), term('animus_engine', 'The Animus Engine'), t('.'));
        case 'ride_by_attack':
          return line(u, t(d.returned ? ' wheel away to where they started.' : ' charge through and hold their ground.'));
        case 'claim_blessing':
          return line(u, t(' tear a blessing from '), unit(d.targetId), t('.'));
        case 'haste_ritual':
          return line(u, t(' finish the '), term('haste_ritual', 'Haste Ritual'), t(' — friendly Demons gain +'), num(d.bonus), t(' Initiative.'));
        case 'overfeed':
          return line(u, t(' gorge — '), num(d.overheal), t(' surplus healing is stored as damage.'));
        case 'blood_offering':
          return line(u, t(' are offered up — '), num(d.sacrificed), t(d.sacrificed === 1 ? ' falls to quicken the army.' : ' fall to quicken the army.'));
        case 'gate':
          return line(u, t(' open a gate — '), num(d.count), t(' reinforcements step through.'));
        case 'rebirth':
          return line(u, t(' claw their way back — '), num(d.count), t(d.count === 1 ? ' returns.' : ' return.'));

        // --- Necromancy ---
        case 'corpse_raise':
          return line(t('The remains of '), unit(d.sourceId), t(' rise as '), num(d.count), t(d.count === 1 ? ' new servant.' : ' new servants.'));
        case 'blighted_soil':
          return line(term('blighted_soil', 'Blighted Soil'), t(' spreads the rot from '), unit(d.sourceId), t(' to everything around it.'));
        case 'blood_tithe_ready':
          return line(term('blood_tithe_ready', 'Blood Tithe'), t(' pays out — '), num(d.count), t(d.count === 1 ? ' Skeleton rises.' : ' Skeletons rise.'));
        case 'shroud_of_preservation':
          return line(term('shroud_of_preservation', 'Shroud of Preservation'), t(' saves '), num(d.count), t(' bones — they join '), u, t('.'));
        case 'funeral_drum':
          return line(term('funeral_drum', 'Funeral Drum'), t(' beats for '), num(d.lost), t(d.lost === 1 ? ' lost Skeleton.' : ' lost Skeletons.'));

        default: {
          // Damage dealt in passing names its source: "Wild Knights take 55
          // damage from Thunder Dive", with the ability hoverable.
          const effect = String(d.effect);
          const secondary = SECONDARY_DAMAGE[effect];
          if (secondary !== undefined && d.damage !== undefined) {
            return line(u, t(' take '), dmg(d.damage), t(' damage from '), term(effect, secondary), t('.'), kills(d.killed));
          }
          return line(u, t(' are affected by '), term(effect, readableEffect(effect)), t('.'));
        }
      }
    }
    case 'battle_end':
      return line(t('The battle is over.'));
    case 'debug':
      return line(t(`Debug: ${String(d.label ?? 'battle state modified')}.`));
    default:
      return line(t(ev.type));
  }
}
