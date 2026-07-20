# M2: Engine Prerequisites + Solo Recording — Implementation Plan

**Goal:** Make battle state replay-safe, persist completed solo battle journals, and expose
authenticated history/detail APIs without changing the playable battle flow.

**Architecture:** Battle-scoped stack ids come from a `BattleState.nextId` counter, so the
same inputs and deploy operations produce byte-for-byte stable state. Combat starts with an
empty event log, which makes the persisted post-deploy snapshot directly replayable because
the engine's per-action RNG is derived from `seed + log.length`. A small client recorder owns
the immutable initial snapshot and cause-only action journal; `Battle.svelte` routes every
player and AI action through it and uploads once when the battle ends. SQLite remains the
source of truth for authenticated history and replay payloads.

Parent plan: `2026-07-19-coop-websockets-sqlite-plan.md`, Milestone 2.

---

### Task 1: Deterministic engine identity and version

**Files:**
- Modify: `src/lib/engine/types.ts`, `src/lib/engine/battle.ts`, `src/lib/engine/index.ts`
- Create: `src/lib/engine/version.ts`
- Modify: `src/lib/engine/__tests__/deploy.test.ts`
- Modify: `package.json`, `package-lock.json`

**Steps:**
1. Add failing coverage proving equal `initBattle` inputs produce equal ids/state and equal
   split sequences mint the same next id.
2. Add `BattleState.nextId`, allocate initial stacks as `u1`, `u2`, …, and increment it in
   `splitStack`; remove the engine's `uuid` import/dependency.
3. Make `beginCombat` clear deployment events so its snapshot is the exact replay origin.
4. Export an `ENGINE_VERSION` constant and cover it as a non-empty stable string.
5. Run focused engine tests, then the full suite.

### Task 2: Battle REST API

**Files:**
- Modify: `server/api.ts`
- Modify: `server/__tests__/api.test.ts`

**Steps:**
1. Add failing HTTP tests for authenticated solo upload, newest-first history, replay detail,
   ownership isolation, malformed payloads, and unknown battle ids.
2. Implement transactional insertion into `battles` and `battle_actions`, stamping the current
   engine version on the server.
3. Implement `GET /api/battles` summary rows and `GET /api/battles/:id` replay payloads, scoped
   to the authenticated player; include ordered actions and chat.
4. Run server tests and type-check server imports.

### Task 3: Client battle API and recorder

**Files:**
- Modify: `src/lib/net/api.ts`
- Create: `src/lib/replay/recording.ts`
- Create: `src/lib/replay/__tests__/recording.test.ts`
- Modify: `src/lib/net/__tests__/api.test.ts`

**Steps:**
1. Add shared client request/response types and `postSoloBattle`, `getBattles`, and `getBattle`.
2. Add a pure recorder that snapshots combat start, records `{controller, action}` causes,
   derives casualties/round count from final state, and produces the upload payload once.
3. Drive a complete seeded battle, replay every recorded action from the snapshot, and assert
   final-state equality with the live run.
4. Round-trip that payload through the real HTTP server and assert list/detail shapes.

### Task 4: Wire recording into solo battles

**Files:**
- Modify: `src/lib/ui/Battle.svelte`

**Steps:**
1. Create/reset the recorder at `beginCombat` (and restart).
2. Route player and AI actions through one function that records the accepted cause before the
   existing animation reveal path.
3. On the first terminal state, keep the existing `onresult` behavior and fire one background
   upload; upload failure must not block progression.
4. Run Svelte/type checks and the full suite.

### Task 5: Whole-milestone verification

1. Run focused tests, `npm test`, `npm run check`, and `npm run build`.
2. Review the diff for replay determinism, auth scoping, duplicate upload, and accidental
   changes to unrelated save behavior.
3. Update the parent plan milestone status only after all verification is green.
