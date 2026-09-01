# Ranger Faction Abilities & Artifacts

**Goal:** Make Ranger the faction of movement, spacing, and target selection, with three compatible but distinct builds:

1. **Wild Hunt:** rush forward and burst enemies before they take their first turn.
2. **Firing Line:** protect and amplify Wood Elf and Grand Elf ranged attacks.
3. **Sprite Skirmisher:** repeatedly dart into melee and escape, accumulating enough initiative to outlast slower armies.

**Terminology:** A **turn** is the period in which a unit becomes active and chooses what to do. An **action** is the move, attack, wait, defend, or ability used during that turn. A multi-hit attack remains one action containing several strikes or shots.

---

## 1. Current Engine Findings

1. The Ranger roster already contains the right unit categories, but several units lack a second mechanic.
   - Sprite only has Flying.
   - Wood Elf only has No Melee Penalty.
   - Outrider only has a displayed speed bonus.
   - Pegasus only has Flying.
   - Battle Dwarf has no abilities.
   - Dendroid Bind, Grand Elf Double Shot, and Unicorn Blind are functional, although Bind currently expires after one blocked move.

2. Outrider is present in the roster but is not exported by name alongside the other Ranger units.

3. Automatic Archery, Logistics, and Nature's Luck faction ranks currently provide generic level bonuses.
   - These should be removed with the other automatic level bonuses.
   - Their useful concepts return through explicit unit abilities and artifacts.

4. Movement origin is already tracked for move-and-attack actions.
   - Outrider ambushes can reuse it.

5. Sprite attack-and-retreat requires new movement resolution.
   - The base version can return automatically to the cell where it started the turn.
   - An epic version allowing a different retreat cell needs destination preview and selection UI.

6. The current temporary speed penalty clears around round boundaries.
   - Pinning Shot needs to last until the target finishes its next turn, so a fast target cannot clear it earlier than intended.

7. Bind currently stores only an expiry round, not the Dendroid that created it.
   - Persistent roots need source IDs and release hooks when that Dendroid moves, is displaced, or dies.

8. Double Shot is already wired as a second ranged strike.
   - Focus Fire should be applied per arrow, allowing the Grand Elf's second arrow to benefit immediately.

9. Magic Resistance needs a semantic hostile-magic check to justify keeping it on Unicorn.
   - It applies to every hostile magic-damage packet, not only Wizard spells.
   - Fire, Lightning, Cold, and Acid remain magic when they carry their narrower attributes.

10. A shared effective-initiative helper will be useful.
   - Sprite artifacts need previews, ATB ordering, and the unit panel to agree about accumulated initiative.

---

## 2. Faction Identity

### Ranger: control the engagement distance

Ranger wins by deciding **when and where contact happens**.

- Rush units punish enemies who have not acted yet.
- Archers focus the same prey until it collapses.
- Dendroids create protected firing positions and stop enemy movement.
- Sprites trade raw durability for repeated safe attacks and extreme turn frequency.
- Move-only actions cost less tempo, letting the army retreat, rotate, or prepare an ambush without surrendering an entire turn.

Unlike Barbarian, Ranger does not need to win during one universal opening buff. It can burst early, but it can also disengage and reshape the battle if the initial attack fails.

---

## 3. Proposed Default Artifact

### Wayfarer's Compass

**Rarity:** Starter  
**Faction:** Ranger  
**Acquisition:** Automatically owned at the start of every Ranger gauntlet run.

When a Ranger unit completes a move-only action covering at least three cells, it returns at **50% ATB** instead of 0%.

- It may trigger repeatedly during battle.
- Forced movement and deployment do not count.
- An action that includes an attack is not a move-only action.
- Flying units measure the direct distance between starting and ending cells.
- If another effect returns the unit at a higher ATB value, use the higher value.
- Hero and summoned non-Ranger units do not benefit.

This is useful to every playstyle:

- Rush units can reposition and threaten an attack sooner.
- Archers can retreat from approaching melee units without sacrificing a full turn.
- Sprites can escape when Darting Assault is unavailable or unsafe.

---

## 4. Proposed Ranger hero mechanic: Hunt Plans

Ranger heroes have **no mana and cannot cast spells**. Instead, the hero may spend its turn choosing one Hunt Plan. The plan lasts until the hero's next turn, and only one plan can be active at a time.

Hunt Plans are non-magical hero actions. Magic Resistance, Sorcery, Silence, mana effects, and spell artifacts do not affect them.

