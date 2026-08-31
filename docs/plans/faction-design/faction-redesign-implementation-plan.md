# Faction Redesign Implementation Plan

**Scope:** Implement the redesigned units, faction artifacts, and hero decision systems for Knight, Ranger, Barbarian, Wizard, Demon, and Necromancer.

**Approach:** Land shared engine contracts first, then complete one faction at a time as a playable vertical slice. Each phase keeps the game and current-version replay format working; the intentional RNG/protocol version break rejects older recorded battles while preserving migrated run saves.

## Locked design rules

These rules should be treated as acceptance criteria rather than balance suggestions:

1. **Wizard is the only spellcasting faction.**
   - Only Wizard has mana above zero.
   - Only Wizard can submit a `cast` action.
   - Only Wizard sees mana and the spellbook.
   - Old saves cannot give spells or mana to another faction.

2. **Other heroes use distinct action systems.**
   - Knight: Standing Orders.
   - Barbarian: limited Battle Cries.
   - Ranger: Hunt Plans.
   - Demon: Infernal Rites paid for with creatures, HP, or Burn.
   - Necromancer: Corpsecraft paid for with Skeletons.

3. **Marks are stored on their target.**
   - Each mark records its applying controller and allied team.
   - The source unit does not need to remain alive.
   - Any combatant allied with the applying controller may benefit if it meets the mark's stated attack restriction, including a co-op partner's units.
   - Name the Quarry is not restricted to Ranger units.
   - Ranged Mark applies to every friendly shooter.
   - Marked for Death applies to all friendly damage sources.

4. **Positive combat effects explicitly declare whether they are Innate.**
   - Every positive effect carries `innate: boolean`.
   - Claim Blessing can steal only effects with `innate: false`.
   - Hero effects, artifacts, auras, and source-specific states such as Soaring are Innate.
   - Focus, Blood Frenzy, and Haste Ritual are non-Innate unless explicitly changed.
   - ATB, ammunition, charges, and base statistics are resources or statistics, not buffs.

5. **Cleanse is repeatable.**
   - It spends Monk's complete turn.
   - It has no cooldown or use limit.
   - It removes every removable negative combat effect from one friendly target.
   - It does not heal, restore creatures, or remove permanent artifact trade-offs.

6. **Ride-By Attack is a special Cavalier attack.**
   - It requires at least three cells of movement.
   - It deals 50% more damage and prevents retaliation.
   - After resolution, Cavalier automatically returns to its starting cell if that cell remains legal.
   - It starts ready, has cooldown 2, is unavailable for the next two Cavalier turns, and is ready on the third.
   - Silver Spurs reduces the cooldown to 1.
   - A Ride-By submission with fewer than three cells of legal movement is rejected without spending the turn or starting its cooldown; it never silently becomes a normal attack.
   - The UI offers Ride-By only from legal starting/landing combinations and highlights only tiles that can complete it.
   - Champion keeps Grand Joust and Overrun.

7. **Player-facing text uses turn terminology.**
   - Turn: opportunity for a unit or hero to act.
   - Action: move, attack, wait, defend, spell, hero command, or unit ability.
   - Attack: one melee or ranged action.
   - Hit, strike, or arrow: one damage instance inside an attack.

8. **Cooldowns count down at the start of the owning unit's turn.**
   - A design cooldown of 2 means the ability is unavailable for the next two turns and ready on the third.
   - Wait, Defend, morale extra turns, and skipped turns all advance that unit's cooldowns.
   - Deployment does not advance cooldowns.
   - Different stacks of the same unit type keep independent cooldowns.

9. **Deployment should remember intent rather than battle IDs.**
   - The last valid formation is applied automatically; editing it is optional.
   - Saved positions survive count changes, missing units, newly gained units, and blocked cells.
   - Deployment only repositions or swaps whole strategic stacks.
   - Remove stack splitting and detachments from the engine, UI, AI, and co-op deployment protocol.
   - This rule supersedes the split-stack behavior in the older troop-deployment design documents.

10. **Automatic level-derived combat bonuses are removed globally.**
   - Heroes of every faction stop gaining automatic Attack and Defence from levelling.
   - Units receive no automatic combat-stat or faction-skill bonuses merely because their hero level increased.
   - Heroes retain their existing starting `2 Attack / 1 Defence`; both statistics apply as controller-wide army bonuses, but neither increases automatically.
   - Level may still control progression such as recruitment access, encounter budgets, explicitly retained unlocks, and formulas whose ability text directly names hero level, such as Resurrect.
   - Deliberately drafted unit skills, faction artifacts, and combat effects continue to work.

11. **Burn scales with the actual gauntlet round.**
   - **Gauntlet Rank** is the player-facing name for the actual one-based encounter number of the current run: `battlesWon + 1` when the battle is created. Engine data calls the same value `gauntletRound`.
   - Base Burn damage per tick is `3 × gauntletRound`.
   - Non-gauntlet battles use round 1 unless their battle setup explicitly supplies another value.
   - The resolved gauntlet round is stored in battle, replay, and co-op initial state; Burn never reads mutable run state during combat.

12. **Magic Resistance covers all hostile magic.**
   - Unicorn rolls separately for every hostile damage packet whose base type is `magic`, regardless of Fire, Lightning, Cold, Acid, delivery method, or whether its source is a spell, unit, hero action, artifact, or damage-over-time effect.
   - A successful roll prevents only that packet's damage.
   - Statuses and other effects attached to the hit still apply normally, even when resistance reduces the damage to zero. Their own immunity or legality rules may still prevent them.
   - Magic Resistance never rolls against status or effect application itself.
   - Physical, true, and sacrifice damage are unaffected.

13. **Pre-redesign battle replays are version-gated, not migrated.**
   - Saved runs receive migrations where required.
   - Recorded battles from an older engine/RNG/protocol version may remain viewable only through a compatible old client; the redesigned engine does not attempt to reproduce their old random stream.

14. **Generic unit-skill drafts remain part of runs.**
   - Learned skills are additional run-specific abilities, not replacements for a unit's designed faction abilities.
   - A skill is taught to one persistent strategic unit type, allowing an otherwise supporting or weaker unit to become a carry.
   - Existing uniqueness, level, and eligibility rules prevent impossible or duplicate offers.
   - Learned skills are permanent ability identity for that run, not combat buffs: Cleanse cannot remove them and Claim Blessing cannot steal them.
   - Skill definitions use the same registry, parameter, replay, and UI contracts as innate unit abilities.

15. **Late enemy power shifts from creature quantity into statistics.**
   - Enemy creature budget grows by `90 × 1.25^(Gauntlet Rank - 1)` rather than the current 1.32 exponent; bosses retain their 10% premium.
   - Enemy Veterancy grants every enemy combatant `+floor((Gauntlet Rank - 1) / 2)` Attack and Defence.
   - Generate at most four distinct enemy strategic stacks and do not force every leftover budget point into the cheapest unit.
   - Later encounters prefer access to higher-tier units over enormous low-tier stack counts.
   - Defence Reduction acts on complete effective Defence after Veterancy, so percentage reduction becomes increasingly valuable against later enemies.
   - Armour-Piercing, Corroded, Magic, Attack investment, and Defence Reduction are intentional counters to late enemy Defence.
   - Enemy Attack growth is equally intentional: Defence buffs, Attack reduction, control, and fast elimination become stronger defensive plans.

