// Client side of the save API (parent plan Part 1): bearer-token session in
// localStorage, retrying fetch wrapper, and typed save calls. UI code never
// imports this directly — storage.ts/campaignStore.ts keep their signatures.

export interface Session {
  playerId: string;
  token: string;
}

export type SaveSlot = 'hero' | 'campaign' | 'gauntletRun';

const SESSION_KEY = 'warlords.session';

let baseUrl = '';
// Deploy downtime is a few seconds (single replica, Recreate) — the ladder
// spans it so a save issued mid-deploy lands instead of erroring.
let retryDelays = [500, 2000, 8000];
let sessionPromise: Promise<Session> | null = null;
// Set as soon as the session is known, before the fresh-session hook runs.
// The hook (the idb import shim) saves through this module, so it would
// otherwise await the session promise it is itself still inside.
let current: Session | null = null;

/** Test hook: point at an ephemeral server and shrink the retry ladder. */
export function _resetForTests(base: string, delays: number[]): void {
  baseUrl = base;
  retryDelays = delays;
  sessionPromise = null;
  current = null;
}

export function getSession(): Promise<Session> {
  sessionPromise ??= initSession();
  return sessionPromise;
}

async function initSession(): Promise<Session> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw) as Session;
      if (stored.playerId && stored.token) {
        current = stored;
        return stored;
      }
    } catch {
      // fall through to mint
    }
  }
  const res = await fetchWithRetry('/api/session', { method: 'POST' }, false);
  if (!res.ok) throw new Error(`session mint failed: ${res.status}`);
  const session = (await res.json()) as Session;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  current = session;
  await onFreshSession(session);
  return session;
}

// Replaced by the IndexedDB import shim (idbMigrate.ts); kept as a seam so the
// shim can be dropped in one place when it retires.
let onFreshSession: (s: Session) => Promise<void> = async () => {};
export function _setFreshSessionHook(hook: (s: Session) => Promise<void>): void {
  onFreshSession = hook;
}

/** fetch with the session token and a retry ladder for network errors and 5xx.
 *  All our verbs are idempotent (GET/PUT/DELETE, POST /api/session mints a
 *  fresh row per call and only the last one is kept), so blanket retry is safe.
 *  Returns the last response rather than throwing on persistent 5xx. */
export async function fetchWithRetry(
  path: string,
  init: RequestInit = {},
  auth = true
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (auth) {
    const { token } = current ?? (await getSession());
    headers.set('Authorization', `Bearer ${token}`);
  }
  let lastError: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(baseUrl + path, { ...init, headers });
      if (res.status < 500 || attempt >= retryDelays.length) return res;
    } catch (err) {
      lastError = err;
      if (attempt >= retryDelays.length) throw lastError;
    }
    await new Promise(r => setTimeout(r, retryDelays[attempt]));
  }
}

export async function getSave<T>(slot: SaveSlot): Promise<T | null> {
  const res = await fetchWithRetry(`/api/save/${slot}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`load ${slot} failed: ${res.status}`);
  return res.json();
}

export async function putSave(slot: SaveSlot, data: unknown): Promise<void> {
  // JSON round-trip also flattens state proxies (same reason the idb layer
  // spread/serialized before writing).
  const res = await fetchWithRetry(`/api/save/${slot}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`save ${slot} failed: ${res.status}`);
}

export async function deleteSave(slot: SaveSlot): Promise<void> {
  const res = await fetchWithRetry(`/api/save/${slot}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete ${slot} failed: ${res.status}`);
}