Hunt Plans have no charges. Their cost is the hero giving up a direct attack, and their value depends on choosing the right target or part of the battlefield.

### Name the Quarry

Choose one enemy unit. Until the hero's next turn, the first time each friendly combatant damages that enemy, the attacker advances 10% ATB.

- A multi-hit attack triggers the reward only once.
- Secondary area damage does not trigger it.
- The benefit is not restricted to Ranger units or one controller. The hero, summoned units, friendly units from another faction, and an allied co-op controller's units may all trigger it.
- If the Quarry dies, the plan ends; the player cannot transfer it for free.

This supports both a concentrated volley and a melee pursuit without simply adding another flat damage bonus.

### Set the Ambush

Choose a 3×3 area. Until the hero's next turn, the first attack made by each friendly Ranger unit that starts its action inside that area:

- deals 30% more damage; and
- cannot be retaliated against if it is a melee attack.

The area remains visible to both players. The opponent may avoid it, force the Rangers out, or attack before the trap is ready.

### Open an Escape Route

Choose a 3×3 area. Until the hero's next turn:

- a friendly Ranger unit that finishes a move-only action inside the area returns at 75% ATB; and
- Sprite may use a legal empty cell inside the area as its Darting Assault return cell.

This is the most positional plan. It can rescue a firing line, prepare a rush from a new angle, or give Sprite a temporary route through a congested battlefield.

These plans deliberately support the three Ranger builds—focused fire, ambush, and mobile skirmishing—without creating a second mana system.

---

## 5. Proposed Roster

| Tier | Unit | Ability 1 | Ability 2 | Battlefield role |
|---|---|---|---|---|
| 1 | Sprite | Flying | Darting Assault | Attack-and-retreat initiative skirmisher |
| 2 | Wood Elf | No Melee Penalty | Pinning Shot | Mobile control archer |
| 2 | Outrider | Fleet Footwork II | First Strike | Fast opening melee burst |
| 3 | Dendroid | Bind | Sheltering Boughs | Ranged-line anchor |
| 4 | Pegasus | Flying | Soaring Strike | Rhythmic aerial attacker |
| 5 | Grand Elf | Double Shot | Focus Fire | Single-target ranged carry |
| 6 | Battle Dwarf | Executioner | Relentless | Durable cleanup attacker |
| 7 | Unicorn | Magic Resistance | Fortune's Herald | Luck-and-tempo capstone |

---

## 6. Detailed Unit Abilities

### Sprite

#### Flying

Reuse the existing Flying movement rule.

#### Darting Assault

When Sprite makes a move-and-attack melee action:

- the target cannot retaliate; and
- after damage resolves, the surviving Sprite returns to the cell where it began the action if that cell remains empty and legal.

Additional rules:

- If the starting cell becomes occupied or blocked during resolution, Sprite remains in its attack landing cell.
- Returning is part of the same action and does not trigger Wayfarer's Compass.
- The return movement ignores intervening units and obstacles because Sprite flies.
- If no movement occurred before attacking, Darting Assault does not trigger.
- On-hit and kill effects resolve before Sprite returns.

This creates the requested loop: fly into range, strike without retaliation, return outside enemy movement range, and act again sooner through initiative investment.

**Implementation tax:** medium; preserve the cell where Sprite started its turn and resolve an automatic post-attack displacement.

---

### Wood Elf

#### No Melee Penalty

Reuse the existing rule: Wood Elf may shoot at full damage while an enemy is adjacent.

#### Pinning Shot

Every surviving primary target hit by a Wood Elf ranged attack has **−2 speed until it finishes its next turn**.

- Repeated Pinning Shots refresh the duration and stack the penalty to a maximum of −6 speed.
- Effective speed cannot fall below 0.
- The penalty affects movement previews and AI pathfinding immediately.
- Secondary or artifact damage does not apply Pinning Shot.

Pinning Shot protects the firing line while also helping Sprites remain outside engagement range.

**Implementation tax:** low–medium; reuse speed penalties with a target-turn expiry.

---

### Outrider

#### Fleet Footwork II

Reuse the current identity: Outrider has +2 speed already included in its final unit statistics.

#### First Strike

Outrider deals **75% more melee damage** to an enemy that has not taken its first turn.

- Waiting counts as taking the turn once the Wait action resolves.
- The bonus applies on any Outrider turn while the enemy has still not taken a turn; it is not limited to the Outrider's first turn.
- Retaliation never receives First Strike.