16. **Training skills create a scaling carry.**
   - **Weapon Training:** one learned skill; the chosen strategic unit type gains Attack equal to the current Gauntlet Rank.
   - **Armour Training:** one learned skill; the chosen strategic unit type gains Defence equal to the current Gauntlet Rank.
   - Training is not picked repeatedly for numerical ranks. Its magnitude automatically follows `state.gauntletRound` after the skill has been learned.
   - A unit type may learn both skills, deliberately concentrating run power into a carry.
   - Training follows controller and unit type rather than strategic-stack origin. Deployed, reborn, reconstructed, raised, and temporary summoned copies of that unit type all inherit the controller's Training.
   - Training bonuses are visible modifier sources and participate in every effective-stat query, preview, replay, and co-op hash.
   - Every generic skill draft guarantees at least one eligible Weapon or Armour Training choice; its other two choices come from the ordinary generic ability pool.

---

## Phase 0 — Protect the current baseline

**Relative size:** Small

1. Run and record the current engine, gauntlet, UI, and replay tests.
2. Catalogue existing uncommitted work before editing shared files.
3. Add focused regression tests for current mechanics that will be reused:
   - Double Strike
   - Life Drain and overheal
   - Blood Frenzy
   - Soul Reaper
   - Bind
   - Burn
   - Joust movement tracking
   - Wait and morale ATB behavior
4. Add a replay fixture covering movement, a multi-hit attack, status application, and death.
5. Do not mix unrelated formatting or refactors into later faction commits.

### Stable gameplay RNG

The current engine seeds an action from presentation-log length. Replace that
coupling before adding new trigger or combat-log events:

```ts
interface BattleState {
  actionSeq: number;
}

function actionId(state: BattleState): string {
  return `${state.seed}:${state.actionSeq}`;
}

function rngFor(
  state: BattleState,
  actionId: string,
  phase: string,
  definitionId: string,
  subjectId: string,
): Rng;
```

1. Increment `actionSeq` exactly once through a single action-sequence finalizer, including Wait, Defend, and forced skips; deployment and presentation playback do not increment it. Phase 2 widens this helper into complete unified turn completion.
2. Never seed gameplay RNG from log length, animation count, registry insertion order, or UI state.
3. Give each random trigger an independent stream keyed by action, trigger phase, definition, and subject. Multiple rolls inside one handler may consume that handler's private stream.
4. Store and hash `actionSeq`; make replay and co-op serialization preserve it.
5. Add regression tests proving that inserting a presentation-only log event or registering an unrelated random ability does not alter existing rolls.
6. Bump the engine/replay version when this lands. Existing recorded battles are intentionally version-gated rather than migrated.

**Exit condition:** The baseline fixture is green, action randomness no longer depends on presentation logs or unrelated handlers, and the new replay hash is stable across two fresh runs.

---

## Phase 1 — Artifact and progression foundations

**Relative size:** Medium

### Artifact catalog

Extend the engine artifact definition with:

```ts
interface ArtifactSpec {
  name: string;
  description: string;
  rarity: ArtifactRarity;
  faction?: FactionClass;
  requiresUnit?: string[];
  starterForFaction?: FactionClass;
  upgrades?: ArtifactId;
  legacy?: boolean;
  stats?: Partial<Record<ArtifactStat, number>>;
}
```

Tasks:

1. Make `stats` optional.
2. Render `description` for mechanic artifacts instead of deriving every tooltip from statistics.
3. Filter drafts by faction and current persistent army.
4. Support unit requirements containing one or several unit names.
5. Support replacement artifacts such as Dragon Ossuary replacing Gravewright's Grimoire.
6. Grant starter artifacts during `newRun` rather than placing them in the draft pool.
7. Keep artifact IDs as persisted data.

### Artifact identity in battle

Mechanic artifacts cannot be flattened into `ArmyBonuses`. Carry their identity
into combat, scoped by controller:

```ts
interface BattleState {
  artifacts: Record<string, ArtifactId[]>;
}
```

1. Populate the map from each controller's run/loadout during `initBattle`.
2. Use one `hasArtifact(state, unit, artifactId)` query that resolves ownership from the acting unit's controller.
3. A co-op partner's artifact never affects another controller's units unless the artifact explicitly defines an allied effect.
4. Preserve artifact IDs in replay, co-op hashing, debug clones, and migrated saved runs.
5. Continue deriving legacy flat `ArmyBonuses` where required during migration, but do not use flattened totals to implement mechanic artifacts.

### Remove old progression

1. Remove automatic faction level bonuses from progression for every faction.
2. Remove the global hero `+1 Attack` and `+1 Defence` per level from every campaign and gauntlet level-up path.
3. Audit every level-based army modifier so no unit receives automatic combat statistics merely from hero level.
4. Preserve deliberately drafted skills if they remain part of the game.
5. Remove the old flat-stat artifact set from new drafts.
6. Keep hidden legacy definitions or migrate old save IDs so existing runs still load.
7. Ensure removed artifacts cannot appear in new item options.
8. Keep new-hero starting values at `2 Attack / 1 Defence`; migrated saves retain their stored current values but receive no further automatic increases.
9. Preserve explicitly designed level formulas that name hero level instead of treating them as implicit stat progression.

### Generic training skills

Keep the existing generic unit-skill draft cadence and add Weapon Training and
Armour Training as unique learned skills. The run stores only which persistent
strategic unit type learned each skill; battle setup derives its current bonus
from `gauntletRound` rather than permanently incrementing copied unit stats.

```ts
function trainingBonus(state: BattleState, unit: UnitStack): {
  attack: number;
  defense: number;
};
```

1. Weapon Training contributes `+state.gauntletRound` Attack.
2. Armour Training contributes `+state.gauntletRound` Defence.
3. Each training skill can be learned once by a given unit type under that controller and appears as a distinct modifier source.
4. The unit may also learn other eligible generic abilities and may combine both Training skills.
5. Draft validation must not offer Training to a unit type that already knows that Training skill.
6. The bonus updates automatically when the run advances to the next encounter; no migration writes a new number after every victory.
7. Resolve Training by controller and unit definition when a stack enters battle. Every matching deployed, summoned, raised, reborn, or reconstructed copy inherits it; another controller's copy of the same unit does not.
8. Each skill draft reserves exactly one eligible Training option when either Training skill remains learnable by any owned unit type. Fill the remaining slots, up to the normal three-choice limit, from non-Training generic skills without duplicates.
9. If no Training option remains eligible, fill up to three choices from the ordinary eligible pool. A Training offer still requires the player to choose which eligible unit type learns it.

### Gauntlet quantity and Veterancy curve

Replace the current quantity-heavy enemy curve:

```ts
function enemyCreatureBudget(rank: number, boss: boolean): number {
  const base = 90 * 1.25 ** (rank - 1);
  return Math.round(base * (boss ? 1.1 : 1));
}

function enemyVeterancy(rank: number): number {
  return Math.floor((rank - 1) / 2);
}
```

Reference values:

