import type Database from 'better-sqlite3';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import type { ClientMessage, RoomPlayer, ServerMessage } from './protocol.ts';
import { RoomError, RoomRegistry, type Room, type RoomActionEntry } from './rooms.ts';

export interface WsServiceOptions {
  heartbeatMs?: number;
  helloTimeoutMs?: number;
  maxReplayGap?: number;
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
  const wss = new WebSocketServer({ noServer: true });
  const connections = new Map<WebSocket, Connection>();
  const byPlayer = new Map<string, WebSocket>();
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
        const room = rooms.create(connection.playerId, message.loadout);
        sendRoomState(room);
      } else if (message.type === 'room.join') {
        const room = rooms.join(message.code, connection.playerId, message.loadout);
        broadcast(room, { type: 'room.peer', event: 'joined', playerId: connection.playerId }, socket);
        sendRoomState(room);
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
    byPlayer.set(row.id, socket);
    send(socket, { type: 'hello.ok', playerId: row.id });

    const room = rooms.findForPlayer(row.id);
    if (!room) {
      if (lastSeq !== undefined) send(socket, { type: 'error', code: 'room_gone', msg: 'room no longer exists' });
      return;
    }
    sendRoomState(room);
    broadcast(room, { type: 'room.peer', event: 'reconnected', playerId: row.id }, socket);
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
  }

  function handleClose(socket: WebSocket): void {
    const connection = connections.get(socket);
    if (!connection) return;
    clearTimeout(connection.helloTimer);
    connections.delete(socket);
    if (!connection.playerId || byPlayer.get(connection.playerId) !== socket) return;
    byPlayer.delete(connection.playerId);
    const room = rooms.findForPlayer(connection.playerId);
    if (room) broadcast(room, { type: 'room.peer', event: 'left', playerId: connection.playerId });
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
      broadcast(room, {
        type: 'battle.applied',
        seq: entry.seq,
        byController: entry.controller,
        action: entry.action,
        stateHash: entry.stateHash,
      });
    },
    broadcastRoomState: sendRoomState,
    close(): Promise<void> {
      clearInterval(heartbeat);
      server.off('upgrade', onUpgrade);
      for (const socket of wss.clients) socket.terminate();
      return new Promise(resolve => wss.close(() => resolve()));
    },
  };
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
