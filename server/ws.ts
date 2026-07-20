import type Database from 'better-sqlite3';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import type { ClientMessage, RoomPlayer, ServerMessage } from './protocol.ts';
import { RoomError, RoomRegistry, type Room, type RoomActionEntry } from './rooms.ts';
import { aiTakeTurn } from '../src/lib/engine/ai.ts';
import { beginCombat, deployMove, initBattle, splitStack } from '../src/lib/engine/battle.ts';
import { FACTION_UNITS } from '../src/lib/engine/factions.ts';
import { updateFactionSkills } from '../src/lib/engine/factionSkills.ts';
import { budgetForLevel, xpToReach } from '../src/lib/engine/progression.ts';
import { armyCost, MAX_STACKS } from '../src/lib/engine/recruit.ts';
import { canShootTarget, getAttackOrigins, getReachableCells, isShootingBlocked } from '../src/lib/engine/selectors.ts';
import type { BattleAction, BattleState } from '../src/lib/engine/types.ts';
import type { CoopLoadout } from './protocol.ts';

export interface WsServiceOptions {
  heartbeatMs?: number;
  helloTimeoutMs?: number;
  maxReplayGap?: number;
  disconnectGraceMs?: number;
  deployTimeoutMs?: number;
}

interface UpgradeServer {
  on(event: 'upgrade', listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown;
  off(event: 'upgrade', listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown;
}

interface Connection {
  playerId?: string;
  awaitingPong: boolean;
  missedPongs: number;
  helloTimer: ReturnType<typeof setTimeout>;
}

export function attachWebSocketServer(
  server: UpgradeServer,
  db: Database.Database,
  rooms: RoomRegistry,
  options: WsServiceOptions = {}
) {
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const helloTimeoutMs = options.helloTimeoutMs ?? 5_000;
  const maxReplayGap = options.maxReplayGap ?? 200;
  const disconnectGraceMs = options.disconnectGraceMs ?? 10 * 60 * 1000;
  const deployTimeoutMs = options.deployTimeoutMs ?? 60_000;
  const wss = new WebSocketServer({ noServer: true });
  const connections = new Map<WebSocket, Connection>();
  const byPlayer = new Map<string, WebSocket>();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const deployTimers = new Map<string, { remaining: number; startedAt: number; timer?: ReturnType<typeof setTimeout> }>();
  const playerByToken = db.prepare('SELECT id FROM players WHERE token = ?');

  const onUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  };
  server.on('upgrade', onUpgrade);

  wss.on('connection', socket => {
    const connection: Connection = {
      awaitingPong: false,
      missedPongs: 0,
      helloTimer: setTimeout(() => {
        send(socket, { type: 'error', code: 'hello_timeout', msg: 'hello required' });
        socket.close(4000, 'hello required');
      }, helloTimeoutMs),
    };
    connections.set(socket, connection);
    socket.on('message', data => handleMessage(socket, data));
    socket.on('close', () => handleClose(socket));
    socket.on('error', () => {});
  });

  function handleMessage(socket: WebSocket, data: RawData): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      return send(socket, { type: 'error', code: 'bad_json', msg: 'invalid JSON message' });
    }
    const connection = connections.get(socket)!;
    if (message.type === 'pong') {
      connection.awaitingPong = false;
      connection.missedPongs = 0;
      return;
    }
    if (message.type === 'ping') return send(socket, { type: 'pong' });
    if (message.type === 'hello') {
      if (connection.playerId) {
        return send(socket, { type: 'error', code: 'already_authenticated', msg: 'hello already received' });
      }
      return hello(socket, message.token, message.lastSeq);
    }
    if (!connection.playerId) {
      return send(socket, { type: 'error', code: 'not_authenticated', msg: 'send hello first' });
    }

