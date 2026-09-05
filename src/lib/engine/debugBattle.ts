import type {
  ArmyBonuses,
  BattleState,
  DebugBattleSnapshot,
  DebugStackTemplate,
  Hero,
  UnitDef,
  UnitStack,
} from './types';
import { abilityLevel } from './abilityCatalog';

/** Abilities with a real engine read-path today. Definition-only placeholders
 * such as gate, teleport and fire_immunity are deliberately omitted. */
export const DEBUG_ABILITY_IDS = [
  'absorb_skeleton',
  'area_shot',
  'bind',
  'blind_on_hit',
  'blood_frenzy',
  'bravery',
  'burn',
  'death_blow',
  'defense_reduction',
  'double_shot',
  'double_strike',
  'drain_morale',
  'flying',
  'infecting_strike',
  'jousting',
  'life_drain',
  'no_retaliation',
  'slow_on_hit',
  'soul_reaper',
  'unlimited_retaliation',
] as const;

const clampProc = (value: number) => Math.max(-3, Math.min(3, value));

function cloneDefinition(definition: UnitDef): UnitDef {
  return {
    name: definition.name,
    tier: definition.tier,
    speed: definition.speed,
    initiative: definition.initiative,
    hp: definition.hp,
    attack: definition.attack,
    defense: definition.defense,
    minDamage: definition.minDamage,
    maxDamage: definition.maxDamage,
    shots: definition.shots,
    range: definition.range,
    isLarge: definition.isLarge,
    abilities: [...definition.abilities],
    ...(definition.grantedAbilities ? { grantedAbilities: [...definition.grantedAbilities] } : {}),
    ...(definition.abilityLevels ? { abilityLevels: { ...definition.abilityLevels } } : {}),
  };
}

export function createDebugStackTemplate(
  definition: UnitDef,
  side: UnitStack['side'],
  count: number,
  hero: Hero,
  armyBonuses?: ArmyBonuses
): DebugStackTemplate {
  const def = cloneDefinition(definition);
  const player = side === 'player';
  const morale = abilityLevel(def, 'bravery') + (player ? armyBonuses?.morale ?? 0 : 0);
  const luck = abilityLevel(def, 'fortune') + (player ? armyBonuses?.luck ?? 0 : 0);
  const logistics = 0;
  const speedBonus = logistics + (player ? armyBonuses?.speed ?? 0 : 0);
  return {
    definition: def,
    count,
    startCount: count,
    hp: def.hp,
    side,
    hasRetaliated: false,
    shotsLeft: def.shots,
    morale: clampProc(morale),
    luck: clampProc(luck),
    atb: 0,
    isDefending: false,
    ...(player && armyBonuses?.attack ? { attackBuff: armyBonuses.attack } : {}),
    ...(player && armyBonuses?.defense ? { defenseBuff: armyBonuses.defense } : {}),
    ...(player && armyBonuses?.initiative ? { initiativeBonus: armyBonuses.initiative } : {}),
    ...(speedBonus ? { speedBonus } : {}),
  };
}

export function templateFromStack(stack: UnitStack): DebugStackTemplate {
  const { id: _id, pos: _pos, tiePriority: _tiePriority, ...template } = stack;
  return {
    ...template,
    definition: cloneDefinition(template.definition),
  };
}

export function debugSnapshot(state: BattleState): DebugBattleSnapshot {
  // Svelte wraps values assigned into `$state`; JSON cloning intentionally
  // unwraps that serializable proxy and also matches the replay wire format.
  const plain = JSON.parse(JSON.stringify(state)) as BattleState;
  const { log: _log, ...snapshot } = plain;
  return snapshot;
}