This makes initiative and target selection the rush build's primary resource.

**Implementation tax:** low after the engine tracks how many turns each stack has taken.

---

### Dendroid

#### Bind

Every surviving target hit by a Dendroid melee attack becomes rooted to that Dendroid.

- A Bound unit cannot voluntarily move while at least one Dendroid binding it remains stationary and alive.
- A Dendroid may Bind multiple enemies over several attacks.
- Multiple Dendroids may Bind the same enemy independently.
- When a Dendroid successfully moves, is forcibly displaced, or dies, every Bind created by that Dendroid immediately clears.
- If one binding source is released but another remains, the target stays Bound.
- Bound units may still attack, retaliate, defend, wait, and use non-movement abilities.

This lets a Dendroid permanently anchor several enemies near the firing line, but moving the Dendroid sacrifices all of its existing roots.

**Implementation tax:** medium; store binding source IDs and release them from movement, displacement, and death hooks.

#### Sheltering Boughs

Friendly ranged units adjacent to a Dendroid:

- take **30% less damage**; and
- may make ranged attacks while adjacent to an enemy without suffering the normal melee restriction or penalty.

- Multiple Dendroids do not stack the damage reduction.
- The effect is checked when the attack or damage resolves.
- Dendroid does not shelter itself unless it gains a ranged attack from another effect.

This makes Dendroid the positional centre of an archer formation rather than merely a very slow melee unit.

**Implementation tax:** low; adjacency aura in damage and shooting eligibility checks.

---

### Pegasus

#### Flying

Reuse the existing Flying movement rule.

#### Soaring Strike

Pegasus begins battle **Soaring**. It also gains Soaring whenever it ends its turn with no adjacent living enemy.

The next primary melee attack made while Soaring:

- consumes Soaring;
- deals **75% more damage**; and
- cannot be retaliated against.

Additional rules:

- Pegasus does not need to move a minimum distance before attacking.
- An attack made without Soaring is an ordinary melee attack.
- If Pegasus ends the same turn away from every enemy through another effect, it may regain Soaring after the attack resolves.
- Forced movement does not grant Soaring by itself; only the end-of-turn safety check matters.

Pegasus now has a clear rhythm: begin above the fight, swoop in for a burst attack, disengage or reposition, and prepare another dive.

**Implementation tax:** low; one per-stack boolean and an end-of-turn adjacency check.

---

### Grand Elf

#### Double Shot

Reuse the existing rule: each ranged attack fires twice and consumes two shots.

#### Focus Fire

Each consecutive Grand Elf arrow that hits the same primary target deals **25% more damage than the previous arrow**, up to 100% more damage.

- The first arrow against a new target has no Focus Fire bonus.
- The second arrow from Double Shot immediately deals 25% more damage.
- Future attacks against that same target deal 50%, 75%, and then 100% more damage.
- Targeting a different unit resets Focus Fire before the new attack.
- A miss or zero-damage result does not increase the counter.
- Secondary and artifact damage do not count as arrows.

Grand Elf becomes the faction's boss and durable-stack killer, while Wood Elf controls movement and handles target switching more comfortably.

**Implementation tax:** low; store last target ID and consecutive arrow count per Grand Elf stack.

---

### Battle Dwarf

#### Executioner

Battle Dwarf deals **100% more melee damage** to a stack at or below 50% of its starting creature count.

Use the target's count before damage is applied.

#### Relentless

When Battle Dwarf's primary melee attack destroys its target, it returns at **50% ATB**.

- Secondary and artifact kills do not trigger it.
- Retaliation kills do not trigger it.
- It can trigger repeatedly.

Battle Dwarf is slower than the faction's cavalry, but turns the damage they create into reliable cleanup.

**Implementation tax:** low.

---

### Unicorn

#### Magic Resistance

Unicorn has a **50% chance to ignore the damage from each hostile magic-damage
packet** that affects it.

- The check uses the damage packet's base type. Fire, Lightning, Cold, Acid,
  direct, secondary, area, and damage-over-time packets all qualify when their
  base type is magic.
- The source does not need to be a spell: unit abilities, hero actions,
  artifacts, and Burn ticks are checked in the same way.
- Each packet rolls separately. Area damage therefore rolls for each Unicorn
  stack, and a multi-packet effect may have some packets resisted and others
  resolved.
