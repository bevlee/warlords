# Faction Redesign Implementation Plan

**Scope:** Implement the redesigned units, faction artifacts, and hero decision systems for Knight, Ranger, Barbarian, Wizard, Demon, and Necromancer.

**Approach:** Land shared engine contracts first, then complete one faction at a time as a playable vertical slice. Each phase should leave the existing game and replay format working.

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
   - Each mark records its applying controller.
   - The source unit does not need to remain alive.
   - Any friendly combatant controlled by that player may benefit if it meets the mark's stated attack restriction.
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
   - Champion keeps Grand Joust and Overrun.

7. **Player-facing text uses turn terminology.**
   - Turn: opportunity for a unit or hero to act.
   - Action: move, attack, wait, defend, spell, hero command, or unit ability.
   - Attack: one melee or ranged action.
   - Hit, strike, or arrow: one damage instance inside an attack.

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

**Exit condition:** The baseline test command and deterministic replay fixture are green before structural changes begin.

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

### Remove old progression

1. Remove automatic faction level bonuses from progression.
2. Preserve deliberately drafted skills if they remain part of the game.
3. Remove the old flat-stat artifact set from new drafts.
4. Keep hidden legacy definitions or migrate old save IDs so existing runs still load.
5. Ensure removed artifacts cannot appear in new item options.

**Primary files:**

- `src/lib/engine/artifacts.ts`
- `src/lib/gauntlet/items.ts`
- `src/lib/gauntlet/run.ts`
- `src/lib/engine/progression.ts`
- `src/lib/engine/factionSkills.ts`

**Exit condition:** Starter, faction, unit, and upgrade gating work deterministically; old saves load; new runs no longer receive automatic class statistics.

---

## Phase 2 — Battle state, turns, cooldowns, and hero actions

**Relative size:** Large

### Stack identity and turn state

Add serializable battle fields:

```ts
interface UnitStack {
  originalStackId: string;
  turnsTaken: number;
  cooldowns?: Record<string, number>;
  usedAbilities?: Record<string, number>;
  summoned?: boolean;
  summonKind?: string;
}
```

Rules:

1. Deployment splitting retains `originalStackId`.
2. `turnsTaken` increases when the unit's turn finishes, including Wait, Defend, and a skipped turn.
3. Deployment does not count as a turn.
4. Cooldowns decrease only after an unavailable turn finishes.
5. A cooldown applied during the current action does not immediately decrease.
6. Every field survives replay and co-op hashing.

### Action context

Create one internal context for action resolution:

```ts
interface ActionContext {
  actorId: string;
  kind: 'move' | 'melee' | 'ranged' | 'ability' | 'spell' | 'hero_action';
  startPos?: Pos;
  movedDistance: number;
  primaryTargetId?: string;
  strikeIndex: number;
  isPrimaryHit: boolean;
  isRetaliation: boolean;
  triggeredGoodLuck: boolean;
  proposedReentryAtb: number;
}
```

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

**Primary files:**

- `src/lib/engine/types.ts`
- `src/lib/engine/battle.ts`
- `src/lib/engine/turnOrder.ts`
- `src/lib/engine/unitAbilities.ts`

**Exit condition:** Turn counts and cooldowns behave consistently in normal, skipped, Wait, morale, split-stack, replay, and co-op cases.

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

Keep fast numeric fields temporarily if needed, but make the effect ledger authoritative for ownership, expiry, cleansing, theft, and UI.

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

### Target-owned marks

A mark should resemble:

