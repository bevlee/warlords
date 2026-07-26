import { getSave, putSave, deleteSave } from '../net/api';
import { ENCOUNTERS, type Encounter } from './encounters';
import type { FactionClass } from '../engine/types';

export interface CampaignState {
  faction: FactionClass; // chosen when the campaign starts; never written again
  chapter: number;   // 1–5
  encounter: number; // 0-based index within the chapter
  completed: boolean; // true once every encounter has been beaten
  heroSaveId: string; // links to the hero record
}

export type NodeStatus = 'locked' | 'available' | 'completed';

export function newCampaign(faction: FactionClass, heroSaveId = 'default'): CampaignState {
  return { faction, chapter: 1, encounter: 0, completed: false, heroSaveId };
}

/**
 * Loads the saved campaign, backfilling the faction lock for campaigns written
 * before it existed: whatever class that save's hero is already playing is the
 * faction it is locked to. `fallbackFaction` is the caller's loaded hero class.
 */
export async function loadCampaign(fallbackFaction: FactionClass): Promise<CampaignState | null> {
  const saved = await getSave<CampaignState>('campaign');
  if (!saved) return null;
  return saved.faction ? saved : { ...saved, faction: fallbackFaction };
}

export async function saveCampaign(state: CampaignState): Promise<void> {
  await putSave('campaign', state);
}

export async function resetCampaign(): Promise<void> {
  await deleteSave('campaign');
}

export function encountersInChapter(chapter: number): Encounter[] {
  return ENCOUNTERS.filter(e => e.chapter === chapter);
}

export function totalChapters(): number {
  return Math.max(...ENCOUNTERS.map(e => e.chapter));
}

export function currentEncounter(state: CampaignState): Encounter | null {
  return encountersInChapter(state.chapter)[state.encounter] ?? null;
}

export function nodeStatus(state: CampaignState, chapter: number, encounterIndex: number): NodeStatus {
  if (chapter < state.chapter) return 'completed';
  if (chapter > state.chapter) return 'locked';
  if (encounterIndex < state.encounter) return 'completed';
  if (encounterIndex === state.encounter) return 'available';
  return 'locked';
}

/** Advances past the current encounter after a win, rolling into the next chapter (or finishing the campaign). */
export function advanceCampaign(state: CampaignState): CampaignState {
  const next = state.encounter + 1;
  if (next < encountersInChapter(state.chapter).length) {
    return { ...state, encounter: next };
  }
  const nextChapter = state.chapter + 1;
  if (nextChapter > totalChapters()) {
    return { ...state, completed: true };
  }
  return { ...state, chapter: nextChapter, encounter: 0 };
}
