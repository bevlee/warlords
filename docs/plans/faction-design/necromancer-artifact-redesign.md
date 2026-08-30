# Necromancer Faction Artifacts

**Goal:** Build the Necromancer artifact set around corpses, cumulative debuffs, life drain, and Skeletons as a spendable battlefield resource.

This assumes the redesigned Necromancer unit abilities are already the faction baseline:

- Skeleton — Undead
- Zombie — Slow on Hit, Infecting Strike
- Ghost — Flying, No Retaliation, Drain Morale
- Blood Acolyte — Life Drain III, Blood Frenzy
- Vampire — Flying, No Retaliation, Life Drain X
- Lich — Curse Shot
- Black Knight — Death Blow, Soul Reaper
- Bone Dragon — Flying, Defense Reduction VIII, Absorb Skeleton

**Terminology:** A **turn** is the period in which a unit becomes active and chooses what to do. An **action** is the move, attack, wait, defend, or ability used during that turn. A multi-hit attack remains one action containing several hits.

---

## 1. Faction Artifact Identity

Necromancer relics should create four related resources:

1. **Corpses:** enemy stack deaths generate new undead.
2. **Bones:** raised Skeletons fight, screen, trigger death effects, or heal Bone Dragons.
3. **Afflictions:** Infection, Curse, Slow, and drained Morale make a target progressively easier to dismantle.
4. **Blood:** Blood Acolytes and Vampires convert damage into healing, frenzy, and eventually more bones.

Unlike the Demon faction, Necromancer does not want uncontrolled friendly destruction. It wants to extract value from every death and slowly turn the battlefield into an undead advantage.

---

## 2. Proposed Necromancer hero mechanic: Corpsecraft

Necromancer heroes have **no mana and cannot cast spells**. Instead, they use Corpsecraft by consuming actual friendly Skeletons on the battlefield. These are the same Skeletons used for blocking, Funeral Drum, Blood Tithe, and Absorb Skeleton, so every hero ability competes with the rest of the faction's bone economy.

Corpsecraft is not spellcasting. Spell resistance, Sorcery, Silence, mana effects, and spell artifacts do not affect it.

The starting ideas are:

### Reknit the Dead

Choose a wounded friendly non-Skeleton undead unit and consume up to five Skeletons from the largest friendly Skeleton stack.

- Each Skeleton restores HP equal to 25% of one creature's maximum HP in the chosen stack.
- Healing may revive creatures, but never beyond the stack's starting count.
- Consume only as many Skeletons as the target can use.

This gives the hero reliable restoration, but using it on a Bone Dragon may consume the same Skeletons that the Dragon wanted for Absorb Skeleton.

### Grasping Dead

Consume five Skeletons and choose an enemy unit. Until it finishes its next turn:

- it cannot move; and
- it cannot retaliate.

The target may still attack an adjacent unit, shoot if otherwise allowed, defend, wait, or use a non-movement ability. This spends bones to hold a valuable target in place for the rest of the undead army.

### Death March

Consume ten Skeletons. Every living friendly non-Skeleton Necromancer unit advances 20% ATB.

- Strategic and temporarily raised Skeletons may both be consumed.
- ATB is granted only after the Skeletons are removed, allowing Funeral Drum to trigger first when appropriate.

Death March turns a large corpse economy into immediate tempo, but leaves fewer bodies for protection, preservation, or Bone Dragon healing.

The exact Skeleton costs can be tuned later. The important rule is that Corpsecraft consumes visible battlefield units rather than a renamed mana counter.

---

## 3. Default Faction Artifact

### Gravewright's Grimoire

**Rarity:** Starter  
**Faction:** Necromancer  
**Acquisition:** Automatically owned at the start of every Necromancer gauntlet run. It does not appear in normal artifact drafts.

Whenever an enemy non-hero stack is completely destroyed, raise a temporary friendly Skeleton stack in its vacated cell.

- Skeleton count equals `ceil(10% of the dead stack's starting total HP ÷ Skeleton HP)`, with a minimum of one.
- Example: a stack that began with 600 total HP raises `ceil(60 ÷ 6) = 10` Skeletons.
- Raised Skeletons enter at 0% ATB.
- They are controlled by the Necromancer player and may act normally.
- They have a normal `startCount`, so Bone Dragons can consume them with Absorb Skeleton.
- They disappear after battle and do not change the persistent strategic army.
- Summoned enemies, heroes, and stacks that have already produced a Grimoire raise do not generate Skeletons.
- If several stacks die in one action, resolve raises in stable stack-ID order.

