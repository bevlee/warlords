import { randomUUID, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type Database from 'better-sqlite3';
import { ENGINE_VERSION } from '../src/lib/engine/version.ts';
import { pruneBattleHistory } from './retention.ts';

const SLOTS = new Set(['hero', 'army', 'campaign', 'gauntletRun']);
const MAX_BODY = 256 * 1024;
const ACTION_TYPES = new Set(['move', 'attack', 'shoot', 'defend', 'cast', 'wait']);

type Next = () => void;

interface SoloBattleUpload {
  initialState: Record<string, unknown> & { log: unknown[] };
  actions: Array<{ controller: 'host' | 'ai'; action: Record<string, unknown> }>;
  summary: Record<string, unknown>;
  result: 'player_wins' | 'enemy_wins';
}

/** Connect-style middleware handling /api/*; anything else falls through to
 *  next() (the SPA handler in prod, Vite's stack in dev). Shared verbatim
 *  between server/index.ts and server/dev-plugin.ts. */
export function createApi(db: Database.Database) {
  const stmts = {
    insertPlayer: db.prepare('INSERT INTO players (id, token, created_at) VALUES (?, ?, ?)'),
    playerByToken: db.prepare('SELECT id FROM players WHERE token = ?'),
    getSave: db.prepare('SELECT data FROM saves WHERE player_id = ? AND slot = ?'),
    putSave: db.prepare(
      'INSERT INTO saves (player_id, slot, data, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(player_id, slot) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at'
    ),
    deleteSave: db.prepare('DELETE FROM saves WHERE player_id = ? AND slot = ?'),
    insertBattle: db.prepare(
      'INSERT INTO battles ' +
        '(id, mode, player_ids, initial_state, engine_version, result, summary, started_at, ended_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    insertAction: db.prepare(
      'INSERT INTO battle_actions (battle_id, seq, controller, action) VALUES (?, ?, ?, ?)'
    ),
    listBattles: db.prepare(
      'SELECT b.id, b.mode, b.engine_version, b.result, b.summary, b.started_at, b.ended_at ' +
        'FROM battles b ' +
        'WHERE EXISTS (SELECT 1 FROM json_each(b.player_ids) p WHERE p.value = ?) ' +
        'ORDER BY b.started_at DESC, b.rowid DESC LIMIT 200'
    ),
    getBattle: db.prepare(
      'SELECT b.id, b.mode, b.initial_state, b.engine_version, b.result, b.summary, ' +
        'b.started_at, b.ended_at ' +
        'FROM battles b WHERE b.id = ? ' +
        'AND EXISTS (SELECT 1 FROM json_each(b.player_ids) p WHERE p.value = ?)'
    ),
    battlePlayers: db.prepare('SELECT player_ids FROM battles WHERE id = ?'),
    getActions: db.prepare(
      'SELECT seq, controller, action FROM battle_actions WHERE battle_id = ? ORDER BY seq'
    ),
    getChat: db.prepare(
      'SELECT after_seq, controller, text, ts FROM battle_chat ' +
        'WHERE battle_id = ? ORDER BY after_seq, ts'
    ),
  };

  const insertSoloBattle = db.transaction(
    (id: string, playerId: string, payload: SoloBattleUpload, now: number) => {
      stmts.insertBattle.run(
        id,
        'solo',
        JSON.stringify([playerId]),
        JSON.stringify(payload.initialState),
        ENGINE_VERSION,
        payload.result,
        JSON.stringify(payload.summary),
        now,
        now
      );
      payload.actions.forEach((row, index) => {
        stmts.insertAction.run(id, index + 1, row.controller, JSON.stringify(row.action));
      });
    }
  );

  return function api(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();
    handle(req, res, url).catch(err => {
      console.error('api error:', err);
      if (!res.headersSent) send(res, 500, { error: 'internal' });
      else res.end();
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const { pathname } = url;
    const method = req.method ?? 'GET';

    if (pathname === '/api/health' && method === 'GET') {
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/session' && method === 'POST') {
      const playerId = randomUUID();
      const token = randomBytes(24).toString('base64url');
      stmts.insertPlayer.run(playerId, token, Date.now());
      return send(res, 200, { playerId, token });
    }

    const save = pathname.match(/^\/api\/save\/([^/]+)$/);
    if (save) {
      const playerId = authenticate(req);
      if (!playerId) return send(res, 401, { error: 'unauthorized' });
      const slot = save[1];
      if (!SLOTS.has(slot)) return send(res, 400, { error: 'unknown slot' });

      if (method === 'GET') {
        const row = stmts.getSave.get(playerId, slot) as { data: string } | undefined;
        if (!row) return send(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return void res.end(row.data);
      }
      if (method === 'PUT') {
        const body = await readBody(req);
        if (body === null) return send(res, 400, { error: 'invalid body' });
        stmts.putSave.run(playerId, slot, body, Date.now());
        return void send(res, 204);
      }
      if (method === 'DELETE') {
        stmts.deleteSave.run(playerId, slot);
        return void send(res, 204);
      }
      return send(res, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/battles') {
      const playerId = authenticate(req);
      if (!playerId) return send(res, 401, { error: 'unauthorized' });

      if (method === 'POST') {
        const payload = parseSoloBattle(await readBody(req));
        if (!payload) return send(res, 400, { error: 'invalid battle' });
        const requestedId = req.headers['idempotency-key'];
        if (requestedId !== undefined && (Array.isArray(requestedId) || !isUuid(requestedId))) {
          return send(res, 400, { error: 'invalid idempotency key' });
        }
        const id = requestedId ?? randomUUID();
        const existing = stmts.battlePlayers.get(id) as { player_ids: string } | undefined;
        if (existing) {
          const owners = JSON.parse(existing.player_ids) as unknown[];
          return owners.includes(playerId)
            ? send(res, 200, { id })
            : send(res, 409, { error: 'battle id conflict' });
        }
        insertSoloBattle(id, playerId, payload, Date.now());
        pruneBattleHistory(db);
        return send(res, 201, { id });
      }
      if (method === 'GET') {
        const rows = stmts.listBattles.all(playerId) as BattleListRow[];
        return send(res, 200, rows.map(formatBattleListRow));
      }
      return send(res, 405, { error: 'method not allowed' });
    }

    const battle = pathname.match(/^\/api\/battles\/([^/]+)$/);
    if (battle) {
      const playerId = authenticate(req);
      if (!playerId) return send(res, 401, { error: 'unauthorized' });
      if (method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      const row = stmts.getBattle.get(battle[1], playerId) as BattleDetailRow | undefined;
      if (!row) return send(res, 404, { error: 'not found' });
      const actions = (stmts.getActions.all(row.id) as ActionRow[]).map(action => ({
        seq: action.seq,
        controller: action.controller,
        action: JSON.parse(action.action),
      }));
      const chat = (stmts.getChat.all(row.id) as ChatRow[]).map(message => ({
        afterSeq: message.after_seq,
        controller: message.controller,
        text: message.text,
        ts: message.ts,
      }));
      return send(res, 200, {
        id: row.id,
        mode: row.mode,
        initialState: JSON.parse(row.initial_state),
        engineVersion: row.engine_version,
        result: row.result,
        summary: row.summary === null ? null : JSON.parse(row.summary),
        startedAt: row.started_at,
        endedAt: row.ended_at,
        actions,
        chat,
      });
    }

    send(res, 404, { error: 'not found' });
  }

  function authenticate(req: IncomingMessage): string | null {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    const row = stmts.playerByToken.get(token) as { id: string } | undefined;
    return row?.id ?? null;
  }
}

interface BattleListRow {
  id: string;
  mode: string;
  engine_version: string;
  result: string | null;
  summary: string | null;
  started_at: number;
  ended_at: number | null;
}

interface BattleDetailRow extends BattleListRow {
  initial_state: string;
}

interface ActionRow {
  seq: number;
  controller: string;
  action: string;
}

interface ChatRow {
  after_seq: number;
  controller: string;
  text: string;
  ts: number;
}

function formatBattleListRow(row: BattleListRow) {
  return {
    id: row.id,
    mode: row.mode,
    engineVersion: row.engine_version,
    result: row.result,
    summary: row.summary === null ? null : JSON.parse(row.summary),
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseSoloBattle(body: string | null): SoloBattleUpload | null {
  if (body === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.initialState) || !Array.isArray(value.actions)) {
    return null;
  }
  if (!Array.isArray(value.initialState.log) || value.initialState.log.length !== 0) return null;
  if (!isRecord(value.summary)) return null;
  if (value.result !== 'player_wins' && value.result !== 'enemy_wins') return null;
  if (value.actions.length > 5000) return null;

  const actions: SoloBattleUpload['actions'] = [];
  for (const row of value.actions) {
    if (!isRecord(row) || (row.controller !== 'host' && row.controller !== 'ai')) return null;
    if (!isRecord(row.action) || !ACTION_TYPES.has(String(row.action.type))) return null;
    actions.push({ controller: row.controller, action: row.action });
  }
  return {
    initialState: value.initialState as SoloBattleUpload['initialState'],
    actions,
    summary: value.summary,
    result: value.result,
  };
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status);
    return void res.end();
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Reads and validates a JSON body; null on malformed JSON or oversize. */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.removeAllListeners();
        resolve(null);
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf-8');
      try {
        JSON.parse(text);
        resolve(text);
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}
