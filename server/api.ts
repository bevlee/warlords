import { randomUUID, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type Database from 'better-sqlite3';

const SLOTS = new Set(['hero', 'campaign', 'gauntletRun']);
const MAX_BODY = 256 * 1024;

type Next = () => void;

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
  };

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
