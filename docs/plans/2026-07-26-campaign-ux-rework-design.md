# Campaign UX Rework — Design Document

**Game:** Warlords (SvelteKit + TypeScript, offline PWA, 12×10 grid combat)
**Mode:** Campaign — the main game mode
**Status:** Design — ready for implementation

---

## 1. Problem

Three UX faults in the campaign mode, all traceable to one screen doing too many
jobs.

**Faction is a live toggle.** The three faction cards sit at the top of
`ArmySetup` on every visit. `handleClass` treats a first pick as "start the
campaign" and every later pick as "just change the roster", so a player can
clear chapter 4 as a Knight and fight the final boss as a Necromancer, keeping
level, gold and progress. Switching also silently wipes the current army
selection.

**Two views fight each other.** `screen` flips between `setup` and `campaign`
with no clear home: the map offers "← Back to Army Setup", the result screen
offers "Change army", and setup is reachable with or without a selected
encounter. Setup does double duty as the pre-encounter recruiting screen *and*
as a free-play skirmish (no `activeEncounter` → random enemy, XP but no gold).
Nothing tells the player which of the two screens is the place they are supposed
to be.

**Recruiting is a click farm.** Each unit row carries `‹5 − n + 5›`. Filling an
800-gold budget across up to seven rows with 15-gold units is dozens of clicks,
and no row shows how much of the budget it is eating.

## 2. Target flow

The map becomes home and there is one forward path.

```
[first run only] Choose Faction ──▶ Map ──▶ Encounter ──▶ Battle ──▶ Result ──▶ Map
                                     ▲                                          │
                                     └──────────────────────────────────────────┘
```

`screen` changes from `'setup' | 'campaign' | 'battle' | 'result'` to
`'faction' | 'map' | 'encounter' | 'battle' | 'result'`.

| Screen | Purpose | Exits |
| --- | --- | --- |
| `faction` | First run only. Three faction cards at full size. | "Begin campaign" |
| `map` | Home. Chapter/encounter nodes. | a node · "← Hub" |
| `encounter` | Encounter brief, enemy army, recruiting. | "← Map" · "Start battle ⚔️" |
| `battle` | Unchanged. | result |
| `result` | Outcome and rewards. | "Continue" → map |

Consequences:

- `CampaignMap` loses its "← Back to Army Setup" button.
- `result` loses "Change army". After a defeat the node stays available, so
  returning to the map and re-entering the node *is* the retry — and it lands
  back on recruiting, which is what "Change army" was for.
- The free-play branch (`generateEnemyArmy` when `activeEncounter` is null) is
  deleted, along with `backToSetup` and `resultToSetup`. Grinding a random enemy
  is what Gauntlet is for.
- `activeEncounter` is non-null for the whole `encounter → battle → result` span.
  It stops meaning "a fight is in flight" and simply means "the encounter being
  played", which removes the ambiguity the current code comments apologise for.

## 3. Faction lock

### 3.1 Data

Nothing in the save currently records that a campaign belongs to a faction —
`hero.class` is a mutable field that `handleClass` rewrites freely.
`CampaignState` gains the lock:

```ts
export interface CampaignState {
  faction: FactionClass;  // chosen at start, never written again
  chapter: number;
  encounter: number;
  completed: boolean;
  heroSaveId: string;
}
```

`newCampaign(faction, heroSaveId)` requires it.

The lock lives on the campaign rather than the hero because the hero is shared
with other modes and `hero.class` is what the unit roster reads from. On
`CampaignState` it is a fact that survives independently, and `resetCampaign`
becomes the single thing that can clear it — which already lines up with "Reset
hero" wiping hero + campaign + army + discovery together.

### 3.2 Migration

`loadCampaign` backfills `faction ?? hero.class` for campaigns saved before this
change — the same shape as the existing `factionSkills ?? []` and `gold ?? 0`
handling. An existing player is grandfathered into the faction they are already
playing, is never re-prompted, and loses nothing.

### 3.3 UI

- The three-card picker and the `onclass` prop leave `ArmySetup` entirely.
- The `$effect` that cleared counts on faction change becomes dead code and is
  removed.
- The encounter header carries a read-only **faction identity chip**: sprite,
  faction name, hero level, and the 📖 compendium link that currently hangs off
  the picker card. It reads as "who you are", not "who you could be".
