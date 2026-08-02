# Artifact Identity System — Design

Artifacts become the game's build system. Each faction opens its run with a
fixed artifact that *is* its playstyle, faction-locked artifacts deepen that
identity, and a global pool of archetype-enablers lets any faction chase
strategies like alpha-strike, no-retaliation rush, or pure archer.

Supersedes the stat-bag catalog in `2026-08-02-faction-artifacts-design.md`
(the pooling/weighting model from that doc still stands — see *Pooling*).
Retires the hero faction talents (`FACTION_SKILL_DEFS`).

## The core shift: stat bags → effect hooks

Today an artifact is `Partial<Record<ItemStat, number>>` summed into
`ArmyBonuses` at battle start. That can express "+8 attack" and nothing else,
which is exactly why the current catalog is dull. Nothing in it can say "on
enemy death, raise a skeleton."

So `ItemDef.effects` becomes a list of tagged effects over **six hook points**,
every one of which already has a working precedent in the engine:

| Hook | Fires | Precedent in code |
|---|---|---|
| `battleStart` | stack construction in `initBattle` | `armyBonuses` — `battle.ts:255` |
| `roundStart` | each round tick (incl. round 1 only) | `round_start` event — `turnOrder.ts:51` |
| `onDeath` | any stack dies, either side | Demon Gating — `battle.ts:139-158` |
| `onHit` | after damage lands | `slow_on_hit` / `burn` / `blind` — `battle.ts:110-130` |
| `damageMod` | damage pipeline | `applyOffenseBonus` — `combat.ts` |
| `runReward` | between battles | `recordBattle` — `run.ts:217` |

```ts
type ArtifactEffect =
  | { hook: 'battleStart'; apply: (stack, ctx) => UnitStack }
  | { hook: 'roundStart'; round?: number | 'each'; apply: (state, ctx) => BattleState }
  | { hook: 'onDeath'; side: 'player' | 'enemy'; apply: (state, dead, ctx) => BattleState }
  | { hook: 'onHit'; apply: (striker, victim, ctx) => { victim; events } }
  | { hook: 'damageMod'; apply: (damage, ctx) => number }
  | { hook: 'runReward'; apply: (run: RunState) => RunState };
```

Artifacts register effects; the engine calls each hook once per site with the
run's active artifact list. Adding artifact #40 means adding a catalog entry,
not editing `combat.ts` again. Stat bonuses stay expressible as a trivial
`battleStart` effect, so nothing in the existing catalog is lost.

## Faction identities

One sentence each. If an artifact doesn't serve the sentence, it belongs in the
global pool instead.

| Faction | Identity | Fantasy | Wins by | Loses to |
|---|---|---|---|---|
| **Barbarian** | *Hit first, hit everything, don't plan for round 5.* | Rush | Front-loaded power that decays each round | Anything that survives the opening |
| **Knight** | *The line does not move.* | Attrition | Getting stronger every round it holds formation | Being forced out of position |
| **Wizard** | *The hero is the army.* | Spell engine | Mana economy; units are delivery, not damage | Mana starvation, fast pressure |
| **Necromancer** | *The battlefield is your recruitment pool.* | Corpse economy | Converting enemy deaths into your army | Fights that end too fast to harvest |
| **Ranger** | *Nothing reaches you.* | Ranged denial | Shots, range, and movement denial | Getting closed down |
| **Demon** | *Death is a resource, not a loss.* | Sacrifice | Trading its own stacks for value | Attrition that outlasts the returns |

Barbarian and Knight are deliberate mirror images — one decays, one compounds.
That contrast is the clearest way to teach a player that artifacts, not stats,
decide how a run plays.

## Starting artifacts

Fixed per faction, granted in `newRun`, never drafted (excluded from the offer
pool). Picking a faction *is* picking a playstyle.

| Faction | Starter | Effect | Hook |
|---|---|---|---|
| Barbarian | **Warpaint of the First Charge** | +3 speed to all your stacks during round 1 only | `roundStart` (1) |
| Knight | **Oathstone Bulwark** | A stack that didn't move on its turn gains +3 defense, stacking each round it holds (max +15) | `roundStart` each |
| Wizard | **Conduit Sigil** | Your hero's ATB fill rate doubles — the hero acts about twice as often | `battleStart` |
| Necromancer | **Corpse Harvest** | When an *enemy* stack dies, a Skeleton stack rises in its cell under your control | `onDeath` (enemy) |
| Ranger | **Hawkeye Quiver** | +2 shots to every shooting stack; your shooters ignore the melee penalty | `battleStart` |
| Demon | **Gatekeeper's Chain** | 50% chance a fallen stack of yours returns at 25% of its original count | `onDeath` (player) |

