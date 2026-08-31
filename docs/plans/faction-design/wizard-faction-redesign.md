# Wizard Faction Abilities & Faction Artifacts

**Goal:** Give every Wizard unit two abilities that are actually wired into the engine, establish the faction's identity as *an army that powers the hero's magic*, and add faction-gated artifacts (Wizard and Knight) that key off those abilities rather than off flat stats.

**Tech Stack:** TypeScript, Svelte 5, Vitest.

**Terminology:** A **turn** is the period in which a unit becomes active and chooses what to do. An **action** is the move, attack, wait, defend, spell, or ability used during that turn. A multi-hit attack is still one action containing several strikes or shots.

---

## Findings that shape the design

Verified against the engine before designing. Three of these change what is worth building.

### 1. Four wizard "abilities" are cosmetic — no engine read-path

`magic_resistance` (Stone Golem) and `no_melee_penalty` (Mage) appear only in
`src/lib/ui/abilities.ts` and the unit defs. Neither is read anywhere in
`combat.ts` or `battle.ts`. **The Stone Golem and Mage effectively have zero
abilities today.** `undead` and `fire_immunity` are in the same category on
other factions.

### 2. The legacy `magic_resistance` description is too narrow

The old ability was framed as spell resistance even though hostile magic can
also come from unit abilities, Fire, Acid, and damage-over-time packets. Stone
Golem still drops the legacy ability in favour of Weakness Aura. The shared
engine implements the broader all-hostile-magic version for Ranger's Unicorn
rather than retaining a Wizard-specific spell-only rule.

### 3. `no_melee_penalty` is misnamed for this engine

There is no melee penalty. `isShootingBlocked` (`selectors.ts:114`)
*hard-blocks* shooting when any enemy is adjacent. The fix is not "shoot at
full damage" but "shoot at all" — a bigger and better ability than the label
implies. Renamed **Combat Casting**.

### 4. `isLarge` is a data-only flag

It appears in the type, the unit defs, `debugBattle`'s clone, and one
compendium `{#if}`. No two-cell grid footprint, no combat read-path. Any
ability keyed on large creatures (an earlier "Demolisher" idea) is dead on
arrival. **Cut.**

### 5. Bind is buggy in three escalating ways

`effectiveSpeed` (`selectors.ts:6`) computes `speed + speedBonus −
speedPenalty` and never consults `boundUntilRound`.

- **Display:** `UnitInfo.svelte:107` shows full speed for a bound stack.
- **Trap:** `getReachableCells` loops on `effectiveSpeed`, so it still returns
  tiles. The UI highlights moves the unit cannot make; `applyAction` then logs
  `bind_block` and **burns the turn** (`battle.ts:888`).
- **Exploit:** on `attack` with `moveTo` while bound, `battle.ts:900` logs
  `bind_block`, skips the move, then **resolves the melee anyway**. There is no
  adjacency check in the attack branch (it trusts the caller), so a bound unit
  can strike a target across the map.

### 6. There is no per-hero spellbook

`SPELLS` is a global record (`battle.ts:226`) and `Hero` has no spell list —
every hero of every class knows Lightning, Bloodlust and Stoneskin. There is
nothing to grant a spell *to*. Worse, `SpellBook.svelte:27-60` hardcodes the
three as a literal array with hand-written labels; it does not read `SPELLS`.
A granted spell would resolve in the engine and be invisible in the UI.

### 7. Mysticism's mana regen has no cap

`battle.ts:598` adds regeneration with no `maxMana` check. Clamp every mana-gain
path to the hero's maximum so a long battle cannot create an unbounded pool.

---

## Faction identity

**The Wizard army is a positioning-and-spell engine for the hero.**

Stone Golems create dangerous magic-damage zones. Mages amplify spell damage.
The Titan is the artillery finish. Artifacts extend the same axis, and some
grant new spells outright. This is more distinctive than "wizard units ignore
armour", and it gives artifacts a coherent thing to key off.

Armour-Piercing survives as a **Titan-only signature** rather than a
faction-wide trait, and spreads only via the Conduit Array artifact.

---

## Wizard Hero: the only spellcaster

Wizard is the only faction with **mana and spells**. Every other faction replaces the spellbook with its own non-magical or faction-specific hero actions.

On each hero turn, the Wizard chooses between:

- making the normal hero attack;
- spending mana on an immediate spell;
- preserving mana for a later turn; or
- building the army and artifact combinations that unlock stronger spells.

The base spellbook remains Lightning, Bloodlust, and Stoneskin. Spell-tome artifacts add Slow, Chain Lightning, Resurrect, and Blizzard. Stone Golems expose nearby units to amplified magic damage, Mages increase spell damage, and construct deaths or artifacts can alter the rate at which the spellbook is fuelled.

Mana follows these rules:

- only Wizard heroes have a maximum mana value above zero;
- mana regeneration cannot exceed that maximum;
- spell access belongs to the individual Wizard hero rather than a global list;
- non-Wizard heroes cannot cast spells from old saves or spell-granting artifacts; and
- the UI shows mana and the spellbook only for Wizard.

Damaging Wizard spells use **magic** as their base damage type and may carry a
more specific attribute for thematic interactions. Lightning and Chain
Lightning carry **Lightning**; Blizzard carries **Cold**. Caustic Breath is not
a spell, but its damage is magic carrying **Acid**. An attribute never stops the
damage from receiving general magic bonuses, vulnerabilities, or resistance.
Spells such as Bloodlust, Stoneskin, Slow, and Resurrect do not deal damage and
therefore do not need a damage attribute.

This keeps Wizard's decision system resource-driven, while the other factions make decisions through Orders, Battle Cries, Hunt Plans, sacrifices, or battlefield creatures.

---

## Roster

| Unit | Ability 1 | Ability 2 |
|---|---|---|
| Gremlin | Repair (active) | Scrap Frenzy |
| Stone Golem | Weakness Aura | Unlimited retaliation |
| Mage | Arcane Conduit | Combat Casting |
| Bilehorn | Caustic Breath | Corrosive Carapace |
| Naga | No retaliation | Double strike |
| Siege Golem | Crushing Blows | Shockwave |
| Giant | Boulder Throw | Death Blow |
| Titan | Armour-Piercing | Lightning Strike |

### Ability definitions

**Repair** *(Gremlin, active ability)* — spends its turn healing the most wounded
friendly construct (Stone Golem, Siege Golem, Giant, Titan), reviving fallen
creatures up to the count it started with.

**Scrap Frenzy** *(Gremlin)* — if its shot kills at least one creature, it
returns at 50% ATB. The effect is self-limiting because of the
8-shot pool.

**Weakness Aura** *(Stone Golem)* — every other unit in the eight cells directly
or diagonally adjacent to this stack takes **double magic damage**.

- It affects enemies and friendly units.
- It does not affect the Stone Golem carrying the aura unless that Golem is
  adjacent to another allied Stone Golem.
- Check adjacency separately for every victim when each magic-damage packet
  resolves. An area spell may therefore amplify some victims but not others.
- Moving, teleporting, displacing, or killing the Stone Golem updates the aura
  immediately.
- Several Weakness Auras do not multiply one another; a victim is either
  exposed or not exposed.
- Attributed magic—such as Fire, Lightning, Cold, or Acid—is still magic and is amplified by the aura before any matching resistance or immunity is checked.
- Physical, true, sacrifice, and ordinary collision damage are unaffected.

**Arcane Conduit** *(Mage)* — the hero deals 10% more spell damage while this stack lives.
Presence-based, non-stacking.

**Combat Casting** *(Mage)* — can shoot with an enemy adjacent, at half damage.

**Caustic Breath** *(Bilehorn, active ability; cooldown 2)* — choose one of the
eight directions and spray the first three cells in a straight line.

- Every unit occupying those cells takes 75% of the Bilehorn stack's normal
  rolled damage as magic damage with the Acid attribute, including friendly
  units.
- The line continues through occupied cells and affects every occupant in it.
- Every survivor becomes Corroded for its next three completed turns.
- Using the Breath spends the Bilehorn's turn. An invalid direction or a
  cancelled selection does not start the cooldown.
- It follows the shared start-of-turn cooldown rules and is ready again on the
  third Bilehorn turn after use.

**Corrosive Carapace** *(Bilehorn)* — when the Bilehorn takes primary melee
damage, a surviving attacker becomes Corroded for its next three completed
turns.

- Retaliation, ranged, secondary, damage-over-time, and artifact damage do not
  trigger the Carapace.
- It applies after the incoming melee damage resolves.

**Corroded** is a removable negative combat effect. While Corroded, the unit's
Defence cannot reduce incoming physical damage; attack-over-defence bonuses
still apply normally.

- Its duration decreases after the Corroded unit finishes a turn, including
  Wait, Defend, and a skipped turn.
- Reapplication refreshes the duration to three turns and never stacks.
- Cleanse removes it.
- It does not alter magic, true, sacrifice, or collision damage by itself.

**Shockwave** *(Siege Golem)* — melee hits also deal 50% to enemies adjacent to
the target.

**Boulder Throw** *(Giant)* — `shots: 2, range: 8`. A stat change presented as
an ability; zero new code.

**Armour-Piercing** *(Titan)* — the target's defense never *reduces* this
damage. The bonus for attack-over-defense still applies.

> Phrased as "never reduced" rather than "ignores defense" deliberately. A pure
> ignore would **nerf** the Titan against soft targets by discarding its
> +5%/point upside.

