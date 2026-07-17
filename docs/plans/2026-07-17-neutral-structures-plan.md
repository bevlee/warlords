# Neutral Units & Structures — Implementation Plan

**Status:** Planned
**Goal:** Battlefield objectives: neutral structures that grant buffs or rewards
when claimed, and (phase 2) neutral guardian stacks that must be beaten to claim
them. Adds a positional incentive beyond "kill the other army".

---

## 1. Current state and constraints

- The board only knows `blocked` cells (rocks) seeded inside `initBattle`
  (`battle.ts:237-245`) and unit occupancy (`Cell.occupantId`).
- `UnitStack.side` is `'player' | 'enemy'` and **four systems assume two sides**:
  `checkBattleEnd`, retaliation/targeting in `applyAction`, the AI (`ai.ts`),
  and owner-coloring in `UnitToken.svelte`/`TurnBar.svelte`. That makes true
  neutral *units* the expensive half — hence two phases.
- There is no persistent gold; battle rewards flow through
  `handleResult` in `+page.svelte` (XP, campaign gold display). Chest rewards
  therefore grant **bonus XP** in v1, not gold.

## 2. Phase 1 — unguarded structures

### 2.1 Data model (`types.ts`)

```ts
export type StructureKind =
  | 'shrine_attack'   // army-wide +2 attackBuff for the claiming side
  | 'shrine_defense'  // army-wide +2 defenseBuff
  | 'fountain_luck'   // army-wide +1 luck
  | 'idol_morale'     // army-wide +1 morale
  | 'mana_crystal'    // +4 hero mana (player claim only; inert for enemy)
  | 'war_chest';      // +25 bonus XP on victory (player claim only)

export interface Structure {
  id: string;
  kind: StructureKind;
  pos: Pos;
  claimedBy: 'player' | 'enemy' | null;
}

export interface BattleState {
  // ...existing
  structures: Structure[];
  lootXp: number; // accumulated war_chest bonuses, paid out on player_wins
}
```

Structure cells are **passable and occupiable** — claiming = *ending a move on
the tile* (move action or the `moveTo` of a combined move+attack). Flyers can
claim; a stack standing on an unclaimed structure at battle start (via the
deployment phase) claims at its first turn start.

### 2.2 Seeding (`battle.ts`)

Independent RNG stream, same pattern as the deployment plan's obstacles:

```ts
const STRUCTURE_SALT = 0x5720c7; // distinct salt: mixSeed(seed, STRUCTURE_SALT)

/** 0–2 structures in cols 4–7, never on a rock; kinds drawn uniformly. */
export function generateStructures(seed: number, obstacles: Pos[]): Structure[];
```

Placed in the middle columns so both sides can race for them (player spawns at
col ≤ 1 + tactics, enemy at col 10). Campaign encounters can override:
`Encounter` (`campaign/encounters.ts`) gains optional
`structures?: StructureKind[]` for scripted maps ("a shrine guards the pass"),
threaded through `initBattle` as an optional parameter that suppresses random
generation.

### 2.3 Claim resolution (`battle.ts`)

