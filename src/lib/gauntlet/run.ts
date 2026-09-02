import type { ArmySlot, FactionClass, Hero } from '../engine/types';
import { FACTION_UNITS, FACTION_INFO } from '../engine/factions';
import { MAX_STACKS, UNIT_COSTS } from '../engine/recruit';
import { updateFactionSkills } from '../engine/factionSkills';
import { mixSeed, mulberry32, type Rng } from '../engine/rng';
import { addItem, itemDraftOptions, starterItemsForFaction, type ItemId } from './items';
import { skillDraftOptions, canLearnSkill, type SkillId, type UnitSkills } from './skills';
import { addAbilityLevels, isUnique } from '../engine/abilityCatalog';

export { mixSeed };

export const RUN_LENGTH = 10;
export const BOSS_NODES = new Set([3, 7, 10]);

export interface UnitCard {
  unitName: string;
  count: number;
}

export interface RunState {
  version: 2;
  seed: number;
  faction: FactionClass;
  encounterIndex: number; // next battle, 1..10
  hero: Hero;
  army: ArmySlot[];
  pendingDraft: UnitCard[] | null;
  pendingItems: ItemId[] | null;
  pendingSkills: SkillId[] | null;
  items: ItemId[];
  /** Unit skills taught this run: unit name → granted skill levels. */
  unitSkills: UnitSkills;
  status: 'map' | 'draft' | 'won' | 'lost';
  battlesWon: number;
  startedAt: number;
  endlessDepth: number;
  savedFormation?: SavedFormation;
}

export interface SavedFormation {
  version: 1;
  units: Record<string, { col: number; row: number }>;
}

const migratedUnitName = (name: string): string => name === 'Gorgon' ? 'Bilehorn' : name;

/** Bring pre-redesign runs forward without retaining stale unit definitions.
 * Unknown/corrupt payloads are rejected by returning null. */
export function migrateRunState(value: unknown): RunState | null {
  if (!value || typeof value !== 'object') return null;
  const old = value as Partial<RunState> & { version?: number };
  if (!old.faction || !FACTION_UNITS[old.faction] || !old.hero || !Array.isArray(old.army)) return null;
  const roster = FACTION_UNITS[old.faction];
  const army = old.army.flatMap(slot => {
    const name = migratedUnitName(slot?.unit?.name ?? '');
    const unit = roster.find(candidate => candidate.name === name);
    return unit && Number.isInteger(slot.count) && slot.count > 0 ? [{ unit, count: slot.count }] : [];
  });
  if (!army.length) return null;
  const renameRecord = <T>(record: Record<string, T> | undefined): Record<string, T> => Object.fromEntries(
    Object.entries(record ?? {}).map(([name, data]) => [migratedUnitName(name), data]),
  );
  const starters = starterItemsForFaction(old.faction);
  return {
    version: 2,
    seed: Number.isFinite(old.seed) ? old.seed! : Date.now(),
    faction: old.faction,
    encounterIndex: Math.max(1, Math.floor(old.encounterIndex ?? 1)),
    hero: updateFactionSkills(old.hero),
    army,
    pendingDraft: (old.pendingDraft ?? null)?.map(card => ({ ...card, unitName: migratedUnitName(card.unitName) })) ?? null,
    pendingItems: old.pendingItems ?? null,
    pendingSkills: old.pendingSkills ?? null,
    items: [...new Set([...starters, ...(old.items ?? [])])],
    unitSkills: renameRecord(old.unitSkills),
    status: old.status ?? 'map',
    battlesWon: Math.max(0, Math.floor(old.battlesWon ?? 0)),
    startedAt: old.startedAt ?? Date.now(),
    endlessDepth: Math.max(0, Math.floor(old.endlessDepth ?? 0)),
    ...(old.savedFormation ? { savedFormation: { version: 1, units: renameRecord(old.savedFormation.units) } } : {}),
  };
}

export function actOf(n: number): 1 | 2 | 3 {
  return n <= 3 ? 1 : n <= 7 ? 2 : 3;
}

/** Power budget: 90 × 1.25^(rank−1), bosses (3/7/10) pay a 10% premium. */
export function encounterBudget(n: number): number {
  const base = 90 * 1.25 ** (n - 1);
  return Math.round(BOSS_NODES.has(n) ? base * 1.1 : base);
}

