import type { ArmySlot, Hero, Pos, UnitDef } from './types';
import { mulberry32, mixSeed } from './rng';
import { getTacticsShift } from './factionSkills';

export const GRID_W = 12;
export const GRID_H = 10;

/** How many stacks may stand on the field after splitting (recruiting still
 *  caps at 6 unit types; splitting during deployment raises the field cap). */
export const MAX_FIELD_STACKS = 7;

export interface Deployment {
  unit: UnitDef;
  count: number;
  pos: Pos;
}

const OBSTACLE_SALT = 0x0b57ac1e;
const OBSTACLE_COUNT = 7;
// Rocks stay clear of both deployment zones: the player zone reaches col 4
// at expert Tactics, the enemy line sits at col 10.
const OBSTACLE_MIN_COL = 5;
const OBSTACLE_MAX_COL = 8;

/**
 * Rock positions for a battlefield seed. An independent RNG stream
 * (mixSeed) so the layout never shifts with army composition — the
 * deployment preview and the battle must agree on the rocks even when the
 * player splits stacks between the two.
 */
export function generateObstacles(seed: number): Pos[] {
  const rng = mulberry32(mixSeed(seed, OBSTACLE_SALT));
  const taken = new Set<string>();
  const rocks: Pos[] = [];
  for (let guard = 0; rocks.length < OBSTACLE_COUNT && guard < 100; guard++) {
    const col = OBSTACLE_MIN_COL + Math.floor(rng() * (OBSTACLE_MAX_COL - OBSTACLE_MIN_COL + 1));
    const row = Math.floor(rng() * GRID_H);
    const key = `${col},${row}`;
    if (taken.has(key)) continue;
    taken.add(key);
    rocks.push({ col, row });
  }
  return rocks;
}

/** Columns the player may deploy in: 0..1, widened by Knight Tactics. */
export function deployColumns(hero: Hero): number[] {
  const max = 1 + getTacticsShift(hero);
  return Array.from({ length: max + 1 }, (_, i) => i);
}

/** Every cell of the player's deployment zone. */
export function deploymentZone(hero: Hero): Pos[] {
  return deployColumns(hero).flatMap(col =>
    Array.from({ length: GRID_H }, (_, row) => ({ col, row }))
  );
}

/** The pre-deployment auto layout: front column of the zone, spaced rows. */
export function autoDeploy(army: ArmySlot[], hero: Hero): Deployment[] {
  const col = 1 + getTacticsShift(hero);
  return army.map((slot, i) => ({
    unit: slot.unit,
    count: slot.count,
    pos: { col, row: 1 + i * Math.floor((GRID_H - 2) / 6) },
  }));
}

/** Enemy line: mirrors the historical slotToStack layout. */
export function enemyAutoDeploy(army: ArmySlot[]): Deployment[] {
  return army.map((slot, i) => ({
    unit: slot.unit,
    count: slot.count,
    pos: { col: GRID_W - 2, row: 1 + i * Math.floor((GRID_H - 2) / 6) },
  }));
}

/**
 * Checks a player deployment against its source army. Returns an error
 * string, or null when valid. Splits must conserve creatures — every unit
 * bought must stand somewhere, and none may be conjured.
 */
export function validateDeployment(army: ArmySlot[], deployment: Deployment[], hero: Hero): string | null {
  if (deployment.length === 0) return 'no stacks deployed';
  if (deployment.length > MAX_FIELD_STACKS) return `more than ${MAX_FIELD_STACKS} stacks`;

  const zone = new Set(deploymentZone(hero).map(p => `${p.col},${p.row}`));
  const seen = new Set<string>();
  for (const d of deployment) {
    if (d.count < 1) return `empty stack of ${d.unit.name}`;
    const key = `${d.pos.col},${d.pos.row}`;
    if (!zone.has(key)) return `${d.unit.name} outside the deployment zone`;
    if (seen.has(key)) return `two stacks on cell ${key}`;
    seen.add(key);
  }

  const bought = new Map<string, number>();
  for (const s of army) bought.set(s.unit.name, (bought.get(s.unit.name) ?? 0) + s.count);
  const fielded = new Map<string, number>();
  for (const d of deployment) fielded.set(d.unit.name, (fielded.get(d.unit.name) ?? 0) + d.count);

  for (const [name, n] of bought) {
    if ((fielded.get(name) ?? 0) !== n) return `count mismatch for ${name}`;
  }
  for (const name of fielded.keys()) {
    if (!bought.has(name)) return `${name} was never recruited`;
  }
  return null;
}

/** A deployment being edited: unplaced stacks sit in the tray with pos null. */
export interface DraftEntry {
  unit: UnitDef;
  count: number;
  pos: Pos | null;
}

/**
 * Moves `count` creatures out of entry `index` into a new unplaced tray
 * entry. Returns null when the split is illegal (cap reached, or the donor
 * can't spare that many while keeping at least one creature).
 */
export function splitDraft(draft: DraftEntry[], index: number, count: number): DraftEntry[] | null {
  const donor = draft[index];
  if (!donor || count < 1 || count >= donor.count) return null;
  if (draft.length >= MAX_FIELD_STACKS) return null;
  return [
    ...draft.map((d, i) => (i === index ? { ...d, count: d.count - count } : d)),
    { unit: donor.unit, count, pos: null },
  ];
}

/** Merges entry `from` into same-unit entry `into`, freeing a field slot. */
export function mergeDraft(draft: DraftEntry[], from: number, into: number): DraftEntry[] | null {
  const a = draft[from];
  const b = draft[into];
  if (!a || !b || from === into || a.unit.name !== b.unit.name) return null;
  return draft
    .map((d, i) => (i === into ? { ...d, count: d.count + a.count } : d))
    .filter((_, i) => i !== from);
}
