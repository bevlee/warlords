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

### 2. `magic_resistance` is unfixable as written

Only player-side heroes exist as combatants (`battle.ts:419`). Enemies never
cast. Spell resistance would guard against a threat that does not exist.
**Dropped from the roster** rather than wired.

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

`battle.ts:598` adds regen with no `maxMana` check. Harmless today; unbounded
once Mana Font, Runed Ballast and Golemancer's Sigil feed the same pool.

---

## Faction identity

**The Wizard army is a mana-and-spell engine for the hero.**

Stone Golems generate mana. Mages amplify spell damage. The Titan is the
artillery finish. Artifacts extend the same axis, and some grant new spells
outright. This is more distinctive than "wizard units ignore armour", and it
gives artifacts a coherent thing to key off.

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

The base spellbook remains Lightning, Bloodlust, and Stoneskin. Spell-tome artifacts add Slow, Chain Lightning, Resurrect, and Blizzard. Stone Golems generate mana, Mages increase spell damage, and construct deaths or artifacts can alter the rate at which the spellbook is fuelled.

Mana follows these rules:

- only Wizard heroes have a maximum mana value above zero;
- mana regeneration cannot exceed that maximum;
- spell access belongs to the individual Wizard hero rather than a global list;
- non-Wizard heroes cannot cast spells from old saves or spell-granting artifacts; and
- the UI shows mana and the spellbook only for Wizard.

This keeps Wizard's decision system resource-driven, while the other factions make decisions through Orders, Battle Cries, Hunt Plans, sacrifices, or battlefield creatures.

---

## Roster

| Unit | Ability 1 | Ability 2 |
|---|---|---|
| Gremlin | Repair (active) | Scrap Frenzy |
| Stone Golem | Mana Font | Unlimited retaliation |
| Mage | Arcane Conduit | Combat Casting |
| Gorgon | Death Stare | Bind, level 1 |
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

**Mana Font** *(Stone Golem)* — while this stack lives, the hero regenerates +1
mana per round. Presence-based, non-stacking.

**Arcane Conduit** *(Mage)* — the hero deals 10% more spell damage while this stack lives.
Presence-based, non-stacking.

**Combat Casting** *(Mage)* — can shoot with an enemy adjacent, at half damage.

**Bind, level 1** *(Gorgon)* — 33% chance on hit to root the target for its
next turn.

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

`splitStack` exists, so three Mage stacks would otherwise triple the aura. Mana
Font and Arcane Conduit are **presence-based and non-stacking**: one stack alive
gives the full bonus, five give the same. Runed Ballast is the artifact that
deliberately turns this rule off.

### Reused as-is (zero implementation)

`unlimited_retaliation`, `double_strike`, `death_blow`, `no_retaliation`,
`death_stare`, `defense_reduction` (Crushing Blows, level 6) are already
implemented. Tireless Guard was an earlier name for `unlimited_retaliation`;
use the existing id and label.

### Bind as a leveled ability

The Dendroid's bind is 100% on hit. A T4 Gorgon rooting on every blow is too
much, but a second `petrify` id is the wrong fix — the tooltip is hardcoded
`'Dendroid — Bind'` at `unitEffects.ts:145`, which is wrong on a Gorgon anyway
and wants genericising regardless.

Instead make `bind` **leveled** in `ABILITY_CATALOG`: chance = 33%×level,
`defaultLevel: 3` so the Dendroid keeps its current 100%, and the Gorgon takes
`abilityLevels: { bind: 1 }`. This is exactly the precedent `defense_reduction`
already set for the legacy Behemoth.

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
| Runed Ballast | Common | Mana Font stacks — every living Stone Golem stack gives +1 mana/round instead of a flat +1. |
| Petrifier's Lens | Common | The Gorgon's Bind is level 2 (66%) instead of level 1 (33%). |
| Storm Fletching | Common | Lightning Strike splash deals 90% instead of 75% to everyone — including friendlies. |
| Conduit Array | Rare | Friendly stacks adjacent to a Mage inherit Armour-Piercing. |
| Golemancer's Sigil | Rare | When a construct stack dies, the hero immediately gains 5 mana. |
| Overcharged Rods | Rare | Every unit hit by Lightning Strike loses its retaliation until its next turn, friendlies included. |
| Basilisk Crown | Rare | Death Stare fires at 20% instead of 10%, and a Death Stare kill applies Bind regardless of the Bind roll. |
| Serpent's Coil | Rare | The Naga's Double Strike also applies to its retaliations. |
| Stormcrown | Epic | Lightning Strike becomes 5×5 at 50%. Still hits friendlies. |
| The Animus Engine | Epic | Repair can rebuild a construct stack reduced to zero, at 1 creature. Once per stack per battle. |
| Codex of the Unbound | Epic | Half of Arcane Conduit's spell-damage bonus is added to the damage of every Armour-Piercing attack. |