| Gauntlet Rank | Creature budget | Enemy Attack/Defence |
|---:|---:|---:|
| 1 | 90 | +0 |
| 3 boss | 155 | +1 |
| 5 | 220 | +2 |
| 7 boss | 378 | +3 |
| 9 | 536 | +4 |
| 10 boss | 738 | +4 |

Generate three or four distinct strategic stacks, merging duplicate unit picks,
and never exceed four. Do not add a new cheapest-unit stack merely to exhaust
the final budget. It is valid to leave a small remainder unspent. Later acts
weight available higher-tier units more strongly so increased budget purchases
quality rather than only creature count.

Store Veterancy as a visible enemy-controller modifier rather than rewriting
unit definitions. Enemy summons and reborn stacks therefore receive the same
current encounter modifier through controller ownership.

Tests cover the reference curve, boss premium, maximum stack count, deterministic
generation, legal tier access, absence of forced cheap top-up, and Veterancy on
initial and temporary enemy stacks.

**Primary files:**

- `src/lib/engine/artifacts.ts`
- `src/lib/gauntlet/items.ts`
- `src/lib/gauntlet/run.ts`
- `src/lib/engine/progression.ts`
- `src/lib/engine/factionSkills.ts`
- `src/lib/gauntlet/skills.ts`

**Exit condition:** Starter, faction, unit, skill, and upgrade gating work deterministically; artifact identity reaches battle with controller ownership; old saves load; no hero or unit receives automatic level-derived combat statistics without an explicit learned skill; and Training follows Gauntlet Rank for only its chosen unit type.

---

## Phase 2 — Battle state, triggers, cooldowns, deployment, and hero actions

**Relative size:** Very large; land the battle-state/trigger contract and deployment persistence as separate reviewable commits.

### Stack origin and ability state

Add serializable battle fields:

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type StackOrigin =
  | { type: 'deployed'; armySlotKey: string }
  | {
      type: 'summoned';
      source: 'gate' | 'necromancy' | 'dragon_ossuary' | 'blood_tithe' | 'knights_reliquary' | 'animus_engine';
      summonerId?: string;
    }
  | { type: 'reborn'; source: 'infernal_rebirth' | 'ninth_circle' };

interface UnitStack {
  origin: StackOrigin;
  hasTakenTurn: boolean;
  empoweredTurnsRemaining?: number;
  cooldowns?: Record<string, number>;
  abilityState?: Record<string, JsonValue>;
}
```

Battle setup also receives the resolved gauntlet encounter number:

```ts
interface BattleInitOptions {
  gauntletRound?: number; // defaults to 1 outside gauntlet
}

interface BattleState {
  gauntletRound: number;
}
```

The gauntlet caller passes `run.battlesWon + 1`. Replays and co-op peers consume
the stored battle value rather than recalculating it from a run.

Rules:

1. Do not add a general `turnsTaken` counter until a mechanic genuinely requires an absolute number of completed turns.
2. First-turn checks use the target stack's `hasTakenTurn` flag.
3. Barbarian opening effects use `empoweredTurnsRemaining`; once-per-battle mechanics use explicit flags or counters.
4. `origin` replaces the vague `summoned` and `summonKind` fields and determines starting-stack eligibility, inheritance, persistence, and death-trigger rules.
5. A reborn stack preserves the original stack's ID, `hasTakenTurn`, cooldowns, and ability state unless its mechanic explicitly resets one of them.
6. Deployment does not set `hasTakenTurn`. Wait, Defend, a normal action, a morale extra turn, and a skipped turn set it at turn completion.
7. Every field survives replay and co-op hashing.

### Deterministic ability trigger pipeline

Register ability, artifact, status, and hero behavior against shared engine phases instead of inserting each mechanic directly into `applyAction`:

```ts
type AbilityTrigger =
  | 'battleStart'
  | 'turnStart'
  | 'beforeAction'
  | 'beforeMove'
  | 'afterMove'
  | 'beforeHit'
  | 'afterDamage'
  | 'afterHit'
  | 'afterDeath'
  | 'afterAction'
  | 'turnEnd';

interface TriggeredDefinition {
  id: string;
  kind: 'unit_ability' | 'artifact' | 'status' | 'hero_action';
  order?: number;
  params?: Record<string, number>;
  triggers: Partial<Record<AbilityTrigger, TriggerHandler>>;
}
```

Trigger rules:

1. Catalog code owns handlers; battle state stores only serializable IDs and values.
2. Hooks may emit semantic effects or new engine events into a deterministic queue.
3. Resolve equal-phase hooks in a stable order using explicit priority, source stack ID, then definition ID.
4. Each event carries action, hit, damage, and death identity so multi-hit and recursive effects cannot trigger twice accidentally.
5. Animation and presentation-log playback never dispatch gameplay triggers.
6. Add a recursion/depth guard and mechanic-specific once-per-event keys for chained death and area effects.
7. A skipped turn still dispatches `turnStart` and `turnEnd` but has no action hooks.
8. Unit abilities, artifacts, statuses, and hero actions contribute definitions through the same dispatcher contract even if their catalogs remain in separate files.
9. Definitions that need memory may read and write only their own namespaced entry in `abilityState` or controller hero-action state.
10. Migrate existing passive `abilities.includes(...)` combat branches into definitions; add a guardrail test preventing ability-specific resolution logic from returning to `battle.ts`, `combat.ts`, or selectors.

### Parameterised mechanics and artifact overrides

Ability definitions read tunable magnitudes through one query rather than
embedding artifact checks or duplicated literals:

```ts
function mechanicParam(
  state: BattleState,
  owner: UnitStack | string,
  definitionId: string,
  key: string,
): number;
```

The query begins with the definition's base `params`, then resolves matching
controller-owned artifact modifiers in stable priority and artifact-ID order.
Replacement, additive, and multiplicative modifiers are distinct operations;
an artifact saying “instead of” uses replacement. Previews and resolution call
the same query. Catalog validation must reject ambiguous same-priority
replacement overrides unless their definitions explicitly declare how they
compose.

### Start-of-turn cooldowns

Use one helper for design-facing cooldown values:

```ts
function startCooldown(stack: UnitStack, abilityId: string, cooldown: number) {
  // The extra tick preserves “unavailable for the next N turns”.
  stack.cooldowns[abilityId] = cooldown + 1;
}
```

The exact turn-opening order is: select the actor, decrease that actor's positive cooldown counters once, dispatch `turnStart`, resolve any forced skip, then expose legal actions to the player or AI. An ability is ready when its counter reaches zero. Ride-By therefore stores 3 after using its design cooldown of 2, counts down to 2 and 1 on the two unavailable turns, and reaches 0 at the start of the third turn. UI helpers translate the internal tick count into player-facing cooldown text.

### Saved formations and reposition-only deployment

Persist formation intent on the gauntlet run rather than serializing battle-owned stack IDs:

```ts
interface SavedFormation {
  version: 1;
  units: Record<string, { col: number; row: number }>;
}
```

Use unit name as the initial `armySlotKey` because the current gauntlet merges each unit type into one strategic army slot. Introduce a persistent army-slot ID before allowing duplicate strategic stacks of the same unit type.

Formation application order:

1. Reconcile the saved template with the current strategic army.
2. Ignore entries for units no longer owned.
3. Creature-count changes require no formation change because each strategic army slot always creates exactly one battle stack.
4. Place newly gained units in deterministic role-appropriate empty cells.
5. If a saved cell is occupied, blocked, or outside the current deployment zone, use the nearest legal empty cell with stable row/column tie-breaking.
6. Build exactly one deployed stack for each current strategic army slot.
7. Apply hero, skill, and artifact effects to every resulting stack after formation construction.
8. Let the player optionally reposition or swap whole stacks, then save their final positions when battle begins.
9. Persist the final resolved deployment in replay and co-op initial state; the saved template itself is run/profile data, not a replay command.

Remove `splitStack`, the split-amount UI, split deployment callbacks/messages, and split-specific tests. Deployment actions are limited to moving a whole owned stack into an empty legal cell or swapping two owned stacks. This keeps the persistent formation a simple mapping from strategic army slot to cell.

Deployment UX requirements:

1. If reconciliation succeeds without changes, the player can begin battle immediately without reopening the formation editor.
2. If a new unit or illegal saved cell required fallback placement, highlight only those placements and offer `Review Formation`.
3. Formation editing supports tap-to-select and tap-to-place as well as drag input.
4. Show enemy opening movement/ranged threat overlays and likely early actors so changing a proven formation is an informed tactical choice rather than routine busywork.
5. Do not add generic shape-based statistic bonuses that merely create another universal best formation.

Saved-formation tests must cover an unchanged army, increased counts, a newly gained unit, a removed unit, a blocked saved cell, a changed Tactics zone, whole-stack swaps, and deterministic application in replay/co-op setup. Add negative tests proving that split requests are no longer accepted through engine or network actions.

### Action context

Create one internal context for action resolution:

```ts
interface ActionContext {
  actionId: string;
  actorId: string;
  kind: 'move' | 'melee' | 'ranged' | 'ability' | 'spell' | 'hero_action';
  startPos?: Pos;
  movedDistance: number;
  primaryTargetId?: string;
  strikeIndex: number;
  isPrimaryHit: boolean;
  isRetaliation: boolean;
  triggeredGoodLuck: boolean;
  deadNonHeroStacksAtStart?: number;
  completion: TurnCompletion;
}