```ts
interface TargetMark {
  kind: 'quarry' | 'ranged_mark' | 'marked_for_death';
  ownerControllerId: string;
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
7. Co-op controllers do not consume or benefit from another controller's mark unless they are allied under the applying controller's rules.

**Exit condition:** Cleanse, Claim Blessing, Name the Quarry, Ranged Mark, and Marked for Death work through shared effect queries with no name-based exceptions.

---

## Phase 4 — Damage, attack, and area primitives

**Relative size:** Large

### Semantic damage packets

Add context to every damage instance:

```ts
interface DamagePacket {
  sourceId?: string;
  targetId: string;
  amount: number;
  type: 'physical' | 'fire' | 'magic' | 'true' | 'sacrifice';
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
2. Apply attack and defense.
3. Apply outgoing ability and artifact multipliers.
4. Apply Luck and hit-specific procs.
5. Derive secondary damage.
6. Apply target-owned marks and other incoming modifiers.
7. Apply resistance or immunity.
8. Round once and deal damage.

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

Initial consumers:

- Knight Area Shot
- Champion Overrun line
- Wizard Shockwave, Lightning Strike, and Blizzard
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
- summon origin
- stable tie priority
- starting count
- 0% ATB unless modified
- no strategic-army persistence

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
   - First Strike based on target turns taken
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

Name the Quarry is target-owned and benefits any friendly combatant under the applying controller.

### Artifacts

Implement Wayfarer's Compass first, then unit artifacts, shared ranged focus, Luck artifacts, and The Wild Hunt.

### Ranger acceptance tests

- Name the Quarry benefits hero, summoned, Ranger, and non-Ranger friendly attackers.
- One multi-hit attack receives one Quarry reward.
- Dendroid movement releases all of that Dendroid's bindings and no others.
- Sprite and Cavalier returns use the same origin-validation contract.
- Fortune triggers once per multi-hit attack and uses the highest re-entry ATB.
- Effective initiative remains uncapped for Dew of the First Dawn.

---

## Phase 9 — Barbarian vertical slice

**Relative size:** Large

### Foundations

1. Set maximum and starting mana to zero.
2. Reject `cast` actions.
3. Replace spellbook UI with War Horn.
4. Grant Banner of the First Raid at run creation.
5. Track empowered turns by original stack identity.

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
- Split stacks cannot duplicate opening empowerment.
- Ranged Mark works for any friendly shooter.
- Both marks coexist and multiply.
- Bloodletter Axe plus Worldsplitter produces 15× before other modifiers.
- Battle Cries never consume mana or trigger spell resistance.

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
- Stone Golem Mana Font
- Mage Arcane Conduit and Combat Casting
- leveled Gorgon Bind
- Siege Golem Shockwave
- Giant Boulder Throw
- Titan Armour-Piercing and Lightning Strike

### Spells and artifacts

Implement Slow, Chain Lightning, Resurrect, and Blizzard after per-hero spellbooks work. Then add Wizard unit and spell artifacts.

### Wizard acceptance tests

- Wizard is the only faction able to cast.
- Granted spells appear in both engine validation and UI.
- Mana Font and Arcane Conduit are non-stacking unless modified.
- Combat Casting works while adjacent at half damage.
- Armour-Piercing prevents defense from reducing damage but retains attack-over-defense upside.
- Friendly-fire spells and attacks show correct previews.

---

## Phase 11 — Demon vertical slice

**Relative size:** Very large

### Units and statuses

Implement fire typing, Burn attribution, Cinderburst, Hellfire Shot, Ignition, Three-Headed Strike, Gate, Infernal Rebirth, Overfeed, Haste Ritual, Torment Aura, Living Flame, Teleport, and Doomstep.

### Hero

Implement Infernal Rites:

- Blood Offering
- Feed the Fire
- Demonic Bargain

Rites use sacrifice, creatures, or Burn and never mana or spell hooks.

### Artifacts

Implement basic value modifiers first, then Burn transfer/stacking, Gate expansion, death ATB, Brand of Damnation, Seal of the Ninth Circle, and Hell's Verdict.

### Demon acceptance tests

- Fire immunity affects fire packets but not physical primary projectiles.
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
2. Migrate or default all new optional battle fields.
3. Migrate legacy artifact IDs or retain hidden legacy definitions.
4. Verify seeded RNG order is independent of added presentation-only logs.
5. Add replay hash tests for:
   - multi-hit Luck
   - mark triggers
   - buff theft
   - Ride-By cooldown and return
   - simultaneous splash deaths
   - Gate and corpse summons
   - rebirth
6. Run solo and co-op controller-isolation tests.
7. Run every faction through at least one complete gauntlet.
8. Remove temporary compatibility code only after saved-run fixtures pass.

**Release gate:** All unit abilities, hero actions, artifacts, UI previews, AI decisions, saves, replays, and co-op state agree on the same deterministic result.

---

## Recommended pull-request sequence

| PR | Outcome | Depends on |
|---|---|---|
| 1 | Artifact metadata, starter gating, progression removal, legacy handling | Baseline |
| 2 | Turn identity, cooldowns, action context, unified ATB completion | PR 1 |
| 3 | Semantic effects, Innate buffs, marks, Cleanse, Claim Blessing | PR 2 |
| 4 | Damage packets, area resolver, overheal, overkill | PR 2 |
| 5 | Central movement, Bind fix, attack-return contract | PR 2–4 |
| 6 | Deterministic death queue and temporary stacks | PR 3–5 |
| 7 | Knight complete vertical slice | PR 1–5 |
| 8 | Ranger complete vertical slice | PR 1–5 |
| 9 | Barbarian complete vertical slice | PR 1–5 |
| 10 | Wizard-only spellbook and Wizard vertical slice | PR 1–4 |
| 11 | Demon vertical slice and Infernal Rites | PR 1–6 |
| 12 | Necromancer artifacts and Corpsecraft | PR 1–6 |
| 13 | Full UI, AI, compendium, debug, and balance-value pass | PR 7–12 |
| 14 | Migration, replay, co-op, and release verification | All |

PRs 3 and 4 can proceed in parallel after the action-context contract is stable. Faction PRs should otherwise remain sequential when they touch `battle.ts` until action resolution has been split into smaller modules.

## Suggested module extraction

Before the faction slices make `battle.ts` larger, extract:

- `actions.ts` — validation and action context
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

