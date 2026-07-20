import { randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { applyAction } from '../src/lib/engine/battle.ts';
import { ENGINE_VERSION } from '../src/lib/engine/version.ts';
import type { BattleAction, BattleState } from '../src/lib/engine/types.ts';
import type { ControllerId, RoomPhase } from './protocol.ts';
import { battleStateHash } from '../src/lib/net/protocol.ts';
import { summarizeBattle } from '../src/lib/replay/summary.ts';
import { pruneBattleHistory } from './retention.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_RECOVERY_MS = 10 * 60 * 1000;

export interface RoomMember {
  playerId: string;
  controllerId: 'host' | 'guest';
  loadout: unknown;
}

export interface RoomActionEntry {
  seq: number;
  controller: ControllerId;
  action: BattleAction;
  stateHash: string;
}

export interface Room {
  code: string;
  phase: RoomPhase;
  host: RoomMember;
  guest?: RoomMember;
  battleId?: string;
  state?: BattleState;
  initialState?: BattleState;
  deployState?: BattleState;
  confirmed: Set<'host' | 'guest'>;
  actions: RoomActionEntry[];
  lastActivity: number;
}

export class RoomError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly db: Database.Database;
  private readonly now: () => number;
  private readonly recoveryMs: number;

  constructor(
    db: Database.Database,
    now: () => number = Date.now,
    recoveryMs = ROOM_RECOVERY_MS
  ) {
    this.db = db;
    this.now = now;
    this.recoveryMs = recoveryMs;
    this.rehydrate();
  }

  create(hostPlayerId: string, loadout: unknown): Room {
    if (this.findForPlayer(hostPlayerId)) throw new RoomError('already_in_room', 'player is already in a room');
    let code = '';
    do code = roomCode(); while (this.rooms.has(code));
    const timestamp = this.now();
    const room: Room = {
      code,
      phase: 'lobby',
      host: { playerId: hostPlayerId, controllerId: 'host', loadout },
      actions: [],
      confirmed: new Set(),
      lastActivity: timestamp,
    };
    this.db.prepare(
      'INSERT INTO rooms (code, host_player_id, host_loadout, phase, created_at, last_activity) ' +
        'VALUES (?, ?, ?, ?, ?, ?)'
    ).run(code, hostPlayerId, JSON.stringify(loadout), 'lobby', timestamp, timestamp);
    this.rooms.set(code, room);
    return room;
  }

  join(codeInput: string, guestPlayerId: string, loadout: unknown): Room {
    const code = codeInput.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('room_gone', 'room does not exist');
    if (room.host.playerId === guestPlayerId || room.guest?.playerId === guestPlayerId) return room;
    if (this.findForPlayer(guestPlayerId)) throw new RoomError('already_in_room', 'player is already in a room');
    if (room.guest) throw new RoomError('room_full', 'room already has two players');
    if (room.phase !== 'lobby') throw new RoomError('battle_started', 'battle has already started');
    const timestamp = this.now();
    room.guest = { playerId: guestPlayerId, controllerId: 'guest', loadout };
    room.lastActivity = timestamp;
    this.db.prepare(
      'UPDATE rooms SET guest_player_id = ?, guest_loadout = ?, last_activity = ? WHERE code = ?'
    ).run(guestPlayerId, JSON.stringify(loadout), timestamp, code);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  findForPlayer(playerId: string): Room | undefined {
    return [...this.rooms.values()].find(
      room => room.host.playerId === playerId || room.guest?.playerId === playerId
    );
  }

  setDeploy(codeInput: string, state: BattleState): Room {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room?.guest || room.phase !== 'lobby') throw new RoomError('invalid_phase', 'room is not ready to deploy');
    room.phase = 'deploy';
    room.deployState = state;
    room.confirmed = new Set();
    room.lastActivity = this.now();
    this.db.prepare('UPDATE rooms SET phase = ?, last_activity = ? WHERE code = ?')
      .run('deploy', room.lastActivity, room.code);
    return room;
  }

  updateDeploy(codeInput: string, state: BattleState): Room {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room?.deployState || room.phase !== 'deploy') throw new RoomError('invalid_phase', 'room is not deploying');
    room.deployState = state;
    room.lastActivity = this.now();
    this.db.prepare('UPDATE rooms SET last_activity = ? WHERE code = ?').run(room.lastActivity, room.code);
    return room;
  }

  startBattle(codeInput: string, initialState: BattleState): Room {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room) throw new RoomError('room_gone', 'room does not exist');
    if (!room.guest) throw new RoomError('waiting_for_guest', 'room needs a guest');
    if (room.phase !== 'lobby' && room.phase !== 'deploy') throw new RoomError('battle_started', 'battle has already started');
    if (initialState.log.length !== 0) throw new RoomError('invalid_snapshot', 'initial battle log must be empty');
    const battleId = randomUUID();
    const timestamp = this.now();
    this.db.transaction(() => {
      this.db.prepare(
        'INSERT INTO battles ' +
          '(id, mode, player_ids, initial_state, engine_version, started_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        battleId,
        'coop',
        JSON.stringify([room.host.playerId, room.guest!.playerId]),
        JSON.stringify(initialState),
        ENGINE_VERSION,
        timestamp
      );
      this.db.prepare(
        'UPDATE rooms SET battle_id = ?, phase = ?, last_activity = ? WHERE code = ?'
      ).run(battleId, 'battle', timestamp, room.code);
    })();
    room.phase = 'battle';
    room.battleId = battleId;
    room.state = clone(initialState);
    room.initialState = clone(initialState);
    room.deployState = undefined;
    room.actions = [];
    room.lastActivity = timestamp;
    return room;
  }

  appendChat(codeInput: string, controller: 'host' | 'guest', text: string) {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room?.battleId) throw new RoomError('battle_not_started', 'room has no live battle');
    const trimmed = text.trim().slice(0, 300);
    if (!trimmed) throw new RoomError('empty_chat', 'chat message is empty');
    const message = { afterSeq: room.actions.length, controller, text: trimmed, ts: this.now() };
    this.db.prepare(
      'INSERT INTO battle_chat (battle_id, after_seq, controller, text, ts) VALUES (?, ?, ?, ?, ?)'
    ).run(room.battleId, message.afterSeq, controller, trimmed, message.ts);
    return message;
  }

  chat(codeInput: string): Array<{ afterSeq: number; controller: 'host' | 'guest'; text: string; ts: number }> {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room?.battleId) return [];
    const rows = this.db.prepare(
      'SELECT after_seq, controller, text, ts FROM battle_chat WHERE battle_id = ? ORDER BY after_seq, ts'
    ).all(room.battleId) as Array<{ after_seq: number; controller: 'host' | 'guest'; text: string; ts: number }>;
    return rows.map(row => ({ afterSeq: row.after_seq, controller: row.controller, text: row.text, ts: row.ts }));
  }

  abandon(codeInput: string): void {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room) return;
    if (room.battleId && room.state?.result === 'ongoing') {
      const summary = room.initialState ? summarizeBattle(room.initialState, room.state) : null;
      this.db.prepare('UPDATE battles SET result = ?, summary = ?, ended_at = ? WHERE id = ?')
        .run('abandoned', summary ? JSON.stringify(summary) : null, this.now(), room.battleId);
    }
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(room.code);
    this.rooms.delete(room.code);
    pruneBattleHistory(this.db);
  }

  finish(codeInput: string): void {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room || room.state?.result === 'ongoing') return;
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(room.code);
    this.rooms.delete(room.code);
    pruneBattleHistory(this.db);
  }

  appendAction(codeInput: string, controller: ControllerId, action: BattleAction): RoomActionEntry {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room?.battleId || !room.state) throw new RoomError('battle_not_started', 'room has no live battle');
    if (room.state.result !== 'ongoing') throw new RoomError('battle_finished', 'battle is already finished');
    const next = applyAction(room.state, action);
    if (next === room.state) throw new RoomError('invalid_action', 'engine rejected the action');
    const entry: RoomActionEntry = {
      seq: room.actions.length + 1,
      controller,
      action: clone(action),
      stateHash: battleStateHash(next),
    };
    const timestamp = this.now();
    this.db.transaction(() => {
      this.db.prepare(
        'INSERT INTO battle_actions (battle_id, seq, controller, action) VALUES (?, ?, ?, ?)'
      ).run(room.battleId!, entry.seq, controller, JSON.stringify(action));
      this.db.prepare('UPDATE rooms SET last_activity = ? WHERE code = ?').run(timestamp, room.code);
      if (next.result !== 'ongoing') {
        const summary = room.initialState ? summarizeBattle(room.initialState, next) : null;
        this.db.prepare('UPDATE battles SET result = ?, summary = ?, ended_at = ? WHERE id = ?')
          .run(next.result, summary ? JSON.stringify(summary) : null, timestamp, room.battleId!);
      }
    })();
    room.state = next;
    room.actions.push(entry);
    room.lastActivity = timestamp;
    return entry;
  }

  private rehydrate(): void {
    // Deploy/lobby state is intentionally ephemeral; only combat has a durable
    // initial snapshot and journal.
    this.db.prepare("DELETE FROM rooms WHERE phase != 'battle' OR battle_id IS NULL").run();
    const rows = this.db.prepare(
      'SELECT r.*, b.initial_state, b.result FROM rooms r ' +
        'JOIN battles b ON b.id = r.battle_id WHERE r.phase = ?'
    ).all('battle') as RehydrateRow[];
    for (const row of rows) {
      if (row.result !== null) {
        this.db.prepare('DELETE FROM rooms WHERE code = ?').run(row.code);
        continue;
      }
      const initialState = JSON.parse(row.initial_state) as BattleState;
      let state = clone(initialState);
      const actions: RoomActionEntry[] = [];
      const journal = this.db.prepare(
        'SELECT seq, controller, action FROM battle_actions WHERE battle_id = ? ORDER BY seq'
      ).all(row.battle_id) as Array<{ seq: number; controller: ControllerId; action: string }>;
      for (const saved of journal) {
        const action = JSON.parse(saved.action) as BattleAction;
        state = applyAction(state, action);
        actions.push({ seq: saved.seq, controller: saved.controller, action, stateHash: battleStateHash(state) });
      }
      if (row.last_activity < this.now() - this.recoveryMs) {
        const summary = summarizeBattle(initialState, state);
        this.db.prepare('UPDATE battles SET result = ?, summary = ?, ended_at = ? WHERE id = ?')
          .run('abandoned', JSON.stringify(summary), this.now(), row.battle_id);
        this.db.prepare('DELETE FROM rooms WHERE code = ?').run(row.code);
        continue;
      }
      this.rooms.set(row.code, {
        code: row.code,
        phase: 'battle',
        battleId: row.battle_id,
        host: { playerId: row.host_player_id, controllerId: 'host', loadout: JSON.parse(row.host_loadout) },
        guest: row.guest_player_id && row.guest_loadout
          ? { playerId: row.guest_player_id, controllerId: 'guest', loadout: JSON.parse(row.guest_loadout) }
          : undefined,
        state,
        initialState,
        confirmed: new Set(),
        actions,
        lastActivity: row.last_activity,
      });
    }
  }
}

interface RehydrateRow {
  code: string;
  battle_id: string;
  host_player_id: string;
  guest_player_id: string | null;
  host_loadout: string;
  guest_loadout: string | null;
  last_activity: number;
  initial_state: string;
  result: string | null;
}

function roomCode(): string {
  const bytes = randomBytes(5);
  return [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