interface TurnCompletion {
  proposals: number[];
  additive: number;
}
```

### Central action validation

Build `ActionContext` only after one shared `validateAction` function has
checked the complete action. It must validate ownership, current actor, movement
reachability, post-movement melee adjacency, Bind and other movement
restrictions, target legality, cooldown/readiness, hero class, spellbook, and
hero-action ownership. Invalid actions return the original state, retain the
turn, consume no resource, start no cooldown, and dispatch no action triggers.

This validation lands before faction mechanics and closes the existing Bind
remote-melee path rather than treating that exploit as a later movement-only
fix.

### Action types

Replace loosely shaped ability actions with explicit payloads:

```ts
type BattleAction =
  | { type: 'ability'; abilityId: string; targetId?: string; to?: Pos }
  | { type: 'hero_action'; actionId: string; targetId?: string; area?: Pos[] }
  | { type: 'cast'; spell: SpellId; targetId: string }
  | ExistingActions;
```

Hero-action validation must check hero class and ownership before resolution.

### Unified turn completion

1. Normal action proposes 0% ATB.
2. Wait proposes 50% ATB.
3. Effects such as Gallop, Rampage, Relentless, and Ride-By artifacts propose another value.
4. Use the highest proposed re-entry value unless text explicitly grants additive ATB.
5. Army-wide ATB grants add to current ATB and clamp at 100%.
6. Invalid actions return the original state and do not spend the turn.
7. Collect competing re-entry proposals in `TurnCompletion.proposals`; never let handler execution order overwrite a previous proposal.
8. Keep explicitly additive grants in `TurnCompletion.additive` and clamp the final result to 100%.

**Primary files:**

- `src/lib/engine/types.ts`
- `src/lib/engine/battle.ts`
- `src/lib/engine/turnOrder.ts`
- `src/lib/engine/unitAbilities.ts`
- `src/lib/engine/triggers.ts`
- `src/lib/engine/deployment.ts`
- `src/lib/gauntlet/run.ts`
- `src/lib/ui/Battle.svelte`
- `src/lib/net/protocol.ts`
- `src/routes/coop/+page.svelte`
- `server/protocol.ts`
- `server/room-orchestrator.ts`

**Exit condition:** Trigger ordering, first-turn state, cooldowns, stack origins, and saved formations behave consistently in normal, skipped, Wait, morale, summon, replay, and co-op cases, and deployment exposes no stack-splitting path.

---

## Phase 3 — Effects, Innate buffs, marks, and cleansing

**Relative size:** Large

### Effect model

Introduce semantic positive and negative combat effects. A practical shape is:

```ts
interface CombatEffect {
  id: string;
  kind: string;
  sourceStackId?: string;
  sourceControllerId?: string;
  positive: boolean;
  innate: boolean;
  removable: boolean;
  stacks: number;
  expires?: EffectExpiry;
  stats?: Partial<Record<UnitModifierStat, number>>;
  data?: Record<string, number | string | boolean>;
}
```

Keep fast numeric fields temporarily if needed, but make the effect ledger authoritative for ownership, expiry, cleansing, theft, and UI. Magic Resistance never queries this ledger when an effect is applied; it modifies hostile magic-damage packets only.

### Innate and Claim Blessing

1. Classify every positive effect explicitly.
2. Claim Blessing builds its candidate list from positive effects where `innate === false`.
3. Use the seeded battle RNG to select one candidate.
4. Remove the complete chosen effect from the target and apply it to Monk with its magnitude and remaining duration.
5. If a future effect allows only one stack to be stolen, encode that in effect data rather than special-casing Monk.
6. Show Innate in buff tooltips.
7. Log the stolen effect, old owner, and new owner.

### Cleanse

1. Add a targeted Monk active ability.
2. Remove every negative effect with `removable === true`.
3. Ensure source-owned effects such as Dendroid Bind remove their link from both target and source bookkeeping.
4. Recalculate derived statistics and movement immediately.
5. Consecrated Censer applies an Innate temporary immunity effect after Cleanse.
6. Corroded is removable and immediately restores normal physical defence calculations when cleansed.

### Target-owned marks

A mark should resemble:

```ts
interface TargetMark {
  kind: 'quarry' | 'ranged_mark' | 'marked_for_death';
  ownerTeamId: string;
  sourceControllerId: string;
  sourceId?: string;
  expires?: EffectExpiry;
}
```

Rules:

1. Store marks once on the target.
2. Attack and damage resolution check the target's marks.
3. Do not copy a buff to every eligible attacker.
4. Name the Quarry tracks which attackers have already triggered it during that plan.
5. Multi-hit attacks trigger a mark reward once per attack.
6. Secondary damage triggers a mark only if its text explicitly allows it.
7. Every controller on the applying controller's allied team may consume or benefit from the mark. Enemy teams never can.

**Exit condition:** Cleanse, Claim Blessing, Name the Quarry, Ranged Mark, and Marked for Death work through shared effect queries with no name-based exceptions.

---

## Phase 4 — Damage, attack, and area primitives

**Relative size:** Large

### Effective Attack and Defence

Resolve strategic statistics through controller-owned modifier sources:

```ts
interface ControllerCombatStats {
  attack: number;
  defense: number;
  sources: Array<{ id: string; label: string; attack?: number; defense?: number }>;
}
```

1. A hero's explicit Attack and Defence apply to every unit under that hero's controller. New heroes retain the existing `2 Attack / 1 Defence` starting values. Fix the current asymmetry where hero Attack applies but hero Defence does not.
2. Enemy Veterancy contributes its Attack and Defence through the enemy controller.
3. Weapon and Armour Training contribute to every stack of the chosen unit type under the controller that learned them, including temporary summons and raised copies.
4. Summons inherit controller-wide hero and Veterancy modifiers as well as any unit-type Training owned by their controller.
5. Defence Reduction operates on complete effective Defence after hero, Veterancy, Training, stance, artifact, and combat-effect modifiers.
6. The unit panel, preview, AI, combat log, and resolution use the same effective-stat query and show its modifier sources.
7. Attack and Defence remain floored at zero.
8. Hero level-up changes level and explicitly level-scaled formulas, but never increments hero Attack or Defence.

### Semantic damage packets

Add context to every damage instance:

```ts
type DamageAttribute = 'fire' | 'lightning' | 'cold' | 'acid';