- Physical, true, and sacrifice damage are unaffected.
- Magic Resistance applies only to damage. Statuses and other effects attached
  to the packet still apply normally even if the damage is resisted, subject to
  their own legality and immunity rules.
- Standalone status effects are never resisted by this ability.

#### Fortune's Herald

While at least one friendly Unicorn stack lives:

- every friendly Ranger unit gains **+1 Luck**; and
- whenever a friendly unit triggers good luck, it cleanses one negative status and returns at **25% ATB** after its action.

Additional rules:

- Multiple Unicorn stacks do not stack the Luck bonus or ATB reward.
- Cleanse the oldest removable negative status first; ties use a fixed status-priority list.
- The triggering attack still receives its normal good-luck damage multiplier.
- If the unit dies during its lucky action, it cannot be cleansed or receive ATB.
- The aura disappears immediately when the final friendly Unicorn dies.

This turns an army-wide Luck bonus into a faction tempo engine: rush units attack again sooner, archers convert lucky volleys into more shooting turns, and Sprites can cleanse movement control while accelerating their initiative loop.

**Implementation tax:** low–medium; a living-aura check plus a post-luck cleanse and ATB hook.

---

## 7. Ranger Artifacts

Use the shared artifact gating fields:

- `faction?: 'ranger'`
- `requiresUnit?: UnitName | UnitName[]`
- `starterForFaction?: 'ranger'`

### Common

#### Needlepoint

**Requires:** Sprite  
**Effect:** Darting Assault deals 30% more damage.

#### Barbed Fletching

**Requires:** Wood Elf  
**Effect:** Each Pinning Shot applies −3 speed instead of −2; the total cap remains −6.

#### Stag Spurs

**Requires:** Outrider  
**Effect:** First Strike deals 100% more damage instead of 75% more.

#### Canopy Idol

**Requires:** Dendroid  
**Effect:** Sheltering Boughs reduces incoming damage by 50% instead of 30%.

#### Cloud Reins

**Requires:** Pegasus  
**Effect:** Soaring Strike deals 100% more damage instead of 75% more. If it destroys the primary target, Pegasus retains Soaring instead of consuming it.

#### Yewstring

**Requires:** Grand Elf  
**Effect:** Each consecutive Focus Fire arrow gains 35% damage, up to 140% more damage.

#### Grudge Axe

**Requires:** Battle Dwarf  
**Effect:** Executioner applies when the target is at or below 75% of its starting count instead of 50%.

#### Silver Horseshoe

**Requires:** Unicorn  
**Effect:** Fortune's Herald grants +2 Luck instead of +1, and a good-luck trigger returns the acting unit at 40% ATB instead of 25%.

### Rare

#### Quicksilver Dew

**Requires:** Sprite  
**Effect:** Sprite has +4 initiative.

#### Pollen Veil

**Requires:** Sprite  
**Effect:** After Sprite moves at least three cells or returns through Darting Assault, it takes 50% less ranged damage until its next turn.

This prevents the kiting build from being invalidated immediately by ordinary shooters while still allowing spells and area effects to threaten it.

#### Fleeting Shadow

**Requires:** Sprite  
**Effect:** After Darting Assault successfully returns Sprite to safety, Sprite returns at 25% ATB instead of 0%.

"Safety" means no living enemy is adjacent to the returned Sprite.

#### Endless Quiver

**Requires:** Wood Elf or Grand Elf  
**Effect:** All friendly shooters begin with six additional shots. Their qualifying Wayfarer's Compass move returns them at 65% ATB instead of 50%.

#### Predator's Focus

**Requires:** Wood Elf or Grand Elf  
**Effect:** Every consecutive friendly ranged primary hit against the same enemy increases all subsequent ranged damage against it by 10%, up to 100% more damage.

- This is a shared army counter rather than one shooter's personal Focus Fire.
- Any friendly ranged attack against a different primary target resets it.
- Grand Elf Focus Fire stacks multiplicatively with Predator's Focus.

#### Thornwall Seed

**Requires:** Dendroid  
**Effect:** Sheltering Boughs affects friendly shooters within two cells rather than only adjacent shooters.

#### Ambusher's Map

**Faction:** Ranger  
**Effect:** All Ranger melee units deal 30% more damage to enemies that have not taken their first turn.

Outrider First Strike stacks multiplicatively with this bonus.

#### Horn of the Wild Hunt