The minimum-one rule ensures every genuine enemy stack leaves a visible corpse reward. The HP conversion keeps low-tier hordes and high-tier creatures on roughly the same scale.

This relic replaces the old automatic Necromancy level bonus. Raising undead becomes an explicit, visible faction mechanic rather than passive post-battle arithmetic.

---

## 4. Common Artifacts

### Marrow Crown

**Faction:** Necromancer  
**Effect:** Skeleton stacks raised by Gravewright's Grimoire enter at 50% ATB instead of 0%.

This turns corpse placement into immediate tactical pressure without increasing the amount raised.

### Plague Bell

**Requires:** Zombie  
**Effect:** An enemy carrying at least one Infecting Strike stack raises 100% more Skeletons when it dies.

Only the final count is doubled; the minimum remains one. This creates a clear Zombie-to-Skeleton pipeline.

### Wailing Lantern

**Requires:** Ghost  
**Effect:** Drain Morale removes 2 morale per hit instead of 1.

### Crimson Needle

**Requires:** Blood Acolyte  
**Effect:** Blood Frenzy grants +4 minimum and maximum damage per survived wound instead of +2.

### Chalice of Night

**Requires:** Vampire  
**Effect:** Vampire Life Drain heals 150% of damage dealt against afflicted targets instead of 100%.

An afflicted target has at least one of the following:

- an Infecting Strike modifier;
- a Curse Shot modifier;
- a speed penalty; or
- negative morale.

Healing remains capped at the Vampire stack's battle-start count unless another artifact redirects the excess.

### Withered Quiver

**Requires:** Lich  
**Effect:** Curse Shot also applies −5 defense per shot, stacking alongside its normal −5 attack.

### Reaper's Tack

**Requires:** Black Knight  
**Effect:** Soul Reaper claims two additional creatures per primary melee attack instead of one.

### Vertebral Key

**Requires:** Bone Dragon  
**Effect:** After using Absorb Skeleton, the Bone Dragon returns at 50% ATB instead of ending at 0%.

The ability still consumes a turn, but the Dragon recovers much more quickly.

---

## 5. Rare Artifacts

### Book of Grudges

**Faction:** Necromancer  
**Effect:** Necromancer units deal 15% more damage for each different affliction type on the target.

The four affliction types are Infection, Curse, Slow, and negative Morale. Multiple stacks of the same affliction still count as one type, for a maximum of 60% more damage.

This rewards a mixed roster rather than asking one Zombie or Lich to stack a single debuff forever.

### Blighted Soil

**Requires:** Zombie  
**Effect:** When an infected enemy stack dies, all of its accumulated Infecting Strike stacks spread to every living enemy adjacent to its cell.

- Friendly units are not infected.
- Each adjacent target receives the dead unit's full Infection penalty.
- The spread does not itself count as a hit and cannot trigger Slow on Hit.

### Blood Tithe

**Requires:** Blood Acolyte or Vampire  
**Effect:** Life Drain healing that would be discarded because its stack is already at maximum HP is converted into Skeletons.

- Every full 6 points of excess healing creates one Skeleton.
- New Skeletons are added to the largest living friendly Skeleton stack.
- If no friendly Skeleton stack lives, create one in the nearest empty cell to the life-draining unit at 0% ATB.
- Fractional excess carries between attacks for the rest of the battle.

This converts aggressive play into Bone Dragon healing material without copying the Demon's personal overflow-damage mechanic.

### Funeral Drum

**Faction:** Necromancer  
**Effect:** For every five friendly Skeletons killed or consumed, every surviving non-Skeleton Necromancer unit gains 10% ATB.

- Keep remainder progress between triggers: consuming seven Skeletons triggers once and leaves two toward the next trigger.
- Skeletons lost to damage, artifact effects, and Absorb Skeleton all count.
- Raised and strategic Skeletons count equally.

### Empty Throne

**Requires:** Ghost  
**Effect:** Enemies at −3 morale cannot retaliate and take 50% more damage from Necromancer units.

This creates a concrete payoff for fully draining morale rather than relying only on the chance of a skipped turn.

### Knight's Reliquary

**Requires:** Black Knight  
**Effect:** Every creature claimed specifically by Soul Reaper immediately rises as one Skeleton in the largest living friendly Skeleton stack.

