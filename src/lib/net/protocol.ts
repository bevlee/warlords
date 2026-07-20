import type { BattleAction, BattleState } from '../engine/types.ts';

export type ControllerId = 'host' | 'guest' | 'ai';
export type RoomPhase = 'lobby' | 'deploy' | 'battle';

export interface RoomPlayer {
  playerId: string;
  controllerId: 'host' | 'guest';
  connected: boolean;
}

export type ClientMessage =
  | { type: 'hello'; token: string; lastSeq?: number }
  | { type: 'room.create'; loadout: unknown }
  | { type: 'room.join'; code: string; loadout: unknown }
  | { type: 'resync.request' }
  | { type: 'ping' }
  | { type: 'pong' };

export type ServerMessage =
  | { type: 'hello.ok'; playerId: string }
  | { type: 'room.state'; code: string; phase: RoomPhase; players: RoomPlayer[]; battleId?: string; lastSeq: number }
  | { type: 'room.peer'; event: 'joined' | 'left' | 'reconnected'; playerId: string }
  | { type: 'battle.applied'; seq: number; byController: ControllerId; action: BattleAction; stateHash: string }
  | { type: 'battle.resync'; state: BattleState; lastSeq: number }
  | { type: 'error'; code: string; msg: string }
  | { type: 'ping' }
  | { type: 'pong' };
