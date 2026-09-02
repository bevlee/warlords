import type { BattleState, Hero, Pos, UnitStack } from '$lib/engine/types';
import { artifactIdsFor, controllerOfUnit } from '$lib/engine/artifacts';

export type HeroActionKind = 'Order' | 'Plan' | 'Battle Cry' | 'Ritual' | 'Necromancy';
export type HeroActionTargeting = 'none' | 'enemy' | 'friendly' | 'burning' | 'area';

export interface HeroActionView {
  id: string;
  label: string;
  kind: HeroActionKind;
  summary: string;
  description: string;
  targeting: HeroActionTargeting;
  targetingLabel: string;
  duration: string;
  usesLabel?: string;
  artifactNotes: string[];
}

export interface ActiveHeroEffectView {
  id: string;
  label: string;
  summary: string;
  affectedLabel: string;
  duration: string;
}

const has = (ids: string[], id: string) => ids.includes(id);
const targetLabel: Record<HeroActionTargeting, string> = {
  none: 'No target — confirm activation',
  enemy: 'Choose one highlighted enemy',
  friendly: 'Choose one highlighted friendly unit',
  burning: 'Choose one highlighted burning unit',
  area: 'Choose the centre of a highlighted 3×3 area',
};

const action = (
  id: string,
  label: string,
  kind: HeroActionKind,
  summary: string,
  description: string,
  targeting: HeroActionTargeting,
  duration: string,
  artifactNotes: string[] = [],
): HeroActionView => ({
  id, label, kind, summary, description, targeting,
  targetingLabel: targetLabel[targeting], duration, artifactNotes,
});

/**
 * A hero's kit, from the hero and the artifacts its side owns.
 *
 * Pure so the run screen can explain a hero between battles: outside a battle
 * there is no controller state, so every limited action reads as unspent.
 * `heroActionViews` layers a live battle's spent uses over the result.
 */
export function heroActionsFor(
  hero: Hero,
  artifacts: string[],
  controllerState: Record<string, unknown> = {},
): HeroActionView[] {
  if (hero.class === 'knight') return [
    action('hold_the_line', 'Hold the Line', 'Order', 'End without moving → Braced', 'Units that finish a turn without moving become Braced and take 30% less damage until their next turn.', 'none', 'Until another Order is issued'),
    action('ready_the_counterattack', 'Counterattack', 'Order', '+50% retaliation · +10% [[atb]]', 'Each unit’s first retaliation deals 50% more damage and advances that unit by 10% [[atb]].', 'none', 'Until another Order is issued'),
    action('advance_by_ranks', 'Advance by Ranks', 'Order', 'Long move beside ally → 50% [[atb]]', 'A move-only action of at least two cells that ends beside an ally returns that unit at 50% [[atb]].', 'none', 'Until another Order is issued'),
  ];

  if (hero.class === 'ranger') return [
    action('name_the_quarry', 'Name the Quarry', 'Plan', 'First hit per ally → +10% [[atb]]', 'Choose an enemy. Each allied unit’s first damaging attack against it advances that attacker by 10% [[atb]].', 'enemy', 'Until the Ranger hero’s next turn'),
    action('set_the_ambush', 'Set the Ambush', 'Plan', 'Stronger, safer opening attacks', 'Choose a 3×3 area. Allied units attacking from it gain a stronger opening attack and a safe return.', 'area', 'Until the Ranger hero’s next turn'),
    action('open_an_escape_route', 'Escape Route', 'Plan', 'Move-only actions return at 75% [[atb]]', 'Choose a 3×3 area. Allied move-only actions ending inside it return at 75% [[atb]].', 'area', 'Until the Ranger hero’s next turn'),
  ];

  if (hero.class === 'barbarian') {
    const maxUses = has(artifacts, 'voice_of_the_warchief') ? 2 : 1;
    const withUses = (view: HeroActionView): HeroActionView => {
      const used = Number(controllerState[`${view.id}Uses`] ?? 0);
      return { ...view, usesLabel: `${Math.max(0, maxUses - used)} of ${maxUses} uses remaining` };
    };
    const chargeSpeed = has(artifacts, 'bronze_war_horn') ? 4 : 2;
    const chargeDamage = has(artifacts, 'bronze_war_horn') ? 40 : 25;
    const looseDamage = has(artifacts, 'horn_of_the_hunt') ? 75 : 40;
    const bloodDamage = has(artifacts, 'skull_trumpet') ? 75 : 50;
    const voiceNote = has(artifacts, 'voice_of_the_warchief') ? ['Voice of the Warchief: 2 uses; the hero returns at 50% [[atb]].'] : [];
    return [
      withUses(action('charge', 'Charge!', 'Battle Cry', `+${chargeSpeed} Speed · +${chargeDamage}% melee damage`, `Every friendly melee unit gains +${chargeSpeed} Speed and deals ${chargeDamage}% more damage during its next turn.`, 'none', 'Each affected unit’s next turn', [
        ...(has(artifacts, 'bronze_war_horn') ? ['Bronze War Horn supplies the displayed upgraded values.'] : []), ...voiceNote,
      ])),
      withUses(action('loose', 'Loose!', 'Battle Cry', `+${looseDamage}% ranged damage · free shot`, `Each friendly shooter’s next attack deals ${looseDamage}% more damage and costs no ammunition.${has(artifacts, 'horn_of_the_hunt') ? ' It also Marks before dealing damage.' : ''}`, 'none', 'Each affected unit’s next ranged attack', [
        ...(has(artifacts, 'horn_of_the_hunt') ? ['Horn of the Hunt upgrades damage and applies Mark before damage.'] : []), ...voiceNote,
      ])),
      withUses(action('blood_for_blood', 'Blood for Blood!', 'Battle Cry', `+${bloodDamage}% dealt · +50% taken`, `Every friendly unit deals ${bloodDamage}% more damage and takes 50% more damage.`, 'none', 'Until the Barbarian hero’s next turn', [
        ...(has(artifacts, 'skull_trumpet') ? ['Skull Trumpet upgrades outgoing damage to 75%.'] : []), ...voiceNote,
      ])),
    ];
  }

  if (hero.class === 'demon') return [
    action('blood_offering', 'Blood Offering', 'Ritual', 'Sacrifice 10% · army +10% [[atb]]', 'Sacrifice 10% of a friendly stack. Every other friendly unit advances by 10% [[atb]]; summoned sacrifices grant 5%.', 'friendly', 'Immediate'),
    action('feed_the_fire', 'Feed the Fire', 'Ritual', 'Consume one Burn tick · spread Burn', 'Consume one Burn tick immediately, then spread Burn to adjacent units.', 'burning', 'Immediate', [
      ...(has(artifacts, 'blackened_wick') ? ['Blackened Wick doubles the consumed Burn tick when its source carries the artifact.'] : []),
      ...(has(artifacts, 'crown_of_wildfire') ? ['Crown of Wildfire makes spread applications stack and refresh.'] : []),
    ]),
    action('demonic_bargain', 'Demonic Bargain', 'Ritual', 'Sacrifice 20% HP · next attack ×2', 'Sacrifice 20% of a friendly stack’s starting HP. Its next attack deals double damage and cannot be retaliated against.', 'friendly', 'The target’s next attack'),
  ];

  if (hero.class === 'necromancer') return [
    action('reknit_the_dead', 'Reknit the Dead', 'Necromancy', 'Consume up to 5 Skeletons · heal', 'Consume up to five Skeletons to heal a wounded non-Skeleton undead stack.', 'friendly', 'Immediate'),
    action('grasping_dead', 'Grasping Dead', 'Necromancy', 'Consume 5 Skeletons · pin enemy', 'Consume five Skeletons to prevent an enemy from moving or retaliating until its next turn.', 'enemy', 'Until the target’s next turn'),
    action('death_march', 'Death March', 'Necromancy', 'Consume 10 Skeletons · army +20% [[atb]]', 'Consume ten Skeletons to advance every other friendly undead stack by 20% [[atb]].', 'none', 'Immediate'),
  ];

  return [];
}