    try {
      if (message.type === 'room.create') {
        const loadout = requireLoadout(message.loadout);
        const room = rooms.create(connection.playerId, loadout);
        sendRoomState(room);
      } else if (message.type === 'room.join') {
        const loadout = requireLoadout(message.loadout);
        const room = rooms.join(message.code, connection.playerId, loadout);
        broadcast(room, { type: 'room.peer', event: 'joined', playerId: connection.playerId }, socket);
        sendRoomState(room);
        prepareDeploy(room);
      } else if (message.type === 'deploy.move' || message.type === 'deploy.split') {
        const room = requiredRoom(connection.playerId, 'deploy');
        const controller = controllerFor(room, connection.playerId);
        const next = message.type === 'deploy.move'
          ? deployMove(room.deployState!, message.unitId, message.to, controller)
          : splitStack(room.deployState!, message.unitId, message.amount, message.to, controller);
        if (next === room.deployState) throw new RoomError('invalid_deploy', 'deployment operation rejected');
        rooms.updateDeploy(room.code, next);
        broadcastDeploy(room);
      } else if (message.type === 'deploy.confirm') {
        const room = requiredRoom(connection.playerId, 'deploy');
        room.confirmed.add(controllerFor(room, connection.playerId));
        broadcastDeploy(room);
        if (room.confirmed.size === 2) finishDeploy(room);
      } else if (message.type === 'battle.action') {
        const room = requiredRoom(connection.playerId, 'battle');
        if (!allConnected(room)) throw new RoomError('waiting_for_peer', 'battle is paused for reconnect');
        if (message.lastSeq !== room.actions.length) throw new RoomError('stale_seq', 'action sequence is stale');
        const controller = controllerFor(room, connection.playerId);
        const actor = room.state!.units.find(unit => unit.id === room.state!.currentUnitId);
        if (!actor || actor.controllerId !== controller) throw new RoomError('not_your_turn', 'current unit belongs to another controller');
        if (!isLegalAction(room.state!, message.action)) throw new RoomError('invalid_action', 'action is not legal');
        broadcastApplied(room, rooms.appendAction(room.code, controller, message.action));
        driveAi(room);
      } else if (message.type === 'chat.send') {
        const room = requiredRoom(connection.playerId, 'battle');
        const controller = controllerFor(room, connection.playerId);
        const saved = rooms.appendChat(room.code, controller, message.text);
        broadcast(room, { type: 'chat.message', afterSeq: saved.afterSeq, byController: controller, text: saved.text, ts: saved.ts });
      } else if (message.type === 'resync.request') {
        const room = rooms.findForPlayer(connection.playerId);
        if (!room?.state) throw new RoomError('room_gone', 'no live room found');
        send(socket, { type: 'battle.resync', state: room.state, lastSeq: room.actions.length });
      }
    } catch (error) {
      if (error instanceof RoomError) send(socket, { type: 'error', code: error.code, msg: error.message });
      else {
        console.error('ws message error:', error);
        send(socket, { type: 'error', code: 'internal', msg: 'internal server error' });
      }
    }
  }

  function hello(socket: WebSocket, token: string, lastSeq?: number): void {
    const row = playerByToken.get(token) as { id: string } | undefined;
    if (!row) return send(socket, { type: 'error', code: 'unauthorized', msg: 'invalid token' });
    const connection = connections.get(socket)!;
    clearTimeout(connection.helloTimer);
    const old = byPlayer.get(row.id);
    if (old && old !== socket) {
      send(old, { type: 'error', code: 'superseded', msg: 'a newer session connected' });
      old.close(4001, 'superseded');
    }
    connection.playerId = row.id;
    const disconnectTimer = disconnectTimers.get(row.id);
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimers.delete(row.id);
    byPlayer.set(row.id, socket);
    send(socket, { type: 'hello.ok', playerId: row.id });

    const room = rooms.findForPlayer(row.id);
    if (!room) {
      if (lastSeq !== undefined) send(socket, { type: 'error', code: 'room_gone', msg: 'room no longer exists' });
      return;
    }
    sendRoomState(room);
    broadcast(room, { type: 'room.peer', event: 'reconnected', playerId: row.id }, socket);
    broadcast(room, { type: 'room.waiting', waiting: false });
    if (allConnected(room)) resumeDeployTimer(room);
    if (room.phase === 'deploy' && room.deployState) {
      send(socket, { type: 'deploy.state', state: room.deployState, confirmed: [...room.confirmed] });
    }
    if (!room.state) return;
    if (
      lastSeq !== undefined &&
      Number.isInteger(lastSeq) &&
      lastSeq >= 0 &&
      lastSeq <= room.actions.length &&
      room.actions.length - lastSeq <= maxReplayGap
    ) {
      for (const entry of room.actions.slice(lastSeq)) sendApplied(socket, entry);
    } else {
      send(socket, { type: 'battle.resync', state: room.state, lastSeq: room.actions.length });
    }
    for (const chat of rooms.chat(room.code)) {
      send(socket, { type: 'chat.message', afterSeq: chat.afterSeq, byController: chat.controller, text: chat.text, ts: chat.ts });
    }
  }

  function handleClose(socket: WebSocket): void {
    const connection = connections.get(socket);
    if (!connection) return;
    clearTimeout(connection.helloTimer);
    connections.delete(socket);
    if (!connection.playerId || byPlayer.get(connection.playerId) !== socket) return;
    byPlayer.delete(connection.playerId);
    const room = rooms.findForPlayer(connection.playerId);
    if (room) {
      freezeDeployTimer(room);
      broadcast(room, { type: 'room.peer', event: 'left', playerId: connection.playerId });
      broadcast(room, { type: 'room.waiting', waiting: true });
      const playerId = connection.playerId;
      const timer = setTimeout(() => {
        if (byPlayer.has(playerId)) return;
        broadcast(room, { type: 'battle.end', result: 'abandoned' });
        clearRoomTimers(room);
        rooms.abandon(room.code);
      }, disconnectGraceMs);
      disconnectTimers.set(playerId, timer);
    }
  }

  function roomPlayers(room: Room): RoomPlayer[] {
    return [room.host, ...(room.guest ? [room.guest] : [])].map(member => ({
      playerId: member.playerId,
      controllerId: member.controllerId,
      connected: byPlayer.has(member.playerId),
    }));
  }

  function sendRoomState(room: Room): void {
    broadcast(room, {
      type: 'room.state',
      code: room.code,
      phase: room.phase,
      players: roomPlayers(room),
      ...(room.battleId ? { battleId: room.battleId } : {}),
      lastSeq: room.actions.length,
    });
  }

  function broadcast(room: Room, message: ServerMessage, except?: WebSocket): void {
    for (const member of [room.host, room.guest]) {
      if (!member) continue;
      const socket = byPlayer.get(member.playerId);
      if (socket && socket !== except) send(socket, message);
    }
  }

  function sendApplied(socket: WebSocket, entry: RoomActionEntry): void {
    send(socket, {
      type: 'battle.applied',
      seq: entry.seq,
      byController: entry.controller,
      action: entry.action,
      stateHash: entry.stateHash,
    });
  }

  function broadcastApplied(room: Room, entry: RoomActionEntry): void {
    broadcast(room, {
      type: 'battle.applied', seq: entry.seq, byController: entry.controller,
      action: entry.action, stateHash: entry.stateHash,
    });
    if (room.state?.result !== 'ongoing') {
      broadcast(room, { type: 'battle.end', result: room.state!.result });
      clearRoomTimers(room);
      rooms.finish(room.code);
    }
  }

  function prepareDeploy(room: Room): void {
    const host = parseLoadout(room.host.loadout);
    const guest = parseLoadout(room.guest?.loadout);
    if (!host || !guest) throw new RoomError('invalid_loadout', 'both players need a hero and army');
    const enemyArmy = [...host.army, ...guest.army]
      .map(slot => ({ ...slot, count: Math.max(1, Math.ceil(slot.count * 0.75)) }));
    const deploy = initBattle(
      host.army, enemyArmy, host.hero, Date.now() % 2 ** 31, guest.army, undefined,
      { controllers: { player: 'host', ally: 'guest', enemy: 'ai' }, allyHero: guest.hero }
    );
    rooms.setDeploy(room.code, deploy);
    sendRoomState(room);
    broadcastDeploy(room);
    startDeployTimer(room, deployTimeoutMs);
  }

  function broadcastDeploy(room: Room): void {
    broadcast(room, { type: 'deploy.state', state: room.deployState!, confirmed: [...room.confirmed] });
  }

  function requiredRoom(playerId: string, phase: Room['phase']): Room {
    const room = rooms.findForPlayer(playerId);
    if (!room) throw new RoomError('room_gone', 'room no longer exists');
    if (room.phase !== phase) throw new RoomError('invalid_phase', `room is not in ${phase}`);
    return room;
  }

  function controllerFor(room: Room, playerId: string): 'host' | 'guest' {
    if (room.host.playerId === playerId) return 'host';
    if (room.guest?.playerId === playerId) return 'guest';
    throw new RoomError('not_in_room', 'player is not in this room');
  }

  function allConnected(room: Room): boolean {
    return byPlayer.has(room.host.playerId) && !!room.guest && byPlayer.has(room.guest.playerId);
  }

  function driveAi(room: Room): void {
    while (room.state?.result === 'ongoing') {
      const actor = room.state.units.find(unit => unit.id === room.state!.currentUnitId);
      if (!actor || actor.controllerId !== 'ai') break;
      broadcastApplied(room, rooms.appendAction(room.code, 'ai', aiTakeTurn(room.state, actor.id)));
    }
  }

  function finishDeploy(room: Room): void {
    if (room.phase !== 'deploy' || !room.deployState) return;
    const tracked = deployTimers.get(room.code);
    if (tracked?.timer) clearTimeout(tracked.timer);
    deployTimers.delete(room.code);
    const combat = beginCombat(room.deployState);
    rooms.startBattle(room.code, combat);
    broadcast(room, { type: 'battle.start', initialState: combat });
    sendRoomState(room);
    driveAi(room);
  }

  function startDeployTimer(room: Room, remaining: number): void {
    const tracked = { remaining, startedAt: Date.now(), timer: undefined as ReturnType<typeof setTimeout> | undefined };
    tracked.timer = setTimeout(() => {
      try {
        finishDeploy(room);
      } catch (error) {
        console.error('deploy timer error:', error);
      }
    }, remaining);
    deployTimers.set(room.code, tracked);
  }

  function clearRoomTimers(room: Room): void {
    const deploy = deployTimers.get(room.code);
    if (deploy?.timer) clearTimeout(deploy.timer);
    deployTimers.delete(room.code);
    for (const member of [room.host, room.guest]) {
      if (!member) continue;
      const disconnect = disconnectTimers.get(member.playerId);
      if (disconnect) clearTimeout(disconnect);
      disconnectTimers.delete(member.playerId);
    }
  }

  function freezeDeployTimer(room: Room): void {
    const tracked = deployTimers.get(room.code);
    if (!tracked?.timer) return;
    clearTimeout(tracked.timer);
    tracked.remaining = Math.max(0, tracked.remaining - (Date.now() - tracked.startedAt));
    tracked.timer = undefined;
  }

  function resumeDeployTimer(room: Room): void {
    const tracked = deployTimers.get(room.code);
    if (!tracked || tracked.timer || room.phase !== 'deploy') return;
    startDeployTimer(room, tracked.remaining);
  }

  const heartbeat = setInterval(() => {
    for (const [socket, connection] of connections) {
      if (connection.awaitingPong) connection.missedPongs++;
      if (connection.missedPongs >= 2) {
        socket.terminate();
        continue;
      }
      connection.awaitingPong = true;
      send(socket, { type: 'ping' });
    }
  }, heartbeatMs);

  return {
    broadcastApplied(room: Room, entry: RoomActionEntry): void {
      broadcastApplied(room, entry);
    },
    broadcastRoomState: sendRoomState,
    close(): Promise<void> {
      clearInterval(heartbeat);
      for (const timer of disconnectTimers.values()) clearTimeout(timer);
      for (const tracked of deployTimers.values()) if (tracked.timer) clearTimeout(tracked.timer);
      server.off('upgrade', onUpgrade);
      for (const socket of wss.clients) socket.terminate();
      return new Promise(resolve => wss.close(() => resolve()));
    },
  };
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function parseLoadout(value: unknown): CoopLoadout | null {
  if (!value || typeof value !== 'object') return null;
  const loadout = value as Partial<CoopLoadout>;
  const hero = loadout.hero as Partial<CoopLoadout['hero']> | undefined;
  if (
    !hero || !['barbarian', 'knight', 'wizard', 'necromancer', 'ranger', 'demon'].includes(hero.class ?? '') ||
    !Number.isInteger(hero.level) || hero.level! < 1 || !Number.isInteger(hero.xp) || hero.xp! < xpToReach(hero.level!) ||
    hero.xp! >= xpToReach(hero.level! + 1) || hero.attack !== hero.level! + 1 || hero.defense !== hero.level ||
    hero.statPoints !== 0 || !Array.isArray(loadout.army) || loadout.army.length === 0 || loadout.army.length > MAX_STACKS
  ) return null;
  const faction = hero.class as CoopLoadout['hero']['class'];
  const seen = new Set<string>();
  const army: CoopLoadout['army'] = [];
  for (const slot of loadout.army) {
    if (!Number.isInteger(slot?.count) || slot.count < 1 || !slot?.unit || typeof slot.unit.name !== 'string') return null;
    const unit = FACTION_UNITS[faction].find(candidate => candidate.name === slot.unit.name);
    if (!unit || seen.has(unit.name)) return null;
    seen.add(unit.name);
    army.push({ unit, count: slot.count });
  }
  if (armyCost(army) > budgetForLevel(hero.level!)) return null;
  const canonicalHero = updateFactionSkills({
    class: faction,
    ...(typeof hero.name === 'string' && hero.name.trim() ? { name: hero.name.trim().slice(0, 40) } : {}),
    level: hero.level!, xp: hero.xp!, attack: hero.attack!, defense: hero.defense!,
    statPoints: 0, factionSkills: [],
  });
  return { hero: canonicalHero, army };
}