**Lightning Strike** *(Titan)* — 3×3 area shot. Primary target 100%,
surrounding eight cells 75%. **Includes friendly fire** — that is what makes
positioning a decision rather than free value.

### Non-stacking auras

Deployment cannot split stacks. Weakness Aura and Arcane Conduit remain
**non-stacking** so temporary stack creation, co-op armies, or future summon
effects cannot multiply them accidentally. Hexfield Core improves the Weakness
Aura multiplier rather than changing this rule.

### Reused as-is (zero implementation)

`unlimited_retaliation`, `double_strike`, `death_blow`, `no_retaliation`, and
`defense_reduction` (Crushing Blows, level 6) are already
implemented. Tireless Guard was an earlier name for `unlimited_retaliation`;
use the existing id and label.

### Legacy Gorgon replacement

The existing sprite is a bipedal, armoured, poison-breathing bull creature, not
a classical Gorgon. Rename the unit to **Bilehorn** while retaining its current
tier, statistics, size, and sprite. Remove Death Stare from this roster slot;
Caustic Breath and Corrosive Carapace replace the complete legacy ability set.

Migrate persisted strategic army entries named `Gorgon` to `Bilehorn`. Keep a
hidden legacy name alias for old saves and replay metadata, but new recruitment,
tooltips, compendium entries, artifact requirements, and drafts use Bilehorn.

---

## Artifacts

### Gating

`itemDraftOptions(run)` already receives the whole `RunState`, which carries
both `faction` and `army` (`run.ts:22`). Add `faction?: FactionClass` and
`requiresUnit?: string` to `ItemDef` and filter the existing `pool` — about
four lines, and `isDeadPick` (`items.ts:130`) is already precisely this
pattern.

**Decision:** `requiresUnit` is checked against `run.army` at offer time only.
The army changes, so an artifact can strand itself when its unit is drafted
away. That is accepted as a player-owned risk — silently re-rolling owned items
is more surprising than a dud.

### Wizard

| Artifact | Rarity | Effect |
|---|---|---|
| Ratchet Loader | Common | Scrap Frenzy returns the Gremlin at 65% ATB instead of 50%. |
| Tinker's Kit | Common | Repair can target any friendly stack, not just constructs. |
| Hexfield Core | Common | Weakness Aura causes adjacent units to take triple magic damage instead of double. Multiple auras still do not stack. |
| Pressurised Bile Sac | Common | Caustic Breath travels five cells instead of three. Every occupied cell in the extended line is resolved normally. |
| Storm Fletching | Common | Lightning Strike splash deals 90% instead of 75% to everyone — including friendlies. |
| Conduit Array | Rare | Friendly stacks adjacent to a Mage inherit Armour-Piercing. |
| Prism of the Fallen | Rare | The Wizard hero deals 20% more damage for each non-hero stack that is currently dead. |
| Overcharged Rods | Rare | Every unit hit by Lightning Strike loses its retaliation until its next turn, friendlies included. |
| Vitriol Catalyst | Rare | Corroded units take 50% more magic damage. This multiplies with Weakness Aura and applies to fire before Fire Immunity. |
| Serpent's Coil | Rare | The Naga's Double Strike also applies to its retaliations. |
| Stormcrown | Epic | Lightning Strike becomes 5×5 at 50%. Still hits friendlies. |
| The Animus Engine | Epic | Repair can rebuild a construct stack reduced to zero, at 1 creature. Once per stack per battle. |
| Codex of the Unbound | Epic | Half of Arcane Conduit's spell-damage bonus is added to the damage of every Armour-Piercing attack. |

#### Prism of the Fallen

Count every friendly or enemy non-hero battle stack currently at zero
creatures, including summoned and raised stacks. A stack that returns through
rebirth or reconstruction stops contributing while it is alive.

The bonus is additive by dead stack: multiplier = `1 + 0.2 × deadStacks`. Three
dead stacks therefore make the Wizard hero deal 160% damage. It applies to the
hero's normal attack and every direct damage packet from a spell or hero
action, but never to unit damage, healing, or sacrifice costs.

Snapshot the dead-stack count when the hero action begins. Every hit, arc, or
area packet belonging to that action uses the same multiplier; deaths caused
mid-action increase the next hero action instead of changing later victims in
the current action.

### Wizard spell tomes

| Artifact | Rarity | Grants |
|---|---|---|
| Scroll of Slowing | Common | **Slow** (2 mana) — −2 speed and −2 initiative on an enemy stack until its next turn. |
| Tome of Chain Lightning | Rare | **Chain Lightning** (3 mana) — magic damage with the Lightning attribute to a target, arcing to the 2 nearest enemies at 50%. Each victim checks Weakness Aura separately. |
| Sigil of Resurrection | Epic | **Resurrect** (5 mana) — heals a friendly stack for 30 + 10×hero level, reviving fallen creatures. Pure `applyHeal`. |
| Tome of the Blizzard | Epic | **Blizzard** (5 mana) — 3×3 magic damage with the Cold attribute, 100% centre / 60% surrounding, friendly fire included. Each victim checks Weakness Aura separately. Reuses the splash primitive. |