**Faction:** Ranger  
**Effect:** The first time each friendly melee stack destroys an enemy, every other friendly melee stack gains 15% ATB.

#### Rainbow Mane

**Requires:** Unicorn  
**Effect:** Whenever a friendly unit triggers good luck while Fortune's Herald is active, every other friendly Ranger unit gains 10% ATB.

- The acting unit receives its normal Fortune's Herald ATB value, not both rewards.
- One multi-hit attack can trigger Rainbow Mane only once.

### Epic

#### Dew of the First Dawn

**Requires:** Sprite  
**Effect:** Every time Darting Assault returns Sprite to a cell with no adjacent enemy, that Sprite permanently gains **+1 initiative for the rest of the battle**.

- The bonus is uncapped.
- Each successful Darting Assault can grant it once.
- Different Sprite stacks track their own initiative.
- The bonus is lost after battle.

This is the defining Sprite artifact: if the opponent cannot trap or shoot the Sprite, it gradually takes more and more turns and wins through accumulated tempo.

#### Blinkwing Mantle

**Requires:** Sprite  
**Effect:** After Darting Assault, Sprite may retreat to any legal empty cell within its unused movement range instead of automatically returning to its starting cell.

- Show legal retreat cells after attack resolution.
- If the player declines or no alternative is legal, use the normal starting-cell return.
- AI chooses the cell maximising distance from all enemies, then cover from shooters.

#### Bow of Echoes

**Requires:** Wood Elf or Grand Elf  
**Effect:** Wood Elf fires a second arrow for 75% damage, and Grand Elf fires a third arrow for 75% damage.

- Each extra arrow consumes one shot.
- Every arrow advances Grand Elf Focus Fire and Predator's Focus normally.
- If ammunition is insufficient, fire as many arrows as remain.

#### The Wild Hunt

**Faction:** Ranger  
**Effect:** The first melee attack each Ranger stack makes against an enemy that has not taken its first turn deals **200% damage** and returns the attacker at **50% ATB**.

- Each friendly stack can trigger The Wild Hunt once per battle.
- This multiplies with Outrider First Strike and Ambusher's Map.
- If a unit ability returns a higher ATB value, use the higher value.

#### Fateweaver's Horn

**Requires:** Unicorn  
**Effect:** The first primary attack made by each friendly Ranger stack each battle is guaranteed to trigger good luck.

- This consumes that stack's first-luck guarantee even if the attack deals no damage.
- Multi-hit attacks receive one good-luck multiplier for the whole attack, not one per strike.
- Guaranteed luck triggers Fortune's Herald and Rainbow Mane normally.
- The hero and summoned non-Ranger units do not benefit.

---

## 8. Intended Builds

### Opening Ambush

**Core:** Outrider, Pegasus, Unicorn, Stag Spurs, Ambusher's Map, The Wild Hunt

Use movement and initiative to reach key enemies before they act. Outriders supply the largest early multiplier, Pegasus begins with a prepared Soaring Strike, and Unicorn turns lucky opening attacks into additional tempo.

### Cleanup Hunt

**Core:** Pegasus, Battle Dwarf, Cloud Reins, Grudge Axe, Horn of the Wild Hunt

Pegasus uses Soaring Strike to open or finish a vulnerable stack, retaining Soaring after kills with Cloud Reins. Fast attackers reduce several enemy stacks below the Executioner threshold. Battle Dwarves then chain kills while each death advances the rest of the hunting party.

### Protected Firing Line

**Core:** Wood Elf, Grand Elf, Dendroid, Canopy Idol, Thornwall Seed, Endless Quiver

Dendroids shelter the archers and Bind anything reaching the formation. Wood Elves reduce enemy movement while Grand Elves focus down the most durable target.

### Focused Volley

**Core:** Grand Elf, Yewstring, Predator's Focus, Bow of Echoes

Every arrow increases both the Grand Elf's personal Focus Fire and the army's shared ranged focus. A Grand Elf's three-arrow action rapidly reaches the strongest multipliers.

### Mobile Archers

**Core:** Wayfarer's Compass, Wood Elf, Pinning Shot, Endless Quiver

Archers retreat at partial ATB, slow their pursuers, and resume shooting before slower melee units can close the new distance.

### Eternal Sprite

**Core:** Sprite, Quicksilver Dew, Pollen Veil, Fleeting Shadow, Dew of the First Dawn, Blinkwing Mantle