- If no friendly Skeleton stack lives, the claimed Skeletons form a new stack in the nearest empty cell to the Black Knight.
- Ordinary damage kills and Death Blow damage do not count.
- Reaper's Tack therefore creates two Skeletons per successful strike.

### Shroud of Preservation

**Requires:** Skeleton  
**Effect:** When a friendly Skeleton stack dies, 50% of its count at the start of the killing action, rounded down, joins the largest other friendly Skeleton stack.

- If no other Skeleton stack lives, no Skeletons are preserved.
- A stack can trigger the Shroud only once.
- Skeletons preserved this way do not count as newly raised and do not trigger corpse artifacts.

This reduces board clutter over time and consolidates scattered Grimoire summons into useful Dragon fuel.

---

## 6. Epic Artifacts

### Dragon Ossuary

**Faction:** Necromancer  
**Upgrades:** Gravewright's Grimoire

Gravewright's Grimoire raises temporary friendly Bone Dragons instead of Skeletons.

- Bone Dragon count equals `ceil(10% of the dead stack's starting total HP ÷ Bone Dragon HP)`, with a minimum of one.
- They appear in the dead stack's vacated cell at 0% ATB.
- They are temporary and disappear after battle.
- Raised Bone Dragons cannot themselves generate another corpse raise.
- They retain the Bone Dragon's normal passive abilities and may use Absorb Skeleton if a friendly Skeleton stack is still available.
- Gravewright's Grimoire does not also raise Skeletons while Dragon Ossuary is active.

Example: a stack that began with 2,500 total HP raises one Bone Dragon; a stack that began with 5,100 total HP raises three.

This is intentionally transformative rather than balanced. It changes a bone-resource run into a battlefield takeover, but it also removes the steady supply of Skeletons used by Blood Tithe, Funeral Drum, and Absorb Skeleton.

### Crown of Ruin

**Faction:** Necromancer  
**Effect:** Every new Infection, Curse, and Morale Drain application is applied twice.

- Zombie hits apply two −5 attack/defense Infection stacks.
- Lich shots apply two Curse stacks.
- Ghost attacks resolve Drain Morale twice, respecting the −3 floor.
- Slow on Hit is not doubled because it is a temporary binary-style movement penalty.

With Wailing Lantern, a single Ghost hit can reduce a normal target from positive morale directly to the −3 floor.

### Red Moon Covenant

**Requires:** Blood Acolyte or Vampire  
**Effect:** Blood Frenzy triggers twice for every survived damage instance, and all Life Drain healing is doubled.

- Crimson Needle modifies each Blood Frenzy trigger, so the combination grants +8 minimum and maximum damage per wound.
- Doubled Life Drain still respects the normal healing cap.
- Blood Tithe converts any resulting excess into Skeletons.

### The Black Procession

**Faction:** Necromancer  
**Effect:** Skeleton stacks raised by Gravewright's Grimoire gain Infecting Strike and Drain Morale for the rest of the battle.

- Strategic Skeleton stacks do not gain these abilities.
- Skeletons created by Blood Tithe or Knight's Reliquary count as raised and inherit the abilities.
- Preserved Skeletons retain whatever abilities their original stack had.
- The effect does not apply while Dragon Ossuary replaces Skeleton raising.

This turns corpse rewards into a spreading debuff army and gives Skeleton-focused builds an epic endpoint distinct from Bone Dragons.

---

## 7. Intended Builds

### Bone Economy

**Core:** Gravewright's Grimoire, Plague Bell, Blood Tithe, Funeral Drum, Bone Dragon

Zombies infect enemies for larger corpse yields. Vampires and Blood Acolytes turn wasted healing into more Skeletons. Those Skeletons can fight, accelerate the army as they die, or be consumed to restore Bone Dragons.

### Plague Company

**Core:** Zombie, Lich, Withered Quiver, Blighted Soil, Book of Grudges, Crown of Ruin

Infection and Curse strip both offensive and defensive stats. Killing an infected unit spreads the rot, while Book of Grudges converts a diverse set of afflictions into direct damage.

### Court of Dread

**Core:** Ghost, Wailing Lantern, Empty Throne, Crown of Ruin, Black Knight

Ghosts rapidly force targets to −3 morale. Empty Throne removes retaliation and exposes those targets to heavy Black Knight attacks.