interface DamagePacket {
  sourceId?: string;
  targetId: string;
  amount: number;
  type: 'physical' | 'magic' | 'true' | 'sacrifice';
  attributes?: DamageAttribute[];
  delivery: 'primary' | 'secondary' | 'retaliation' | 'dot' | 'collision';
  ranged: boolean;
  direct: boolean;
  canTriggerOnHit: boolean;
  canLifeDrain: boolean;
}
```

Return:

```ts
interface DamageOutcome {
  finalDamage: number;
  killed: number;
  overkill: number;
  soulReaperKills: number;
  survived: boolean;
}
```

### Modifier order

Use one documented order:

1. Roll per-creature damage.
2. Apply attack and defense to physical damage; magic bypasses this calculation.
3. Apply outgoing ability and artifact multipliers.
4. Apply Luck and hit-specific procs.
5. Derive secondary damage.
6. Apply target-owned marks and other incoming modifiers, including Weakness Aura for `magic` packets.
7. Apply resistance or immunity.
8. Round once and deal damage.

Wizard damage spells emit `type: 'magic'` packets and may also carry a narrower
attribute. Lightning and Chain Lightning carry `lightning`, Blizzard carries
`cold`, Caustic Breath carries `acid`, and every stated fire effect carries
`fire`. An attribute never replaces the base damage type: fire is magic damage
with `attributes: ['fire']`, not a separate type. General magic bonuses,
vulnerabilities, and resistance check `type`; Fire Immunity and future
element-specific interactions check `attributes`. Weakness Aura therefore
amplifies every magic packet, including attributed magic, before any matching
resistance or immunity is applied. Every magic packet bypasses the normal
attack-versus-defense calculation, regardless of whether it came from a spell,
unit, hero action, artifact, or damage-over-time effect. Magic is still not
`true` damage because magic resistance, Magic Resistance, and
attribute-specific immunity remain valid.

Treat `attributes` as a set. Normalise it to catalog order and remove duplicates
when creating a packet so preview, replay, co-op hashing, and resolution all see
the same representation. Most packets have either no attribute or one; the
array permits a future effect to carry more than one without changing the
damage contract.

Unicorn Magic Resistance is resolved at resistance step 7 for every hostile
packet with `type: 'magic'`. A successful 50% roll prevents that packet
entirely, including Fire, Lightning, Cold, Acid, direct, secondary, area, and
damage-over-time packets. Each packet and each Unicorn stack rolls separately.
It does not inspect whether the source is technically a spell. It never blocks
an attached status: after resistance resolves the damage, the status follows
its ordinary application and immunity rules even when final damage is zero.

Corroded reuses the Armour-Piercing defence rule from the opposite direction: while the effect is active, the target's Defence cannot make incoming physical damage lower than its neutral attack-equals-defence value. Positive attack-over-defence bonuses still apply. Vitriol Catalyst adds a separate 1.5× incoming modifier for magic packets against Corroded targets.

### Shared area resolver

Support:

- 3×3 and 5×5 areas
- primary and secondary percentages
- friendly fire
- enemy-only filtering
- fire immunity
- maximum target counts
- stable target ordering
- preview data for UI and AI

Preview and resolution must call the same damage and area pipeline. Remove the
mirrored damage formula from selectors; preview mode may suppress mutations and
random procs, but it must build the same packets, query the same mechanic
parameters, and apply the same deterministic modifier order.

Initial consumers:

- Knight Area Shot
- Champion Overrun line
- Wizard Caustic Breath, Shockwave, Lightning Strike, and Blizzard
- Demon Cinderburst, Hellfire Shot, Three-Headed Strike, and Hell's Verdict
- Barbarian Boulder Burst, Thunder Dive, and Rain of Iron

### Overheal and overkill

1. `applyHeal` reports requested healing, actual healing, revival, and overheal.
2. Primary attacks report unused overkill.
3. Soul Reaper reports its extra kills separately.
4. Blood Charge and Blood Tithe consume overheal without feeding themselves recursively.

**Primary files:**

- `src/lib/engine/combat.ts`
- `src/lib/engine/battle.ts`
- `src/lib/engine/selectors.ts`

**Exit condition:** Preview, AI estimate, combat log, and actual resolution agree for primary, secondary, fire, marked, and friendly-fire damage.

---

## Phase 5 — Central movement and positional actions

**Relative size:** Large

Create one movement function used by every voluntary and forced position change:

```ts
moveStack(state, stackId, destination, {
  kind: 'voluntary' | 'forced' | 'teleport' | 'return' | 'advance'
})
```

It must update grid occupancy, position, movement-origin state, and movement hooks atomically.

### Required mechanics

1. Fix Bind movement previews and the current remote-melee exploit.
2. Store every Dendroid binding source on the target.
3. Moving, displacing, or killing a Dendroid releases only its own bindings.
4. Implement Sprite Darting Assault return.
5. Implement Cavalier Ride-By Attack:
   - selected special attack
   - minimum three-cell charge
   - automatic return to starting cell
   - no return if dead
   - remain in attack cell if origin becomes illegal
   - cooldown 2
6. Implement Devil Teleport.
7. Implement Ram Rider push and collision.
8. Implement Champion advance after a killing charge.
9. Implement Blinkwing Mantle destination selection.
10. Ensure automatic returns never trigger move-only artifacts.

**Exit condition:** Grid occupancy remains valid after every attack-return, teleport, push, advance, death, summon, and failed action.

---

## Phase 6 — Death queue, summons, corpses, and rebirth

**Relative size:** Very large

Replace scattered death handling with a deterministic queue:

1. Mark the stack dead and clear its cell.
2. Log the death.
3. Resolve death bursts and status transfers.
4. Resolve death artifacts.
5. Resolve corpse rewards.
6. Resolve rebirth.
7. Process new deaths caused by those effects.
8. Check battle end.

### Temporary stack helper

Create temporary stacks with:

- deterministic ID from battle state
- controller ownership
- faction metadata
- typed `StackOrigin`, including the exact summoning, raising, or rebirth source
- stable tie priority
- starting count
- 0% ATB unless modified
- no strategic-army persistence

Do not infer behavior from the resulting creature definition alone. For example, strategic Skeletons, corpse-raised Skeletons, and Blood Tithe Skeletons may share a unit definition while having different artifact eligibility or inherited abilities.

Consumers:

- Demon Gate and Mouth of Hell
- Gravewright's Grimoire
- Dragon Ossuary
- Blood Tithe
- Knight's Reliquary
- Animus Engine reconstruction

### Conflict rule

If rebirth and a corpse raise both claim the dead stack's cell, reserve the original cell for rebirth and place the raised stack in the nearest deterministic legal cell.

**Exit condition:** Simultaneous deaths, chained Cinderbursts, Burn deaths, rebirth, and corpse raising remain deterministic and cannot trigger twice from replay or animation code.

---

## Phase 7 — Knight vertical slice

**Relative size:** Large

### Units

1. Peasant:
   - derived uncapped Militia
   - Spearwall blocks Grand Joust bonuses
2. Archer:
   - friendly-fire Area Shot
3. Griffin:
   - existing Flying and Unlimited Retaliation
4. Standard Bearer:
   - Bravery II
5. Swordsman:
   - Large Shield
   - repeatable uncapped Focus active ability
6. Monk:
   - repeatable targeted Cleanse
   - Claim Blessing using non-Innate effects
7. Cavalier:
   - Gallop
   - Ride-By Attack and cooldown UI
8. Champion:
   - Grand Joust
   - permanent Overrun penetration
   - killing-charge advance and ATB

### Hero

Implement Standing Orders:

- Hold the Line
- Ready the Counterattack
- Advance by Ranks

Only one is active. Switching spends the hero's turn.

### Artifacts

Implement the Knight artifact set after base abilities. Silver Spurs must reduce Ride-By cooldown from 2 to 1.

### Knight acceptance tests

- Militia rises and falls with current Peasant count.
- Cleanse removes all removable negatives in one use.
- Claim Blessing never steals Innate effects.
- Ride-By attacks, returns, enters cooldown, and becomes ready on the correct turn.
- Overrun hits the unit behind the target on every melee attack.
- Stormlance continues without recursively creating new primary attacks.
- Standing Orders replace one another and never use spell hooks.

---

## Phase 8 — Ranger vertical slice

**Relative size:** Large

### Units

1. Sprite:
   - Darting Assault
2. Wood Elf:
   - Pinning Shot with target-turn expiry
3. Outrider:
   - First Strike based on the target stack's `hasTakenTurn` flag
4. Dendroid:
   - source-aware persistent Bind
   - Sheltering Boughs
5. Pegasus:
   - Soaring Strike and end-of-turn rearm
6. Grand Elf:
   - Focus Fire per successful arrow
7. Battle Dwarf:
   - Executioner
   - Relentless
8. Unicorn:
   - Fortune's Herald
   - hostile-magic resistance

### Hero

Implement Hunt Plans:

- Name the Quarry
- Set the Ambush
- Open an Escape Route

Name the Quarry is target-owned and benefits any eligible combatant allied with the applying controller, including co-op partners.

### Artifacts

Implement Wayfarer's Compass first, then unit artifacts, shared ranged focus, Luck artifacts, and The Wild Hunt.

### Ranger acceptance tests

- Name the Quarry benefits hero, summoned, Ranger, and non-Ranger friendly attackers.
- Name the Quarry and every other team-owned mark also benefit an allied co-op controller's eligible units.
- One multi-hit attack receives one Quarry reward.
- First Strike and Ambusher's Map stop applying after the target stack completes its first turn, including Wait, Defend, and a skipped turn.
- Dendroid movement releases all of that Dendroid's bindings and no others.
- Sprite and Cavalier returns use the same origin-validation contract.
- Fortune triggers once per multi-hit attack and uses the highest re-entry ATB.
- Effective initiative remains uncapped for Dew of the First Dawn.
- Magic Resistance rolls independently for every hostile `magic` packet, including attributed direct, area, secondary, and damage-over-time packets, regardless of whether the source is a spell.
- Magic Resistance prevents only hostile magic damage. Attached and standalone statuses are never resisted by this ability.

---

## Phase 9 — Barbarian vertical slice

**Relative size:** Large

### Foundations

1. Set maximum and starting mana to zero.
2. Reject `cast` actions.
3. Replace spellbook UI with War Horn.
4. Grant Banner of the First Raid at run creation.
5. Initialize `empoweredTurnsRemaining` on each starting stack; do not use a general total-turn counter.
6. Decrease opening empowerment when that stack finishes a turn.
7. Track Quickdraw and Banner extensions with explicit per-stack ability state.

### Units

Implement Mob Rule, Blood Rush, Double Strike scaling, Pounce, Marking Shot, Quickdraw, Bully, Follow Through, Battering Ram, Boulder Burst, Marked Quarry, Thunder Dive, and Rampage.

### Hero

Implement Battle Cries:

- Charge!
- Loose!
- Blood for Blood!

Track charges per controller and keep cries outside all spell hooks.

### Marks and artifacts

1. Ranged Mark benefits every friendly shooter.
2. Marked for Death benefits all friendly damage sources.
3. Bloodletter Axe and Worldsplitter multiply to 15×.
4. Apply Marked for Death only after the Worldsplitter hit.
5. Add Banner, cry, ranged, hero-attack, and epic artifacts.

### Barbarian acceptance tests

- Opening buffs affect the first turn rather than the first round.
- Red Sunrise and Butcher's Pennant modify `empoweredTurnsRemaining` without relying on an absolute turn count.
- Ranged Mark works for any friendly shooter.
- Both marks coexist and multiply.
- Bloodletter Axe plus Worldsplitter produces 15× before other modifiers.
- Battle Cries never consume mana and are non-magical, so Magic Resistance does not block them.

---

## Phase 10 — Wizard vertical slice

**Relative size:** Large

### Wizard-only casting

1. Add a per-hero spell list.
2. Absence in an old Wizard save means the original three spells.
3. Non-Wizard heroes always have zero maximum mana and no valid spell list.
4. Derive the spellbook UI from the engine spell catalog.
5. Clamp all regeneration to maximum mana.

### Units

Implement:

- Gremlin Repair and Scrap Frenzy
- Stone Golem Weakness Aura
- Mage Arcane Conduit and Combat Casting
- rename legacy Gorgon to Bilehorn and remove Death Stare
- Bilehorn Caustic Breath, Corrosive Carapace, and three-turn Corroded
- Siege Golem Shockwave
- Giant Boulder Throw
- Titan Armour-Piercing and Lightning Strike

### Spells and artifacts

Implement Slow, Chain Lightning, Resurrect, and Blizzard after per-hero spellbooks work. Then add Wizard unit and spell artifacts.

Lightning and Chain Lightning use `magic` packets with the `lightning`
attribute; Blizzard uses `magic` packets with the `cold` attribute. All three
continue to bypass attack and defense. Caustic Breath uses a `magic` packet with
the `acid` attribute. Resolve Weakness Aura independently for each direct,
chained, line, or area victim based on that victim's position when its packet
resolves.

Implement Hexfield Core as the 3× Weakness Aura upgrade. Implement Pressurised Bile Sac as the five-cell Caustic Breath line and Vitriol Catalyst as the 1.5× magic-damage modifier against Corroded targets. Implement Prism of the Fallen by snapshotting the number of currently dead non-hero stacks when a Wizard hero action begins and applying `1 + 0.2 × deadStacks` to every direct hero-damage packet in that action. Friendly, enemy, summoned, and raised stacks count while dead; a reborn or reconstructed stack stops counting while alive.

### Wizard acceptance tests

- Wizard is the only faction able to cast.
- Granted spells appear in both engine validation and UI.
- Weakness Aura covers the eight orthogonal and diagonal neighboring cells, affects friendly and enemy units, and does not affect units outside those cells.
- Multiple Weakness Auras do not stack; Hexfield Core changes the multiplier from 2× to 3×.
- Area and chained spells evaluate Weakness Aura separately for every victim.
- Fire damage is magic damage carrying the `fire` attribute and is amplified before Fire Immunity is checked; physical, true, sacrifice, and ordinary collision damage are not amplified.
- Lightning, Chain Lightning, Blizzard, and Caustic Breath carry their declared attributes while still receiving every general magic-damage modifier.
- Damage attributes are normalised without duplicates so packet order cannot alter replay or co-op hashes.
- Arcane Conduit remains presence-based and non-stacking.
- Caustic Breath hits every occupied cell in its three-cell line, includes friendly units, starts cooldown 2 only after a legal use, and applies Corroded for three completed target turns.
- Pressurised Bile Sac extends the same line to five cells without changing its damage or friendly-fire rules.
- Corrosive Carapace applies Corroded only after primary melee damage; ranged, retaliation, secondary, damage-over-time, and artifact packets do not trigger it.
- Corroded prevents Defence from reducing physical damage, refreshes rather than stacks, expires after three completed target turns, and is removed by Cleanse.
- Vitriol Catalyst makes Corroded targets take 50% more magic damage and multiplies with Weakness Aura.
- Prism of the Fallen includes all currently dead non-hero stacks, uses one snapshot for a multi-packet hero action, and adds 20 percentage points per stack rather than multiplying once per stack.
- Combat Casting works while adjacent at half damage.
- Armour-Piercing prevents defense from reducing damage but retains attack-over-defense upside.
- Friendly-fire spells and attacks show correct previews.

---

## Phase 11 — Demon vertical slice

**Relative size:** Very large

### Units and statuses

Implement the Fire damage attribute, Burn attribution, Cinderburst, Hellfire Shot, Ignition, Three-Headed Strike, Gate, Infernal Rebirth, Overfeed, Haste Ritual, Torment Aura, Living Flame, Teleport, and Doomstep.

Base Burn deals `3 × state.gauntletRound` magic damage with the Fire attribute
at the start of each of the victim's next two turns. The battle value is the
actual one-based gauntlet encounter number supplied at battle creation. Burn
created in non-gauntlet modes uses round 1 by default. Artifact multipliers and
stacking apply after this base value is calculated.

### Hero

Implement Infernal Rites:

- Blood Offering
- Feed the Fire
- Demonic Bargain

Rites use sacrifice, creatures, or Burn and never mana or spell hooks.

### Artifacts

Implement basic value modifiers first, then Burn transfer/stacking, Gate expansion, death ATB, Brand of Damnation, Seal of the Ninth Circle, and Hell's Verdict.

### Demon acceptance tests

- Fire Immunity affects packets carrying the `fire` attribute but not physical primary projectiles; those fire packets still receive general magic modifiers before immunity is checked.
- A gauntlet battle created for encounter `N` gives base Burn `3 × N` damage per tick, and replay/co-op resolution uses the stored encounter value.
- Non-gauntlet battles default Burn scaling to encounter 1.
- Brand of Damnation doubles direct damage but not Burn ticks.
- Burn remains available for Doomstep unless a Rite consumes it.
- Blood Charge cannot feed its own Life Drain.
- Rebirth and corpse raising resolve in stable order.
- Sacrificed Imp deaths can trigger their intended death effects exactly once.

---

## Phase 12 — Necromancer vertical slice

**Relative size:** Large

The redesigned Necromancer unit abilities already exist. Preserve their current behavior and focus this phase on hero actions and artifacts.

### Hero

Implement Corpsecraft:

- Reknit the Dead
- Grasping Dead
- Death March

All three consume actual Skeleton creatures and feed the shared Skeleton-loss hooks.

### Artifacts

1. Grant Gravewright's Grimoire.
2. Raise temporary Skeletons from terminal enemy deaths.
3. Add direct unit artifacts.
4. Add shared affliction detection.
5. Implement Blood Tithe overheal conversion.
6. Track Skeleton deaths and consumption for Funeral Drum.
7. Expose Soul Reaper kills for Knight's Reliquary.
8. Add infection spread and Shroud preservation.
9. Add Crown of Ruin, Red Moon Covenant, and Black Procession.
10. Add Dragon Ossuary as a replacement last.

### Necromancer acceptance tests

- A corpse produces one raise.
- Summons and heroes do not produce corpse value.
- Corpsecraft competes with Absorb Skeleton using the same battlefield stacks.
- Funeral Drum counts damage deaths and all consumption paths.
- Dragon Ossuary replaces rather than supplements Grimoire.
- Raised units never persist into the gauntlet army.

---

## Phase 13 — UI, AI, compendium, and polish

**Relative size:** Very large

### UI

1. Replace non-Wizard spellbooks with faction-specific hero panels.
2. Display unit cooldowns and active abilities.
3. Show Innate on protected positive effects.
4. Show mark source/controller, duration, and eligible attack type.
5. Show Bind sources and count.
6. Preview all area, line, push, return, teleport, and Hunt Plan destinations.
7. Display derived Militia, Luck, initiative, and aura values.
8. Ensure tooltips use the agreed turn/action terminology.
9. Render artifact descriptions and requirements.
10. Apply the last valid formation automatically and make `Edit Formation` optional rather than a mandatory repeated setup step.
11. Show clear fallback placement for newly gained units and saved cells that became illegal.
12. Remove split controls; formation editing only moves or swaps whole stacks.
13. Show design-facing cooldown values even though the engine stores an additional start-of-turn tick internally.
14. Label the one-based encounter number as **Gauntlet Rank** everywhere the player sees it.
15. Show enemy Veterancy and its complete Attack/Defence contribution on the encounter card and unit modifier breakdown before deployment.
16. Show Weapon and Armour Training as learned skills on their chosen strategic unit type, with the bonus derived from current Gauntlet Rank.
17. Continue showing the hero's controller-wide Attack and Defence, with modifier explanations making clear that level-up no longer increases them.

### AI

1. Generate only legal actions through shared validators.
2. Evaluate friendly-fire area attacks by net value.
3. Compare hero attack with faction hero actions.
4. Score Ride-By return safety.
5. Value Cleanse by total effect severity.
6. Value Claim Blessing by transferable buff strength.
7. Account for mark benefits from every friendly unit.
8. Preserve or spend Skeletons based on expected future value.
9. Price Demon sacrifices and chained death effects.
10. Avoid moving Dendroids when their active bindings are more valuable.
11. Evaluate the reconciled saved formation only after all current units and legal deployment cells are known.
12. Account for effective Attack/Defence, Veterancy, Defence Reduction, Armour-Piercing, Corroded, Magic, and Training when comparing targets and actions.

### Compendium and debug tools

1. Register every new ability and hero action.
2. Add debug controls for statuses, cooldowns, marks, summons, and artifacts.
3. Ensure debug cloning includes every new serializable field.
4. Add effect and artifact icons where needed.

**Exit condition:** A player can understand and target every mechanic without relying on combat logs or design documents, and AI never submits an action that the engine rejects.

---

## Phase 14 — Migration, deterministic verification, and release

**Relative size:** Medium

1. Increment the engine/replay version.
2. Reject playback of pre-redesign recorded battles with a clear version message; do not translate their log-length RNG stream into the new action/trigger streams.
3. Migrate or default all new saved-run and current-version battle fields, including action sequence, gauntlet round, stack origin, first-turn state, cooldowns, ability state, artifact ownership, and hero-action state.
4. Migrate legacy artifact IDs or retain hidden legacy definitions.
5. Migrate persisted Wizard army slots, pending unit cards, artifact requirements, and discovery metadata from legacy unit name `Gorgon` to `Bilehorn`; retain a read-only alias for old save payloads.
6. Increment `RunState.version` for saved formations; old runs default to the automatic formation and acquire a template after their next confirmed deployment.
7. Verify formation reconciliation for changed counts, missing units, new units, duplicate target cells, blocked cells, and a changed Tactics deployment zone.
8. Remove `deploy.split` from both client and server protocols; mismatched older clients fail the normal protocol-version check rather than silently creating a different battle state.
9. Verify seeded RNG order is independent of added presentation-only logs, unrelated random handlers, and trigger catalog registration order.
10. Add replay hash tests for:
   - multi-hit Luck
   - mark triggers
   - buff theft
   - Caustic Breath line, friendly fire, cooldown, Corroded refresh, Cleanse, and three-turn expiry
   - Corrosive Carapace damage-source filtering
   - Bilehorn artifact range and magic-vulnerability upgrades
   - Ride-By cooldown and return
   - Prism of the Fallen dead-stack snapshot and rebirth changes
   - first-turn stack state
   - stack origin and ability state
   - resolved saved formation
   - simultaneous splash deaths
   - Gate and corpse summons
   - rebirth
   - controller-owned mechanic artifacts
   - gauntlet-round Burn scaling
   - Unicorn resistance against direct, area, attributed, and damage-over-time magic
   - Gauntlet Rank Training on only its learned unit type under the owning controller
   - Training inheritance across deployed, summoned, raised, reborn, and reconstructed copies without leaking across controllers
   - enemy Veterancy on deployed, summoned, and reborn enemy stacks
   - Defence Reduction against complete effective Defence after Veterancy
   - guaranteed Training presence in eligible skill drafts and ordinary-pool fallback after Training is exhausted
   - retained new-hero `2 Attack / 1 Defence`, working controller-wide Defence, and no Attack/Defence increase on level-up
11. Run solo and co-op controller-isolation tests.
12. Run every faction through at least one complete gauntlet.
13. Remove temporary saved-run compatibility code only after saved-run fixtures pass.

**Release gate:** All unit abilities, hero actions, artifacts, UI previews, AI decisions, saves, replays, and co-op state agree on the same deterministic result.

---

## Recommended pull-request sequence

| PR | Outcome | Depends on |
|---|---|---|
| 1 | Stable action sequence, isolated trigger RNG, baseline replay hash, replay version bump | Baseline |
| 2 | Artifact metadata and battle identity, starter gating, global progression removal, generic Training, enemy quantity/Veterancy curve, legacy handling | PR 1 |
| 3 | Unified trigger registry and parameter overrides, stack origin/first-turn state, start-of-turn cooldowns, saved formations, central action validation, action context, unified ATB completion | PR 1–2 |
| 4 | Semantic effects, Innate buffs, marks, Cleanse, Claim Blessing | PR 3 |
| 5 | Damage packets, shared preview, Magic Resistance, area resolver, overheal, overkill | PR 3–4 |
| 6 | Central movement, Bind fix, attack-return contract | PR 3–5 |
| 7 | Deterministic death queue and temporary stacks | PR 4–6 |
| 8 | Knight complete vertical slice | PR 2–6 |
| 9 | Ranger complete vertical slice | PR 2–6 |
| 10 | Barbarian complete vertical slice | PR 2–6 |
| 11 | Wizard-only spellbook and Wizard vertical slice | PR 2–5 |
| 12 | Demon vertical slice, gauntlet-scaled Burn, and Infernal Rites | PR 2–7 |
| 13 | Necromancer artifacts and Corpsecraft | PR 2–7 |
| 14 | Full UI, AI, compendium, debug, and balance-value pass | PR 8–13 |
| 15 | Saved-run migration, replay version gating, co-op, and release verification | All |

PRs 4 and 5 can partly proceed in parallel after the action-context and trigger contracts are stable. Faction PRs should otherwise remain sequential when they touch `battle.ts` until action resolution has been split into smaller modules.

## Suggested module extraction

Before the faction slices make `battle.ts` larger, extract:

- `rng.ts` — action identity and definition-scoped deterministic streams
- `actions.ts` — validation and action context
- `triggers.ts` — deterministic phase registration, ordering, and event queue
- `registry.ts` — triggered definitions, parameters, and artifact overrides
- `deployment.ts` — formation reconciliation, legal fallback placement, movement, and swaps
- `effects.ts` — effects, Innate rules, expiry, Cleanse, theft
- `marks.ts` — target-owned mark queries
- `movement.ts` — all grid position changes
- `damage.ts` — damage packets and modifiers
- `areaDamage.ts` — shape and target resolution
- `death.ts` — death queue, rebirth, and death hooks
- `summons.ts` — temporary stack creation
- `heroActions.ts` — faction hero-action catalogs
- `artifactEffects.ts` — artifact value and hook queries

Battle state should continue storing only serializable IDs and values. Catalog functions resolve behavior at runtime.

## Definition of done for each mechanic

A mechanic is not complete until all of the following exist:

1. Unit or artifact catalog data.
2. Engine validation.
3. Deterministic resolution.
4. Combat log event.
5. UI tooltip and visible state.
6. Action or area preview where relevant.
7. AI legality and scoring.
8. Focused unit tests.
9. Replay/hash coverage if it changes state or RNG.
10. Co-op ownership coverage if it affects allies, marks, summons, or hero actions.
11. Trigger phase and ordering coverage if it reacts to another mechanic.
12. Save/reconciliation coverage if it changes deployment intent or strategic-army identity.
13. Controller-scoped artifact coverage if an artifact changes battle behavior.
14. No new mechanic-specific branch in shared action, combat, or selector code when the registry can express it.