### Wizard spell tomes

| Artifact | Rarity | Grants |
|---|---|---|
| Scroll of Slowing | Common | **Slow** (2 mana) — −2 speed and −2 initiative on an enemy stack until its next turn. |
| Tome of Chain Lightning | Rare | **Chain Lightning** (3 mana) — true damage to a target, arcing to the 2 nearest enemies at 50%. |
| Sigil of Resurrection | Epic | **Resurrect** (5 mana) — heals a friendly stack for 30 + 10×hero level, reviving fallen creatures. Pure `applyHeal`. |
| Tome of the Blizzard | Epic | **Blizzard** (5 mana) — 3×3 true damage, 100% centre / 60% surrounding, friendly fire included. Reuses the splash primitive. |

### Knight

Depends on the Knight ability package (uncapped Militia, Area Shot, Focus,
Cleanse, Claim Blessing, Gallop, Ride-By Attack, Grand Joust, Overrun, and Large Shield), which is
specified separately and is a prerequisite for these.

| Artifact | Rarity | Effect |
|---|---|---|
| Muster Bell | Common | Militia gains +1 attack/defense per 8 Peasants instead of 10. Still uncapped. |
| Blackpowder Fletching | Common | Area Shot deals 65% instead of 50% to everyone — including friendlies. |
| Drillmaster's Manual | Common | Each use of Focus also grants +1 attack and defense. |
| Silver Spurs | Common | Ride-By Attack's cooldown is reduced from 2 to 1, allowing it to be used every second Cavalier turn. |
| Shieldwall Standard | Rare | Friendly stacks adjacent to a Swordsman inherit Large Shield. |
| Barbed Volley | Rare | Every Area Shot survivor loses 2 defense until its next turn, including friendly units. |
| Gryphon Talon Bracers | Rare | Griffin retaliations deal 50% more damage and advance the Griffin 10% ATB. |
| Martyr's Banner | Rare | The first time a Peasant stack dies each battle, every surviving Knight stack gains +1 initiative and +1 damage. |
| Consecrated Censer | Rare | A unit targeted by Cleanse cannot receive new negative combat effects until the start of its next turn. |
| Stormlance | Epic | Champion penetration continues through every enemy in the line. Each secondary enemy takes 50% of the original hit. |
| Manual of Perfect Form | Epic | Activating Focus applies one Focus stack to every living Swordsman stack. |
| Royal Muster | Epic | Half the Peasant's uncapped Militia attack/defense bonus is granted to friendly stacks adjacent to the Peasants. |

---

## Intended builds

These are the combinations the artifact sets are designed to produce. They
double as acceptance criteria — if a build cannot be assembled, the gating or
the numbers are wrong.

### Wizard

**The mana battery** — Stone Golems split across several stacks + Runed Ballast
+ Golemancer's Sigil. Each golem stack feeds a mana per round; each one that
dies dumps five more. Unlimited retaliation makes clearing them expensive, so
the hero casts every round of a long fight. Splitting is the play — Runed
Ballast is what turns off the non-stacking rule.

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

**Petrified garden** — Gorgon + Petrifier's Lens + Basilisk Crown + Scroll of
Slowing. Two thirds of Gorgon hits root, Death Stare kills root for free, and
Slow handles the rest. The enemy line never reaches the shooters.

### Knight

**Bombard the shield wall** — Area Shot + Blackpowder Fletching + Shieldwall
Standard. The player fires deliberately into their own formation, because
protected allies take reduced damage while enemies absorb the full blast.

**Patient army** — Focus + Drillmaster's Manual + Manual of Perfect Form behind
a defensive Peasant and Griffin line. The army stands still and scales, forcing
the enemy to commit before the Swordsmen accumulate too much.

**Peasant engine** — Uncapped Militia + Muster Bell + Martyr's Banner + Royal
Muster. Peasants start as a stat engine, support the surrounding army, and
still pay out when destroyed.

**Cavalry assault** — Gallop + Ride-By Attack + Silver Spurs + Grand Joust +
Overrun + Stormlance. Cavaliers charge exposed targets and return to their
starting positions, while the Champion commits to aligned enemies and drives
penetration through the formation.

**Retaliation fortress** — Griffins + Gryphon Talon Bracers + Swordsmen with
Large Shield + Shieldwall Standard. Ranged attacks are blunted; melee attackers
feed the Griffin damage and initiative.

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

Trivial first (Armour-Piercing, Scrap Frenzy, Combat Casting, Bind level,
Boulder Throw, and the free reuses), then Mana Font and Arcane Conduit (both
need a presence check on the round-start and spell-damage paths), then Repair
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