Every one of these is a *behaviour* the player can watch happen. That is the
whole point — compare "+4 attack", which nobody has ever noticed firing.

## Faction artifacts

Three per faction, draft-only, rare/epic (never common — these are identity
pieces). Necromancer's three are the ones you specified.

| Faction | Artifact | Rarity | Effect | Serves the identity by |
|---|---|---|---|---|
| **Barbarian** | Bloodfury Totem | rare | +50% damage in round 1, +25% in round 2, nothing after | Making the decay explicit and loud |
| | Skullcrusher Idol | rare | Attacks on a stack that hasn't acted yet this round take no retaliation | Rewarding alpha strike ordering |
| | Rage of the Horde | epic | Each enemy stack killed gives all your stacks +1 morale (stacks, to +5) | Snowballing a fast opening into more turns |
| **Knight** | Banner of the Unbroken | rare | Your stacks retaliate against every attacker, unlimited | Punishing everything that touches the line |
| | Shieldwall Doctrine | rare | Adjacent friendly stacks grant each other +2 defense | Making formation a real decision |
| | Crusader's Reliquary | epic | First time each stack would drop below 20% HP it heals to 50% instead (once per stack) | Surviving the burst that breaks formations |
| **Wizard** | Manafount | rare | +3 mana per round | The mana economy, replacing Mysticism |
| | Arcane Overflow | rare | Every enemy stack death refunds 3 mana | Spells that pay for themselves |
| | Archmage's Crown | epic | +50% spell damage; Lightning chains to a second target | Hero-as-army payoff |
| **Necromancer** | Grave Tide | rare | Corpse Harvest raises **twice** as many Skeletons | More bodies per corpse |
| | Shroud of Despair | rare | −3 morale to **all** stacks; undead ignore morale; **every enemy freeze raises a Skeleton** | Asymmetry your army ignores, paid out in bodies |
| | Dragon Crypt | epic | Corpse Harvest raises **Bone Dragons** instead of Skeletons | The run-defining ceiling |
| **Ranger** | Thornward Snare | rare | Enemies that end movement adjacent to your stacks lose 2 speed next round | Denial — nothing closes the gap |
| | Volley Doctrine | rare | Grants `double_shot` to your highest-tier shooter | Shot-count scaling |
| | Heart of the Wildwood | epic | Stacks that haven't been attacked yet deal +40% damage | Paying out for perfect kiting |
| **Demon** | Brimstone Pact | rare | When one of your stacks dies, all survivors gain +3 attack (stacking) | Death is literally profit |
| | Sacrificial Rite | rare | Destroy one of your stacks to fully heal another (once per battle) | Player-authored sacrifice |
| | Infernal Crown | epic | All your stacks apply `burn` on hit | Faction-flavour damage floor |

### Necromancer walkthrough

The build you described, end to end. Corpse Harvest kills an enemy stack →
Skeletons rise → those Skeletons are built from the run's **merged** unit def,
so every permanent skill you've drafted onto Skeletons (Lifesteal, Bravery,
Fleet Footwork) applies to the raised ones too. That's the skeleton-buffing
team: reward drafts compound into units you don't recruit, you harvest. Grave
Tide doubles the rate, Dragon Crypt swaps the output for Bone Dragons, and
Shroud of Despair makes the whole board miserable for everyone but you.

### Morale math, and why Shroud of Despair got rewritten

`checkMorale` (`combat.ts:180`) is flat `1/24` per point. A freeze costs the
stack its entire turn (`battle.ts:577`); a boost grants an entire extra one
(`battle.ts:764`) — symmetric turn economy.

| Morale | Proc chance |
|---|---|
| ±1 | 4.2% |
| ±2 | 8.3% |
| ±3 | 12.5% (current `clampProc` cap) |
| ±4 | 16.7% |
| ±5 | 20.8% |

Per roll that looks minor, which is misleading: it rolls on *every turn of
every stack*. Against 5 enemy stacks over 6 rounds (~30 rolls), −5 deletes
~6.25 enemy turns and −3 deletes ~3.75 — a fifth of the enemy army's total
output, comparable to killing a stack outright in round 1.