Sprite repeatedly attacks and retreats to a safe cell. Every successful cycle adds initiative, partial ATB shortens the next wait, and the Pollen Veil reduces ranged counterplay. The opponent must trap it, disable it, or kill it before the initiative engine becomes overwhelming.

### Fortune's Company

**Core:** Unicorn, Silver Horseshoe, Rainbow Mane, Fateweaver's Horn, Grand Elf or Sprite

Every stack begins with a guaranteed lucky attack. Fortune's Herald turns those procs into cleansing and partial turns, while Rainbow Mane advances the rest of the army. Multi-arrow Grand Elves exploit the damage burst; Sprites use the cleanse and ATB to preserve their kiting loop.

### Mixed Skirmishers

**Core:** Sprite, Wood Elf, Dendroid, Wayfarer's Compass

Wood Elves Pin approaching enemies, Dendroids Bind anything that gets through, and Sprites exploit the controlled movement ranges to attack safely.

---

## 9. Implementation Order

### Phase 0 — Shared mobility state

1. Add artifact faction, unit, and starter gating.
2. Grant Wayfarer's Compass in the Ranger new-run path.
3. Track a `hasTakenTurn` flag on each battle stack; no general turn counter is required.
4. Add a shared effective-initiative helper used by ATB, AI, and UI.
5. Make temporary movement penalties expire after the target finishes its next turn.
6. Add source-aware persistent Bind and release hooks for Dendroid movement, displacement, and death.
7. Export Outrider from the Ranger module.

### Phase 1 — Low-tax unit abilities

1. Pinning Shot
2. First Strike
3. Sheltering Boughs
4. Soaring Strike
5. Focus Fire
6. Executioner and Relentless
7. Magic Resistance for every hostile magic-damage packet
8. Fortune's Herald and luck-trigger hooks

### Phase 2 — Sprite movement

1. Store the unit's turn-starting position through move-and-attack resolution.
2. Implement automatic Darting Assault return.
3. Validate cell occupancy and grid updates after kills and displacement.
4. Add AI scoring for safe attack-and-return actions.
5. Add Blinkwing Mantle retreat-cell selection last.

### Phase 3 — Hunt Plans

1. Add a Ranger hero-action panel in place of the spellbook.
2. Store Name the Quarry as a mark on the chosen target, with its controller and expiry, rather than adding a special buff to every friendly unit.
3. Reuse the area preview for Set the Ambush and Open an Escape Route.
4. Add action-level trigger limits for multi-hit attacks.
5. Extend AI scoring to compare a Hunt Plan with the hero's normal attack.

### Phase 4 — Artifacts and build engines

1. Add common numerical artifacts.
2. Add Wayfarer's Compass ATB handling.
3. Add Sprite defensive and initiative artifacts.
4. Add Predator's Focus shared target counter.
5. Add Bow of Echoes multi-shot handling.
6. Add Fortune's Herald, Rainbow Mane, and Fateweaver's Horn.
7. Add The Wild Hunt and cross-check multiplicative damage previews.

---

## 10. Important Edge Rules

- Move-only ATB refunds never trigger from deployment, forced movement, attack returns, or failed movement.
- Deployment cannot split stacks; First Strike reads the target stack's `hasTakenTurn` state directly.
- Darting Assault's return is movement, but not a separate action and not a Wayfarer's Compass trigger.
- If Sprite's starting cell is no longer legal, it remains beside the target unless Blinkwing Mantle supplies another retreat cell.
- Safe-return initiative triggers check adjacency after every death and displacement from the attack resolves.
- Effective initiative has no general cap, allowing the epic Sprite build to scale indefinitely during a battle.
- A unit at 0 speed may still defend, wait, or attack an already adjacent target.
- Bind stores every contributing Dendroid ID; it clears only when all living binding sources have moved, been displaced, or died.
- A failed Dendroid move does not release its roots because its position did not change.
- Focus Fire counters key by stable target ID and reset when their owner intentionally attacks a different primary target.
- Multi-arrow attacks stop when the target dies; remaining arrows are not spent and do not transfer to another target.
- Ranger percentage bonuses multiply rather than add unless their text explicitly replaces a value.
- Magic Resistance affects the damage from every hostile magic packet, but never blocks its attached status or a standalone status effect.
- Marks belong to their target rather than the unit that created them. Unless a mark explicitly names a narrower attack type, any combatant on the applying controller's allied team may benefit.
