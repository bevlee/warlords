import type { BattleAction, Pos, SpellId } from '../src/lib/engine/types.ts';
import type {
  ClientMessage,
  CoopLoadout,
  ControllerId,
  RoomPhase,
  RoomPlayer,
  ServerMessage,
} from '../src/lib/net/protocol.ts';

export type {
  ClientMessage,
  CoopLoadout,
  ControllerId,
  RoomPhase,
  RoomPlayer,
  ServerMessage,
};

export type AuthenticatedClientMessage = Exclude<
  ClientMessage,
  { type: 'hello' | 'ping' | 'pong' }
>;

/** Validate and normalize untrusted JSON before it reaches auth or game logic. */
export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'hello':
      if (!isNonEmptyString(value.token) || !isOptionalSequence(value.lastSeq)) return null;
      return {
        type: 'hello',
        token: value.token,
        ...(value.lastSeq === undefined ? {} : { lastSeq: value.lastSeq }),
      };
    case 'room.create':
      return hasOwn(value, 'loadout') ? { type: 'room.create', loadout: value.loadout } : null;
    case 'room.join':
      return typeof value.code === 'string' && /^[A-Za-z]{5}$/.test(value.code) && hasOwn(value, 'loadout')
        ? { type: 'room.join', code: value.code, loadout: value.loadout }
        : null;
    case 'deploy.move': {
      const to = parsePos(value.to);
      return isNonEmptyString(value.unitId) && to
        ? { type: 'deploy.move', unitId: value.unitId, to }
        : null;
    }
    case 'deploy.split': {
      const to = parsePos(value.to);
      return isNonEmptyString(value.unitId) && isPositiveInteger(value.amount) && to
        ? { type: 'deploy.split', unitId: value.unitId, amount: value.amount, to }
        : null;
    }
    case 'deploy.confirm':
      return { type: 'deploy.confirm' };
    case 'battle.action': {
      const action = parseBattleAction(value.action);
      return isSequence(value.lastSeq) && action
        ? { type: 'battle.action', lastSeq: value.lastSeq, action }
        : null;
    }
    case 'chat.send':
      return typeof value.text === 'string' ? { type: 'chat.send', text: value.text } : null;
    case 'resync.request':
      return { type: 'resync.request' };
    case 'ping':
      return { type: 'ping' };
    case 'pong':
      return { type: 'pong' };
    default:
      return null;
  }
}

function parseBattleAction(value: unknown): BattleAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'move': {
      const to = parsePos(value.to);
      return to ? { type: 'move', to } : null;
    }
    case 'attack': {
      if (!isNonEmptyString(value.targetId)) return null;
      if (value.moveTo === undefined) return { type: 'attack', targetId: value.targetId };
      const moveTo = parsePos(value.moveTo);
      return moveTo ? { type: 'attack', targetId: value.targetId, moveTo } : null;
    }
    case 'shoot':
      return isNonEmptyString(value.targetId) ? { type: 'shoot', targetId: value.targetId } : null;
    case 'cast':
      return isSpellId(value.spell) && isNonEmptyString(value.targetId)
        ? { type: 'cast', spell: value.spell, targetId: value.targetId }
        : null;
    case 'defend':
      return { type: 'defend' };
    case 'wait':
      return { type: 'wait' };
    default:
      return null;
  }
}

function parsePos(value: unknown): Pos | null {
  if (!isRecord(value) || !Number.isInteger(value.col) || !Number.isInteger(value.row)) return null;
  return { col: value.col as number, row: value.row as number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSequence(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isOptionalSequence(value: unknown): value is number | undefined {
  return value === undefined || isSequence(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isSpellId(value: unknown): value is SpellId {
  return value === 'lightning' || value === 'bloodlust' || value === 'stoneskin';
}