## Intended builds

These are the combinations the artifact sets are designed to produce. They
double as acceptance criteria — if a build cannot be assembled, the gating or
the numbers are wrong.

### Wizard

**The arcane kill zone** — Stone Golem + Hexfield Core + Prism of the Fallen,
backed by Lightning, Chain Lightning, or Blizzard. The Golem moves beside a
priority cluster so exposed units take triple magic damage. Friendly units in
the same eight cells are equally vulnerable, making the placement dangerous.
As stacks die on either side, the Prism makes every later hero attack and
damage spell 20% stronger per currently dead stack.

**Storm artillery** — Titan + Stormcrown + Storm Fletching + Overcharged Rods,
with Naga and Giant behind. The Titan blankets a 5×5 at 90% and strips
retaliation from everything it touches; the melee walks into a field that
cannot hit back. Friendly fire is the tension.

**Armour is irrelevant** — Mage stacks + Conduit Array + Codex of the Unbound +
Titan + Siege Golem. Everything adjacent to a Mage pierces armour, and hero
spell power leaks into unit damage. The explicit counter-build to a heavy
defensive line.

**The immortal workshop** — Gremlins + Tinker's Kit + The Animus Engine + both
Golems. Gremlins rebuild construct stacks from zero, so the wall cannot be
removed while a Gremlin lives. Inverts target priority: the enemy must hunt T1
chaff first.

**Vitriol breach** — Bilehorn + Pressurised Bile Sac + Vitriol Catalyst, backed
by Titan, Naga, and damaging spells. A five-cell Caustic Breath line Corrodes a
formation for three turns. Physical units then bypass the targets' defensive
advantage while Wizard magic gains another 50% multiplier. Friendly fire and
the Bilehorn's slow positioning keep the setup dangerous.


---

## Build order

Ordered so that shared machinery lands before its consumers.

### Phase 0 — Bug fixes (independent, do first)

1. **Bind fix.** `effectiveSpeed` returns 0 when `boundUntilRound !== undefined`
   — this fixes both the display and the reachable-cells trap in one line. The
   attack branch returns `state` (keeping the turn) instead of striking from
   range. Genericise the `'Dendroid — Bind'` label at `unitEffects.ts:145`.
2. **Mana cap.** Clamp round-start regen to `maxMana(hero)` at `battle.ts:598`.

### Phase 1 — Splash primitive

One area-damage helper serving **three** consumers: Titan Lightning Strike,
Siege Golem Shockwave, and the Knight Archer's Area Shot. Friendly fire
included; the AI must learn to account for it. This is the only genuinely
moderate mechanic in the package, and building it first is what makes the rest
cheap.

### Phase 2 — Per-hero spellbook

The prerequisite for every spell tome, in both factions.

- `Hero.spells?: SpellId[]` — absent means the base three, so saves stay
  compatible.
- `SpellBook.svelte` derives from `SPELLS` + the hero's list instead of the
  hardcoded literal array.
- `applyAction`'s cast validation gates on the hero's list.

Each new spell then touches `SpellId`, `SPELLS`, the cast branch, `SPELL_META`,
`SPELL_ICONS`, `SPELL_TEXT` — six small, mostly-data edits. Shaped spells
(Blizzard) reuse Phase 1.

**This is the highest-leverage item in the plan.** It unlocks spell artifacts
for every faction, not just the Wizard.

### Phase 3 — Wizard abilities

Trivial first (Armour-Piercing, Scrap Frenzy, Combat Casting,
Boulder Throw, and the free reuses), then Weakness Aura and Arcane Conduit
(both use shared spell-damage queries; Weakness Aura also needs live adjacency
checks on each victim), then Bilehorn Caustic Breath and Corrosive Carapace,
then Repair
(active ability templated on `absorb_skeleton`, plus an AI branch — `ai.ts:14`
currently only reaches for active abilities when *itself* is wounded).

### Phase 4 — Artifact gating

`faction?` and `requiresUnit?` on `ItemDef`, filtered in `itemDraftOptions`.

### Phase 5 — Artifacts

Wizard set, then spell tomes, then the Knight set once the Knight ability
package exists.

---

## Per-ability tax

Every new ability also needs: an `ABILITY_INFO` entry
(`src/lib/ui/abilities.ts`), a `DEBUG_ABILITY_IDS` entry
(`engine/debugBattle.ts`), a status icon where it applies a visible effect, and
tests.

Note `area_shot` is already listed in `DEBUG_ABILITY_IDS` but implemented
nowhere — a stray from earlier planning. Phase 1 makes it real.
