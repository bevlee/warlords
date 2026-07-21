import type { ArmySlot, BattleAction, BattleState, Hero, Pos } from '../engine/types.ts';

export type ControllerId = 'host' | 'guest' | 'ai';
export type RoomPhase = 'lobby' | 'deploy' | 'battle';

export interface RoomPlayer {
  playerId: string;
  controllerId: 'host' | 'guest';
  connected: boolean;
}

export interface CoopLoadout {
  hero: Hero;
  army: ArmySlot[];
}

export type ClientMessage =
  | { type: 'hello'; token: string; lastSeq?: number }
  | { type: 'room.create'; loadout: unknown }
  | { type: 'room.join'; code: string; loadout: unknown }
  | { type: 'deploy.move'; unitId: string; to: Pos }
  | { type: 'deploy.split'; unitId: string; amount: number; to: Pos }
  | { type: 'deploy.confirm' }
  | { type: 'battle.action'; lastSeq: number; action: BattleAction }
  | { type: 'chat.send'; text: string }
  | { type: 'resync.request' }
  | { type: 'ping' }
  | { type: 'pong' };

export type ServerMessage =
  | { type: 'hello.ok'; playerId: string }
  | { type: 'room.state'; code: string; phase: RoomPhase; players: RoomPlayer[]; battleId?: string; lastSeq: number }
  | { type: 'room.peer'; event: 'joined' | 'left' | 'reconnected'; playerId: string }
  | { type: 'deploy.state'; state: BattleState; confirmed: Array<'host' | 'guest'> }
  | { type: 'battle.start'; initialState: BattleState }
  | { type: 'battle.end'; result: 'player_wins' | 'enemy_wins' | 'abandoned' }
  | { type: 'battle.applied'; seq: number; byController: ControllerId; action: BattleAction; stateHash: string }
  | { type: 'battle.resync'; state: BattleState; lastSeq: number }
  | { type: 'chat.message'; afterSeq: number; byController: 'host' | 'guest'; text: string; ts: number }
  | { type: 'room.waiting'; waiting: boolean }
  | { type: 'error'; code: string; msg: string }
  | { type: 'ping' }
  | { type: 'pong' };

/** Small deterministic cross-runtime state hash used as a lockstep canary.
 *  Object keys are sorted recursively so snapshots loaded from JSON hash the
 *  same as incrementally-created states regardless of insertion order. */
export function battleStateHash(state: BattleState): string {
  const text = canonicalJson(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
