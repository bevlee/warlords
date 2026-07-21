# M5: Replays, History UI, and Polish — Implementation Plan

**Goal:** Make persisted solo and co-op journals browsable and replayable, finish co-op lifecycle
polish, cap retained history, and remove the retired IndexedDB migration path.

**Architecture:** A pure timeline builder re-simulates the initial snapshot and action journal once,
attaching generated events, canonical post-action state, and sequence-positioned chat to each frame.
A small replay controller owns play/pause/restart and feeds actions into `Battle.svelte`'s existing
incremental reveal seam. The battle renderer gains a read-only replay adapter and one animation
speed factor. History remains server-filtered by player and replay playback is gated by the exact
engine version.

Parent plan: `2026-07-19-coop-websockets-sqlite-plan.md`, Milestone 5.

---

### Task 1: Timeline and playback controller

- Build replay frames from `initialState + ordered actions`, preserving the exact events and state
  after each action.
- Interleave chat by `afterSeq`, including messages before the first and after the last action.
- Add a controller with clean between-action play/pause points, restart, speed changes, and a
  replaceable battle-renderer sink.
- Test deterministic final-state equality, chat placement, pause/resume, restart, and speed delay.

### Task 2: Replay-capable animation seam

- Add read-only replay mode to `Battle.svelte`, exposing apply/resync controls without enabling
  local input, AI, recording, resign, or result overlays.
- Scale action beats, standee movement/recoil/death, projectiles, flashes, and floaters from one
  `speedFactor` (0.5x, 1x, 2x, 4x).
- Preserve current solo and live co-op behavior by default.

### Task 3: History and replay screens

- Add `/history` with result, mode, date, rounds, and casualty summaries from `GET /api/battles`.
- Enable Watch replay only when `engineVersion` exactly matches the current engine.
- Add `/history/[id]` with loading/error/version states, replay controls, progress, and co-op chat
  revealed at its recorded sequence position.
- Link history from the main and co-op screens.

### Task 4: Server completion and retention

- Write co-op summaries from the canonical initial/final states on victory, defeat, and abandon.
- Keep at most 200 safely-prunable battles per player, deleting dependent actions/chat in one
  transaction without removing a co-op battle still inside another player's cap.
- Test summary persistence, player isolation, and retention behavior.

### Task 5: Co-op lifecycle and retired migration cleanup

- Surface connection status, `room_gone`, abandonment, and a clear return-to-setup flow; stop the
  socket when leaving. Co-op remains a standalone skirmish and does not mutate either save.
- Remove the IndexedDB bootstrap, migration module, `idb` package, and obsolete fresh-session hook.
- Replace the scaffold README with current development, persistence, co-op, replay, deployment,
  and verification documentation; mark the parent plan complete.

### Task 6: Verification

- Run focused replay/server tests, the full suite, type checks, production build, and a production
  history/API smoke.
- Commit Milestone 5 only with a clean worktree and all checks green.