export function newRun(faction: FactionClass, seed = Date.now()): RunState {
  const roster = FACTION_UNITS[faction];
  const t1 = roster.find(u => u.tier === 1)!;
  const t2 = roster.find(u => u.tier === 2)!;
  const army: ArmySlot[] = [
    { unit: t1, count: Math.max(1, Math.round(55 / UNIT_COSTS[t1.name])) },
    { unit: t2, count: Math.max(1, Math.round(35 / UNIT_COSTS[t2.name])) },
  ];
  const hero: Hero = updateFactionSkills({
    class: faction,
    level: 1,
    xp: 0,
    attack: 2,
    defense: 1,
    statPoints: 0,
    factionSkills: [],
  });
  return {
    version: 2,
    seed,
    faction,
    encounterIndex: 1,
    hero,
    army,
    pendingDraft: null,
    pendingItems: null,
    pendingSkills: null,
    items: starterItemsForFaction(faction),
    unitSkills: {},
    status: 'map',
    battlesWon: 0,
    startedAt: Date.now(),
    endlessDepth: 0,
  };
}

const FACTIONS = Object.keys(FACTION_INFO) as FactionClass[];

function buildArmy(roster: typeof FACTION_UNITS.barbarian, budget: number, rng: Rng, rank: number): ArmySlot[] {
  const slots: ArmySlot[] = [];
  let remaining = budget;
  const picks = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < picks; i++) {
    const affordable = roster.filter(u => UNIT_COSTS[u.name] <= remaining);
    if (affordable.length === 0) break;
    // Later ranks increasingly favour quality. A squared roll biases toward
    // the high end without removing deterministic variety.
    const ordered = [...affordable].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    const qualityRoll = 1 - (1 - rng()) ** (1 + Math.min(3, rank / 4));
    const unit = ordered[Math.min(ordered.length - 1, Math.floor(qualityRoll * ordered.length))];
    const cost = UNIT_COSTS[unit.name];
    const share = remaining * (i === picks - 1 ? 0.95 : 0.3 + rng() * 0.4);
    const count = Math.max(1, Math.min(Math.floor(remaining / cost), Math.round(share / cost)));
    const existing = slots.find(s => s.unit.name === unit.name);
    if (existing) existing.count += count;
    else slots.push({ unit, count });
    remaining -= count * cost;
  }
  return slots.slice(0, 4);
}

export interface GauntletEncounter {
  faction: FactionClass;
  budget: number;
  army: ArmySlot[];
  isBoss: boolean;
  enemyBonus: number;
  rank: number;
}

/** Deterministic enemy for the run's current node. */
export function generateGauntletEnemy(run: RunState): GauntletEncounter {
  const n = run.encounterIndex;
  const rng = mulberry32(mixSeed(run.seed, n * 977));
  const faction = FACTIONS[Math.floor(rng() * FACTIONS.length)];
  const act = actOf(n);
  const maxTier = act === 1 ? 3 : act === 2 ? 5 : 7;
  const roster = FACTION_UNITS[faction].filter(u => u.tier <= maxTier);
  const budget = encounterBudget(n);
  return {
    faction,
    budget,
    army: buildArmy(roster, budget, rng, n),
    isBoss: BOSS_NODES.has(n),
    enemyBonus: enemyBonus(n),
    rank: n,
  };
}

export function enemyBonus(rank: number): number {
  return Math.floor((Math.max(1, rank) - 1) / 2);
}