One helper called from the two relocation points in `applyAction` (the `move`
branch and the `attack` branch's `moveTo` block) plus turn start:

```ts
function claimStructure(s: BattleState, actor: UnitStack): BattleState {
  const st = s.structures.find(x => !x.claimedBy && x.pos.col === actor.pos.col && x.pos.row === actor.pos.row);
  if (!st || actor.isHero) return s;
  // mark claimed, apply reward, push log event
}
```

Rewards reuse existing stack fields — army-wide buffs map over
`units.filter(u => u.side === actor.side && u.count > 0 && !u.isHero)` mutating
`attackBuff`/`defenseBuff`/`luck`/`morale`; `mana_crystal` edits `s.hero.mana`;
`war_chest` bumps `s.lootXp`. Log event:
`{ type: 'status', data: { effect: 'structure_claim', kind, unitId, side } }`.

Claims are **permanent for the battle** (no recapture in v1 — keeps the state
machine one-way and the AI simple).

### 2.4 Payout (`+page.svelte`)

`battle_end` event data gains `lootXp`; `Battle.svelte`'s `onresult` callback
passes it up (extend the callback signature to
`(result, extras: { lootXp: number })`), and `handleResult` adds it to `gained`
before `applyXp`. Defeats forfeit loot.

### 2.5 Enemy AI (`ai.ts`)

Minimal heuristic so structures aren't free for the player: when the acting
enemy stack has no attack available this turn (the existing "advance" path),
prefer the reachable cell that sits on an unclaimed structure over the default
approach cell. One extra scan over `state.structures` in the move-selection
code; no lookahead.

### 2.6 UI

- `BattleGrid.svelte`: render structure sprites (emoji in v1: ⛩️ 🛡️ 🍀 🗿 💠 🧰)
  on their tiles beneath unit tokens; claimed structures get the owner's tint
  (reuse the owner-color tokens from `UnitToken.svelte`) and reduced opacity.
- Hover tooltip naming the structure and its reward (same overlay machinery as
  unit hover).
- `BattleLog.svelte`: display string for `structure_claim`.
- Deployment screen (see 2026-07-17-deployment-phase-plan.md) shows structures,
  since they share the battlefield seed.

### 2.7 Tests (`__tests__/structures.test.ts`, new)

- `generateStructures`: deterministic per seed; never collides with obstacles;
  0–2 count; cols 4–7.
- Claim on move-end grants the buff to all friendly stacks and not the hero;
  second stack entering later does nothing; enemy claim of `mana_crystal` is
  inert.
- Combined move+attack claims via `moveTo`.
- `war_chest` → `lootXp` → surfaces in `battle_end` data; XP added on win in a
  component-level or integration test of `handleResult`'s math.
- AI walks onto a structure when no attack is available (seeded scenario).

## 3. Phase 2 — neutral guardians

Gate: ship only after Phase 1 is stable.

- `UnitStack.side` widens to `'player' | 'enemy' | 'neutral'`. Touch points, all
  of which must be found by the compiler after changing the union:
  - `checkBattleEnd`: ignore neutral stacks entirely (a battle can end with
    guardians alive).
  - `applyAction` targeting: neutral stacks are attackable by both sides;
    they retaliate normally (existing `canRetaliate` is side-agnostic).
  - Turn order: guardians are on the ATB scale like anyone (no change needed in
    `turnOrder.ts` — it iterates all units).
  - AI: when a *neutral* stack acts, run the existing enemy AI but with "hostile
    = nearest living non-neutral stack, either side"; when the *enemy* AI picks
    targets it must now also consider neutral attackers adjacent to it —
    simplest rule: enemies ignore neutrals unless a neutral blocks their path
    or has attacked them (track `provokedBy?: side` on the guardian… defer;
    v2 rule = enemies ignore neutrals, acceptable because guardians spawn near
    structures in the middle).
  - `UnitToken.svelte` / `TurnBar.svelte`: third owner color (gray/amber).
- A guarded structure spawns with one guardian stack adjacent (drawn from any
  faction roster, budget ≈ 30% of `budgetForLevel(hero.level)`), and its claim
  check requires `structures[i].guardianId`'s stack to be dead.
- XP: guardians killed add their `armyCost` to `gained` (consistent with the
  free-play "XP = defeated army value" rule); Necromancy skeleton math in
  `necromancyBonusSkeletons` keys off the enemy army only — leave guardians out
  in v2 and note it.

## 4. Steps

1. Types + `generateStructures` + seeding in `initBattle` (behind
   `structures.length === 0` when the caller passes an explicit empty list, so
   tests and gauntlet can opt out).
2. Claim helper wired into `move`/`moveTo`/turn-start; rewards; log event.
3. `lootXp` payout thread through `Battle.svelte` → `+page.svelte`.
4. AI structure preference.
5. Grid rendering, tooltips, log strings. `verify` run: race the AI to a shrine,
   confirm army-wide buff shows in the unit modal.
6. Phase 2 (separate milestone/PR): neutral side union + guardians.

## 5. Interactions with other planned features

- **Deployment phase**: shares the battlefield-seed preview; a stack deployed
  onto a structure tile claims at its first turn.
- **Augments plan**: `war_chest` may later drop hero *items* instead of XP —
  reuse `AugmentDef`'s stat-delta shape for army-wide item passives rather than
  a new system.
- **Faction spells**: structure buffs stack additively with `attackBuff`/
  `defenseBuff` from Bloodlust/Stoneskin by construction (same fields).
- **Gauntlet**: opts out in v1 (explicit empty structure list) until curses/
  blessings interactions are designed.