export function heroActionViews(state: BattleState, heroUnit: UnitStack, hero: Hero): HeroActionView[] {
  return heroActionsFor(
    hero,
    artifactIdsFor(state, heroUnit),
    state.heroActionState?.[controllerOfUnit(heroUnit)] ?? {},
  );
}

const sameController = (unit: UnitStack, controller: string) => controllerOfUnit(unit) === controller;
const inArea = (area: Pos[], unit: UnitStack) => area.some(pos => pos.col === unit.pos.col && pos.row === unit.pos.row);

export function activeHeroEffect(state: BattleState, heroUnit: UnitStack, hero: Hero): ActiveHeroEffectView | null {
  const controller = controllerOfUnit(heroUnit);
  const current = state.heroActionState?.[controller] ?? {};
  const views = heroActionViews(state, heroUnit, hero);
  let id: string | null = null;
  let affected = 0;

  if (hero.class === 'knight') {
    id = typeof current.activeOrder === 'string' ? current.activeOrder : null;
    affected = state.units.filter(unit => unit.count > 0 && !unit.isHero && sameController(unit, controller)).length;
  } else if (hero.class === 'ranger') {
    id = typeof current.activePlan === 'string' ? current.activePlan : null;
    if (id === 'name_the_quarry') affected = current.targetId ? 1 : 0;
    else {
      const area = Array.isArray(current.area) ? current.area as unknown as Pos[] : [];
      affected = state.units.filter(unit => unit.count > 0 && !unit.isHero && sameController(unit, controller) && inArea(area, unit)).length;
    }
  } else if (hero.class === 'barbarian') {
    const lastCry = typeof current.lastCry === 'string' ? current.lastCry : null;
    const effectKind = lastCry ? `cry_${lastCry}` : null;
    if (effectKind) {
      affected = state.units.filter(unit => unit.count > 0 && (unit.effects ?? []).some(effect => effect.kind === effectKind && effect.sourceStackId === heroUnit.id)).length;
      if (affected > 0) id = lastCry;
    }
  }

  if (!id) return null;
  const view = views.find(candidate => candidate.id === id);
  if (!view) return null;
  return {
    id: view.id,
    label: view.label,
    summary: view.summary,
    affectedLabel: affected === 1 ? '1 unit affected' : `${affected} units affected`,
    duration: view.duration,
  };
}
