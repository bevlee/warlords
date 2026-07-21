# M1: Server Scaffold + SQLite Saves — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static-nginx deployment with one Node process (adapter-node + custom server) serving the SPA and a SQLite-backed save API; client storage modules keep their signatures but talk to the API.

**Architecture:** Framework-free connect-style API middleware shared verbatim between a Vite dev-server plugin (dev) and a plain `node:http` server wrapping the adapter-node handler (prod). `better-sqlite3` with WAL + numbered `.sql` migrations. Bearer-token sessions, no accounts. Server code is erasable TypeScript with explicit `.ts` import extensions so Node 26 runs it directly (no build step); local dev/start uses `--experimental-strip-types` on Node 22.

**Tech Stack:** `@sveltejs/adapter-node`, `better-sqlite3`, `node:http`, vitest.

Parent plan: `2026-07-19-coop-websockets-sqlite-plan.md` (Part 1 + deployment). Schema, API
routes, retry policy, and identity model are specified there and not repeated.

---

### Task 1: Dependencies + DB layer with migrations

**Files:**
- Modify: `package.json` (deps: `@sveltejs/adapter-node`, `better-sqlite3`, `@types/better-sqlite3`; remove `@sveltejs/adapter-static`? no — keep until config flips in Task 5)
- Create: `server/migrations/001-init.sql` (full v1 schema from parent plan)
- Create: `server/db.ts` — `openDb(path)`: mkdir -p dirname, WAL pragma, apply migrations in filename order, track `schema_version` in `meta`
- Test: `server/__tests__/db.test.ts`
- Modify: `vite.config.ts` test.include += `server/**/*.test.ts`

**Steps:**
1. `npm install @sveltejs/adapter-node better-sqlite3 && npm install -D @types/better-sqlite3`
2. Write failing tests: opens `:memory:`-style temp file db → all 6 tables exist; `schema_version` = 1; re-open applies nothing (idempotent).
3. Run: `npx vitest run server` → FAIL (module not found).
4. Implement `db.ts` + `001-init.sql`.
5. Run: `npx vitest run server` → PASS. Full suite green. Commit.

### Task 2: API middleware — session, saves, health

**Files:**
- Create: `server/api.ts` — `createApi(db)` → connect-style `(req, res, next)` handling `POST /api/session`, `GET|PUT|DELETE /api/save/:slot`, `GET /api/health`; bearer auth; slot allowlist `hero|campaign|gauntletRun`; JSON bodies ≤ 256 KB
- Test: `server/__tests__/api.test.ts` — boots a real `node:http` server on an ephemeral port, drives it with `fetch`

**Steps:**
1. Failing tests: health 200; session mints `{playerId, token}`; save GET before PUT → 404; PUT then GET round-trips; DELETE → subsequent GET 404; missing/garbage token → 401; unknown slot → 400; unauthenticated health still 200.
2. Run → FAIL. Implement. Run → PASS. Full suite green. Commit.

### Task 3: Client API layer (session bootstrap, retry, save calls)

**Files:**
- Create: `src/lib/net/api.ts` — `getSession()` (localStorage `warlords.session`, mints via `POST /api/session` once, memoized promise); `fetchWithRetry` (3 attempts, 0.5s/2s/8s, retry on network error or 5xx — all our verbs are idempotent); `getSave/putSave/deleteSave(slot)`
- Test: `src/lib/net/__tests__/api.test.ts` — real API server from Task 2 on ephemeral port + stubbed `localStorage` global; assert mint-once, retry-on-503-then-success, save round-trip

**Steps:** failing tests → implement → green → commit.

### Task 4: Swap storage.ts / campaignStore.ts to the API + IndexedDB import shim

**Files:**
- Modify: `src/lib/storage.ts` — identical exported signatures, bodies call `src/lib/net/api.ts`
- Modify: `src/lib/campaign/campaignStore.ts` — `loadCampaign/saveCampaign/resetCampaign` likewise; `idb` import removed from both
- Create: `src/lib/net/idbMigrate.ts` — `migrateIdbSaves()`: `indexedDB.databases()` (guarded), if `warlords` exists read `hero|campaign|gauntletRun` from `kv` store, PUT each to server, delete the database. Called once from `getSession()` bootstrap; browser-only guard.
- Test: extend `src/lib/net/__tests__/api.test.ts` with storage-roundtrip through the swapped modules

**Steps:** failing test (storage round-trip via real server) → implement → green → commit.
Note: UI call sites are untouched — grep to prove: `grep -rn "from '\$lib/storage'\|loadCampaign\|saveCampaign" src | wc -l` unchanged before/after.

### Task 5: adapter-node + custom prod server + dev plugin

**Files:**
- Modify: `svelte.config.js` — `@sveltejs/adapter-static` → `@sveltejs/adapter-node` (drop `fallback`, keep SPA via existing `ssr=false`)
- Create: `server/index.ts` — opens db (`DATABASE_PATH` env, default `data/warlords.db`), `node:http` server: api middleware first, else adapter-node `handler` from `../build/handler.js`; `PORT` env default 3000; in-process daily backup ring (`better-sqlite3` `.backup()` → `<datadir>/backup/warlords-<dow>.db`)
- Create: `server/dev-plugin.ts` — Vite plugin: `configureServer` mounts the same `createApi(db)` on the dev middleware stack (db at `data/warlords-dev.db`)
- Modify: `vite.config.ts` — add plugin
- Create: `tsconfig.server.json` (erasable-only, `allowImportingTsExtensions`, `noEmit`)
- Modify: `package.json` — `"start": "node --experimental-strip-types server/index.ts"`, `"check"` += `tsc -p tsconfig.server.json`
- Modify: `.gitignore` — `/data`
- Remove: `@sveltejs/adapter-static` from package.json

**Steps:**
1. Flip config, implement server + plugin.
2. Verify: `npm run build` succeeds; `npm run start` then `curl localhost:3000/api/health` → 200 and `curl localhost:3000/` → SPA HTML; `npm run dev` then same two curls against the dev port.
3. `npm run check` + full test suite green. Commit.

### Task 6: Dockerfile + k8s + skaffold

**Files:**
- Modify: `Dockerfile` — builder `node:26-bookworm-slim` (glibc: better-sqlite3 prebuilds; parent plan) `npm ci && npm run build && npm prune --omit=dev`; runtime `node:26-bookworm-slim`, copy `build/ server/ node_modules/ package.json`, `EXPOSE 3000`, `CMD ["node","server/index.ts"]` (Node 26 strips types natively)
- Delete: `nginx.conf`
- Modify: `k8s/deployment.yaml` — `strategy: Recreate`, `containerPort: 3000`, env `DATABASE_PATH=/data/warlords.db`, PVC mount `/data`, readiness probe `/api/health`
- Create: `k8s/pvc.yaml` — 1 Gi RWO
- Modify: `k8s/service.yaml` — `targetPort: 3000`
- Modify: `skaffold.yaml` — add `k8s/pvc.yaml`

**Steps:**
1. Edit manifests.
2. Verify: `docker build .` completes and `docker run -p 3000 …` serves `/api/health` (skip if no docker daemon — note it).
3. Commit.

### Task 7: Verify whole milestone

- Full suite + check green; manual flow: `npm run dev`, create hero in browser → row appears in `data/warlords-dev.db` (`sqlite3 … 'select slot from saves'`).
- superpowers:requesting-code-review against this plan.