function requireLoadout(value: unknown): CoopLoadout {
  const loadout = parseLoadout(value);
  if (!loadout) throw new RoomError('invalid_loadout', 'a valid hero and army are required');
  return loadout;
}

function isLegalAction(state: BattleState, action: BattleAction): boolean {
  const actor = state.units.find(unit => unit.id === state.currentUnitId);
  if (!actor || actor.count <= 0) return false;
  if (action.type === 'wait' || action.type === 'defend' || action.type === 'cast') return true;
  if (action.type === 'move') {
    return isPos(action.to) && getReachableCells(state.grid, actor).some(pos => samePos(pos, action.to));
  }
  const target = state.units.find(unit => unit.id === action.targetId);
  if (!target || target.count <= 0 || target.side === actor.side || target.isHero) return false;
  if (action.type === 'shoot') return canShootTarget(actor, target) && !isShootingBlocked(state, actor);
  const origins = getAttackOrigins(state, actor, target);
  return action.moveTo && isPos(action.moveTo)
    ? origins.some(pos => samePos(pos, action.moveTo!))
    : origins.some(pos => samePos(pos, actor.pos));
}

function isPos(value: unknown): value is { col: number; row: number } {
  if (!value || typeof value !== 'object') return false;
  const pos = value as { col?: unknown; row?: unknown };
  return Number.isInteger(pos.col) && Number.isInteger(pos.row);
}

function samePos(a: { col: number; row: number }, b: { col: number; row: number }): boolean {
  return a.col === b.col && a.row === b.row;
}