### Blood Engine

**Core:** Blood Acolyte, Vampire, Crimson Needle, Chalice of Night, Blood Tithe, Red Moon Covenant

Blood Acolytes become stronger every time they survive damage. Vampires feed efficiently on afflicted units, and excess healing becomes Skeleton supply rather than being wasted.

### Reaper Cavalry

**Core:** Black Knight, Reaper's Tack, Knight's Reliquary, Funeral Drum

Every Black Knight attack executes extra creatures, raises them as Skeletons, and eventually accelerates the whole undead army when those Skeletons are spent.

### Skeleton Procession

**Core:** Gravewright's Grimoire, Marrow Crown, Shroud of Preservation, The Black Procession

Raised Skeletons enter quickly, spread Infection and fear, then consolidate into surviving stacks when destroyed.

### Dragon Ascension

**Core:** Dragon Ossuary, Bone Dragon, Vertebral Key, Book of Grudges

Enemy stack deaths create new Bone Dragons rather than a Skeleton economy. The original Dragon can still consume strategic Skeletons, while the raised flight exploits targets already softened by the rest of the army.

---

## 8. Artifact Gating

Use the same reward-pool fields as the other faction redesigns:

- `faction?: 'necromancer'`
- `requiresUnit?: UnitName | UnitName[]`
- `upgrades?: ArtifactId`
- `starterForFaction?: 'necromancer'`

Rules:

1. Gravewright's Grimoire is granted by `newRun('necromancer')`, not drafted.
2. Dragon Ossuary can only appear for a Necromancer run already holding Gravewright's Grimoire.
3. Unit artifacts only enter the pool if at least one required unit is in the persistent army.
4. When an upgrade is active, the base artifact remains visible in the UI but its replaced hook does not also execute.
5. Artifact IDs are persisted data and should not be renamed after release.

---

## 9. Implementation Order

### Phase 1 — Corpse raising

1. Add explicit artifact faction/unit/upgrade metadata.
2. Grant Gravewright's Grimoire to new Necromancer runs.
3. Add a reusable temporary-stack creation helper.
4. Add a post-death artifact hook after the dead unit's cell is cleared but before battle-end evaluation.
5. Implement raised Skeleton placement, controller ownership, ATB, replay logging, and AI participation.
6. Prevent heroes, summons, and rebirth loops from generating corpse value.

### Phase 2 — Direct unit artifacts

1. Wailing Lantern
2. Crimson Needle
3. Chalice of Night
4. Withered Quiver
5. Reaper's Tack
6. Vertebral Key
7. Marrow Crown and Plague Bell

### Phase 3 — Cross-unit engines

1. Standardise affliction detection using modifier source IDs and status fields.
2. Implement Book of Grudges and Empty Throne.
3. Expose discarded Life Drain healing for Blood Tithe.
4. Track Skeleton losses and consumption for Funeral Drum.
5. Attribute Soul Reaper's bonus kills separately for Knight's Reliquary.
6. Implement infection transfer and Skeleton preservation.

### Phase 4 — Corpsecraft

1. Add a Necromancer hero-action panel in place of the spellbook.
2. Reuse deterministic Skeleton selection and consumption from Absorb Skeleton.
3. Implement Corpsecraft healing, temporary Bind, and army-wide ATB.
4. Route consumed Skeletons through Funeral Drum and other bone-loss hooks.
5. Add AI rules that preserve Skeletons when Bone Dragon or artifact value is higher.

### Phase 5 — Epic replacements

1. Crown of Ruin
2. Red Moon Covenant
3. The Black Procession
4. Dragon Ossuary last, once temporary stack creation and artifact replacement ordering are reliable.

---

## 10. Important Edge Rules

- Artifact effects apply to player-controlled Necromancer units only unless explicitly stated.
- Co-op ownership follows `controllerId`; raised units belong to the player whose artifact created them.
- A dead enemy can produce only one Grimoire/Ossuary raise even if death is processed more than once by animation or replay code.
- Corpse raises occur before checking whether the battle has ended, but a final raise does not prevent victory because it belongs to the winning side.
- Newly created stacks need deterministic IDs derived from the battle seed and a summon counter.
- Raised units never persist into the gauntlet army.
- Dragon Ossuary is a replacement hook, not an additional death hook.
- Any artifact modifying an ability must read effective ability levels rather than replacing the unit definition globally.