- "Reset hero" gains a confirmation dialog. It is currently a one-click wipe of
  everything with no confirmation, and it becomes the only way to change faction.

## 4. Encounter screen

One screen, three stacked regions.

### 4.1 Brief

Encounter name, chapter, description, gold/XP rewards, and the `special` flavour
note. Faction identity chip on the right.

### 4.2 Enemy army

The encounter's enemy is already fully deterministic from `encounter.id` and
hero level, so the exact composition is shown while recruiting: enemy faction,
each stack's unit and count, and total army value. This turns recruiting into a
counter-pick rather than a guess, which is the reason to put recruiting inside
the encounter at all.

### 4.3 Recruiting

Each unit row keeps its sprite, name, cost, stat line and abilities. The
`‹5 − n + 5›` cluster is replaced by a slider flanked by single-step arrows:

```
🐺 Wolf Rider   ┃  HP 10 · Atk 5 · Dmg 2–4   ┃  ‹ ▁▃▅━━━━━━●━━━━ ›    14   🪙 210
   🪙 15 each   ┃  Spd 7 · Init 11           ┃    0          max 21
```

- **Dynamic maximum.** A row's ceiling is `count + floor(goldLeft / cost)` — as
  far as remaining gold reaches. Dragging one row down raises every other row's
  ceiling. The sliders visibly compete for one budget, so the screen becomes a
  single allocation decision instead of seven independent counters. Dragging to
  the far end spends everything available on that unit, so no separate "Max"
  button is needed.
- **Arrows at each end** step ±1 for exact counts.
- **Keyboard** works for free on a range input: arrow keys ±1, PageUp/PageDown
  in larger steps, Home/End for 0 and max.
- **Locked tiers** stay as they are: 🔒 badge, greyed, no control.
- **Stack cap.** A row at 0 while 6 stacks are already filled shows a disabled
  slider with a "6/6 stacks" hint, instead of the current silent refusal to
  respond to clicks.
- Dragging a row to 0 removes the stack.

### 4.4 Footer

Gold remaining becomes a **progress bar** rather than a bare number — spending
against a fixed budget is what a bar communicates at a glance. Alongside it:
stack count `n / 6`, "Clear", and "Start battle ⚔️".

## 5. Files

| File | Change |
| --- | --- |
| `src/routes/campaign/+page.svelte` | New `screen` union; delete free-play branch, `backToSetup`, `resultToSetup`, `handleClass`; faction screen wiring; reset confirmation |
| `src/lib/campaign/campaignStore.ts` | `faction` on `CampaignState`; `newCampaign(faction, …)`; migration backfill in `loadCampaign` |
| `src/lib/ui/FactionSelect.svelte` | **New** — first-run faction screen |
| `src/lib/ui/EncounterSetup.svelte` | **New** — replaces `ArmySetup` for campaign: brief + enemy army + recruiting |
| `src/lib/ui/RecruitRow.svelte` | **New** — one unit row: slider, end arrows, live cost |
| `src/lib/ui/CampaignMap.svelte` | Drop "← Back to Army Setup" |
| `src/lib/ui/ArmySetup.svelte` | Retained only if another mode still uses it; otherwise deleted |

## 6. Testing

- **`campaignStore`** — `newCampaign` records the faction; `advanceCampaign`
  preserves it; migration backfills `faction` from `hero.class` for a save
  written without one; `nodeStatus` unchanged.
- **Recruiting maths** — extract the ceiling rule
  (`count + floor(goldLeft / cost)`, clamped by tier lock and stack cap) into a
  pure helper and unit-test it: budget exhaustion, freeing budget from another
  row, the 6-stack boundary, and locked tiers.
- **Component** — recruiting a full army never exceeds the budget; the enemy
  preview matches the army the battle is actually generated with (same
  `encounter.id` + hero level).
- **Manual** — the `verify` skill for the full loop: first run → faction →
  map → encounter → battle → result → map, plus a returning save landing on the
  map with its faction intact and no picker anywhere.

## 7. Out of scope

- Gauntlet mode. It already locks faction at run start and drafts rather than
  recruits.
- Rebalancing budgets, rewards or encounter difficulty.
- Army persistence between encounters. Armies remain re-recruited per battle
  from the full budget, seeded by the previous selection.