/** Three distinct own-faction unit cards, tier-gated by node progression. */
export function draftOptions(run: RunState): UnitCard[] {
  const node = run.encounterIndex;
  const maxTier = node <= 2 ? 2 : node <= 5 ? 3 : node <= 8 ? 5 : 7;
  const power = node <= 3 ? 60 : node <= 7 ? 110 : 170;
  const atCap = run.army.length >= MAX_STACKS;
  const ownNames = new Set(run.army.map(s => s.unit.name));
  // Round 9 is the tier-7 graduation draft: always reserve one card for the
  // faction's capstone unit (Bone Dragon for Necromancer). This exception also
  // bypasses the normal full-army filter so filling every slot earlier cannot
  // permanently lock the capstone out of the run.
  const guaranteed = node === 9
    ? FACTION_UNITS[run.faction].find(u => u.tier === 7)
    : undefined;

  let pool = FACTION_UNITS[run.faction].filter(u => u.tier >= 1 && u.tier <= maxTier);
  if (atCap) {
    const owned = pool.filter(u => ownNames.has(u.name));
    if (owned.length >= 1) {
      pool = guaranteed && !ownNames.has(guaranteed.name) ? [...owned, guaranteed] : owned;
    }
  }

  const rng = mulberry32(mixSeed(run.seed, run.encounterIndex * 449 + run.battlesWon));
  const cards: UnitCard[] = [];
  const used = new Set<string>();
  if (guaranteed) {
    cards.push({
      unitName: guaranteed.name,
      count: Math.max(1, Math.round(power / UNIT_COSTS[guaranteed.name])),
    });
    used.add(guaranteed.name);
  }
  for (let guard = 0; cards.length < Math.min(3, pool.length) && guard < 50; guard++) {
    const unit = pool[Math.floor(rng() * pool.length)];
    if (used.has(unit.name)) continue;
    used.add(unit.name);
    cards.push({ unitName: unit.name, count: Math.max(1, Math.round(power / UNIT_COSTS[unit.name])) });
  }
  return cards;
}

export function applyPick(run: RunState, card: UnitCard): RunState {
  const unit = FACTION_UNITS[run.faction].find(u => u.name === card.unitName)!;
  const existing = run.army.find(s => s.unit.name === card.unitName);
  const army = existing
    ? run.army.map(s => (s.unit.name === card.unitName ? { ...s, count: s.count + card.count } : s))
    : [...run.army, { unit, count: card.count }];
  // Offer drafts grant one of each kind; the draft holds until all are taken.
  return { ...run, army, pendingDraft: null, status: stillDrafting({ ...run, pendingDraft: null }) };
}

/** 'draft' while any offer (units, items, skills) is unclaimed. */
function stillDrafting(run: RunState): 'draft' | 'map' {
  return run.pendingDraft || run.pendingItems || run.pendingSkills ? 'draft' : 'map';
}

export function applyItemPick(run: RunState, itemId: ItemId): RunState {
  return {
    ...run,
    items: addItem(run.items, itemId),
    pendingItems: null,
    status: stillDrafting({ ...run, pendingItems: null }),
  };
}

/** Teach `skillId` to a unit type for the rest of the run. Each pick grants
 *  +1 level; leveled skills stack additively (capped by the ability catalog),
 *  unique skills are once-only — an invalid pick is a no-op. */
export function applySkillPick(run: RunState, skillId: SkillId, unitName: string): RunState {
  const slot = run.army.find(s => s.unit.name === unitName);
  if (!slot || !canLearnSkill(slot, run.unitSkills, skillId)) return run;
  const existing = run.unitSkills[unitName] ?? {};
  const current = existing[skillId] ?? 0;
  const next = isUnique(skillId) ? 1 : addAbilityLevels(skillId, current, 1);
  return {
    ...run,
    unitSkills: { ...run.unitSkills, [unitName]: { ...existing, [skillId]: next } },
    pendingSkills: null,
    status: stillDrafting({ ...run, pendingSkills: null }),
  };
}

/** Record a completed encounter. Gauntlet casualties are battle-scoped: every
 *  persistent army slot returns at full strength for the next encounter. */
export function recordBattle(run: RunState, won: boolean): RunState {
  if (!won) return { ...run, status: 'lost' };

  const hero = updateFactionSkills({
    ...run.hero,
    level: run.hero.level + 1,
  });
  const next: RunState = {
    ...run,
    hero,
    army: run.army,
    battlesWon: run.battlesWon + 1,
    encounterIndex: run.encounterIndex + 1,
    endlessDepth: run.encounterIndex >= RUN_LENGTH ? run.endlessDepth + 1 : 0,
    pendingDraft: null,
    status: 'map',
  };
  return {
    ...next,
    status: 'draft',
    pendingDraft: draftOptions(next),
    pendingItems: next.battlesWon % 3 === 0 ? itemDraftOptions(next) : null,
    pendingSkills: next.battlesWon % 3 === 2 ? skillDraftOptions(next) : null,
  };
}