The magnitude was never the problem. The problem is that the payoff is
**diffuse and invisible**: 30 quiet dice rolls with no moment the player can
point at, sitting at epic rarity next to *bone dragons*. So the card now pays
its procs out in bodies — every enemy freeze raises a Skeleton, which makes
each proc a visible event, welds the aura to the corpse economy instead of
leaving it as an orphan debuff, and gives the player a reason to want the
enemy alive-but-frozen rather than merely dead.

Two knock-on simplifications: the aura drops to **−3**, so open assumption #3
(lifting `clampProc` to ±5) is no longer needed for this card — it's only
needed if you want Rage of the Horde's +5. And the card drops to **rare**,
leaving Dragon Crypt as the faction's single epic.

If you'd rather keep it as a pure aura, the honest alternative is to convert
the proc into a standing condition — *"−2 morale to enemies; enemy stacks at
negative morale cannot retaliate"* — which trades all the variance for a
reliable rule change that combos with the global no-retaliation archetype.
Strictly better design, slightly less Necromancer.

### Implementation notes this build lives or dies on

1. **Raised stacks must use the merged def.** Spawning the raw `SKELETON`
   constant instead of `applyUnitSkills(...)`'s Skeleton silently breaks the
   entire archetype — the buffs you drafted just wouldn't apply. This is the
   single most likely bug in the feature.
2. **Do raised Skeletons persist after the battle?** `survivorsFrom`
   (`run.ts:206`) collapses living player stacks into the run army, so by
   default they *would* persist and compound. Recommend **yes, they persist** —
   it's the fantasy, and enemy budget already scales at `1.32^n`. Flag as the
   #1 balance watch item; the kill switch is tagging raised stacks
   `isAlly`-style so `survivorsFrom` skips them.
3. **Raise volume needs a cap.** Suggest
   `floor(deadStack.startCount × deadUnit.hp × 0.15 / SKELETON.hp)`, capped at
   20 per death, and only when the dead stack's cell is free. Dragon Crypt uses
   the same HP pool against `BONE_DRAGON.hp` (250), so it naturally yields ~1
   dragon per large stack rather than 40.

## Global artifacts

Available to every faction, drafted from the shared pool. These exist to make
the strategies you named actually assemblable. No pure stat bags — every one
changes a rule.

| Archetype | Artifact | Rarity | Effect |
|---|---|---|---|
| **Alpha strike** | Executioner's Edge | rare | Each stack's *first* attack of the battle deals double damage |
| | Headsman's Wager | rare | +100% damage vs. full-HP stacks; −25% vs. damaged ones |
| **No-retaliation** | Duelist's Cloak | rare | Attacking a stack with lower initiative than yours takes no retaliation |
| | Ghoststep Charm | epic | Your stacks take no retaliation on the round they moved 4+ cells |
| **Archer** | Endless Quiver | common | +3 shots to all shooting stacks |
| | Marksman's Lens | rare | Ranged attacks ignore 50% of the target's defense |
| **Speed/tempo** | Chrono Beads | rare | +2 initiative; your stacks all act before the enemy in round 1 |
| | Boots of the Vanguard | common | +3 speed to all stacks |
| **Sustain** | Sanguine Chalice | rare | All melee stacks gain 15% lifesteal |
| **Swarm** | Warlord's Muster | rare | Your smallest stack doubles in count at battle start |
| **High risk** | Glass Cannon Idol | epic | +60% damage dealt, +40% damage taken |
| | Last Stand Banner | rare | Stacks below 25% of starting count deal double damage |

Ghoststep + Boots + Chrono Beads is the no-retaliation speed rush you asked
for. Endless Quiver + Marksman's Lens + Hawkeye Quiver is the archer deck.
Executioner's Edge + Glass Cannon + Bloodfury Totem is Barbarian one-shot.
Each archetype has at least one common so it's reachable early, and at least
one epic so it has a ceiling.

## Retiring faction talents

`FACTION_SKILL_DEFS` goes away. Every talent's job is absorbed:

| Talent | Absorbed by |
|---|---|
| Offense, Armorer, Leadership | Global artifacts + Barbarian/Knight faction sets |
| Tactics (Knight) | Oathstone Bulwark's hold-the-line loop |
| Necromancy (Necro) | Corpse Harvest — in-battle, visible, better |
| Gating (Demon) | Gatekeeper's Chain — same mechanic, bigger, all units |
| Archery, Logistics, Nature's Luck | Hawkeye Quiver + Boots + globals |
| Sorcery, Intelligence, Mysticism | Conduit Sigil + Manafount + Archmage's Crown |

**Assumption (flip if you disagree): scope the removal to the gauntlet.**
Gauntlet heroes enter battle with `factionSkills: []`; campaign and co-op keep
talents. `factionSkills` is read from ~12 sites across `combat.ts`,
`battle.ts`, `initBattle` and `campaign/+page.svelte`, so an engine-wide rip-out
rebalances campaign mode as collateral. One line in the gauntlet battle path
buys the same gauntlet experience at a fraction of the risk. Delete the module
later, once artifacts have proven out.

**Consequence — hero progression goes thin.** With talents gone, a gauntlet
level-up is just +1 attack / +1 defense (`run.ts:220-225`), which is nothing.
Compensate by **raising artifact cadence from every 3 wins to every 2**
(`run.ts:240`): a 10-node run then yields 5 drafted artifacts plus the starter
instead of 3, which is enough to actually assemble a build. This is the single
most important number in the document.

## Open assumptions

Four calls I've made that are each one constant to change:

1. **Talent removal is gauntlet-scoped**, not engine-wide (above).
2. **`undead` becomes mechanically real** — undead stacks ignore morale
   entirely. Today the ability is decorative: nothing in the engine reads it.
   Shroud of Despair's −5 morale aura is only a Necromancer *strength* if their
   own army is immune; otherwise it's a symmetric debuff that hurts you back.
   This is a ~5-line change in `checkMorale` (`combat.ts:180`) and it buffs
   Necromancer across every mode.
3. **`clampProc` rises from ±3 to ±5** (`battle.ts:230`) — now optional. With
   Shroud rewritten to −3 this is only needed to make Rage of the Horde's +5
   reachable (20.8% chance of a free turn per turn, on stacks you've invested
   in — strong enough that it may want to be +4). Without the lift, any card
   printing a number above 3 silently clamps and lies about itself.
4. **Starters are fixed, not chosen.** One artifact per faction, always. A
   1-of-3 starter pick would triple replayability at the cost of designing and
   balancing 18 bespoke effects up front instead of 6 — worth doing later, once
   the six identities have proven out in play.

## Pooling

Unchanged from `2026-08-02-faction-artifacts-design.md`: one merged candidate
list, one rarity-weighted roll, `FACTION_AFFINITY = 3` so the small faction
sub-pool isn't buried by the global one. Two additions:

- The faction's **starter is excluded** from the offer pool (it's already
  owned — the existing `owned` filter handles this for free once `newRun` seeds
  `items: [STARTER[faction]]`).
- **Rarity is re-read as impact, not stat budget.** Behaviour artifacts have no
  stat total to scale: common = archetype enabler, rare = build-defining, epic =
  run-defining. The existing `isDeadPick` capped-stat exclusion only applies to
  artifacts with stat effects; behaviour artifacts are never dead picks.

## Testing

- **Hook dispatch** — each of the six hooks fires at its site, once per active
  artifact, in catalog order; an empty artifact list is a no-op (guards
  non-gauntlet battles).
- **Corpse Harvest** — an enemy stack death spawns a player Skeleton stack in
  the freed cell; count matches the HP formula; no spawn when the cell is
  occupied; **the spawned def carries the run's granted unit skills** (the
  regression that would silently kill the archetype).
- **Dragon Crypt / Grave Tide** — same harvest event, different output unit and
  multiplier; the two compose.
- **Round-scoped effects** — Warpaint grants +3 speed on round 1 and the bonus
  is *gone* on round 2; Bloodfury's multiplier steps 1.5 → 1.25 → 1.0.
- **Oathstone** — defense accrues only on rounds the stack didn't move, and
  caps at +15.
- **Undead morale immunity** — an undead stack under Shroud never freezes; a
  living stack does; each enemy freeze under Shroud raises exactly one Skeleton.
- **Starters** — `newRun(faction)` grants exactly the right artifact, and it
  never appears in a subsequent draft offer.
- **Talent removal** — gauntlet battles run with `factionSkills: []`; campaign
  battles are untouched (existing `newFactionSkills.test.ts` must still pass).
