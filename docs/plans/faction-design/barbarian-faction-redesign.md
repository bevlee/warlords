# Barbarian Faction Abilities, Battle Cries & Artifacts

**Goal:** Rework Barbarian into the fastest and most aggressive faction, with two standout approaches:

1. **The First Raid:** cross the battlefield immediately and destroy key stacks before the opponent establishes a formation.
2. **The Firing Line:** use Orcs to mark targets and Cyclopes to turn those marks into devastating ranged volleys.

Barbarian heroes have **no mana and no spells**. Their hero turns instead offer limited Battle Cries that strengthen their army without behaving like magic.

**Terminology:** A **turn** is the period in which a unit or hero becomes active and chooses what to do. An **action** is the move, attack, wait, defend, Battle Cry, or ability used during that turn. A multi-hit attack remains one action containing several hits.

---

## 1. Current Engine Findings

1. Most of the current Barbarian roster has no functioning abilities.
   - Goblin, Wolf Rider, Orc, Ogre, and Cyclops have none.
   - Thunderbird only has Flying.
   - Ram Rider and Behemoth only use Defense Reduction.

2. Every hero currently receives mana during battle initialization.
   - The shared cast action checks hero status, mana cost, target side, and spell definition.
   - It does not currently reject spells based on hero class or a personal spellbook.

3. Barbarian currently receives automatic Offense, Armorer, and Leadership faction-skill ranks from hero levels.
   - These are generic stat increases rather than faction-defining decisions.
   - They should be removed with the other automatic level bonuses and replaced by the starter artifact, artifacts, unit abilities, and Battle Cries.

4. The engine already tracks movement origin for move-and-attack actions.
   - This can support Pounce, Ram, and Thunder Dive without inventing a second movement-history system.

5. The planned splash-damage helper remains useful.
   - Cyclops boulders and Thunderbird dives can reuse it with enemy-only filtering.

6. The artifact framework needs starter, faction, unit, and upgrade gating.
   - Barbarian's opening effect should be an explicit automatically granted artifact, not an invisible faction passive.

7. A first-turn effect needs stable per-stack state.
   - Round number alone is insufficient because units act at different initiative values and may receive extra turns.
   - Track whether each starting stack has taken its first turn.

---

## 2. Faction Identity

### Barbarian: win before the enemy is ready

Barbarians are strongest while acting rather than reacting.

- Starting units receive an explosive opening turn.
- Fast melee units turn kills into additional tempo.
- Orcs identify priority targets for the whole firing line.
- Cyclopes punish enemies who cluster around marked units.
- Weapon artifacts can turn the hero's ordinary attack into a major execution tool.
- Battle Cries replace mana with a small number of decisive army buffs.
- Several artifacts extend the opening window, but defensive or stalled fights gradually favour other factions.

The faction is not necessarily fragile, but it gains less from waiting, defending, healing, or building a long-term resource engine.

---

## 3. Default Faction Artifact

### Banner of the First Raid

**Rarity:** Starter  
**Faction:** Barbarian  
**Acquisition:** Automatically owned at the start of every Barbarian gauntlet run. It does not appear in normal artifact drafts.

During each starting unit stack's **first turn**:

- it has **+2 speed**; and
- all damage it deals is increased by **30%**.

Exact rules:

- The buff begins when that stack first becomes the active unit and ends when its first action resolves.
- Moving, waiting, defending, or using a non-damaging ability still consumes the empowered turn.
- A morale extra turn is a second turn and is not empowered.
- Retaliation before the unit's first turn is not empowered.
- Damage from all strikes belonging to the empowered action is increased, including Double Strike, cleave, boulder splash, and Thunder Dive.
- Damage-over-time effects applied by that action are not increased on later turns.
- The hero, summoned units, and stacks created after battle initialization do not receive the buff.
- Deployment only repositions whole stacks, so every strategic army stack receives exactly one opening empowerment.

This artifact makes the faction promise visible: every unit gets one exceptional opportunity, and passive opening actions waste it.

---

## 4. Proposed Roster

| Tier | Unit | Ability 1 | Ability 2 | Battlefield role |
|---|---|---|---|---|
| 1 | Goblin | Mob Rule | Blood Rush | Swarming cleanup attacker |
| 2 | Wolf Rider | Double Strike | Pounce | Fast isolated-target killer |
| 3 | Orc | Marking Shot | Quickdraw | Target painter and opening archer |
| 4 | Ogre | Bully | Follow Through | Chaff-clearing melee bruiser |
| 4 | Ram Rider | Defense Reduction IV | Battering Ram | Charging formation breaker |
| 5 | Cyclops | Boulder Burst | Marked Quarry | Area artillery and marked-target payoff |
| 6 | Thunderbird | Flying | Thunder Dive | Long-range opening bomber |
| 7 | Behemoth | Defense Reduction VIII | Rampage | Chain-kill capstone |

---

## 5. Detailed Unit Abilities

### Goblin

#### Mob Rule

Goblin deals **15% more melee damage for each other friendly stack adjacent to its target**, up to 45% more.

- Count eligible friendly stacks when damage is resolved.
- The attacking Goblin does not count itself.
- Hero units do not count.
- Multiple Goblin stacks can support one another.

This rewards a coordinated rush without asking the Goblin itself to survive alone.

#### Blood Rush

When Goblin's primary melee attack destroys its target stack, the Goblin returns at **50% ATB**.

- Secondary or artifact damage does not trigger Blood Rush.
- It can trigger repeatedly if the Goblin continues finishing stacks.
- A kill during retaliation does not trigger it.

**Implementation tax:** low; adjacency count and a kill-triggered ATB value.

---

### Wolf Rider

#### Double Strike

After its primary melee attack and any retaliation resolve, Wolf Rider attacks the surviving primary target again for **half damage**.

- The second strike does not provoke another retaliation.
- It does not occur if either stack is dead.
- On-hit effects apply to both strikes unless explicitly limited to a primary strike.

#### Pounce

If Wolf Rider moved at least three cells before its melee attack, the target cannot retaliate against the first strike.

- Distance is measured from the action's starting cell to the attack landing cell.
- Forced movement does not count.
- Pounce applies only to the target of the move-and-attack action.

**Implementation tax:** low; Double Strike already resembles existing multi-hit logic, and movement origin is already tracked.

---

### Orc

#### Marking Shot

Every surviving target hit by an Orc ranged attack becomes **Marked** for the rest of the battle.

- Ranged attacks from **every friendly shooter** deal **30% more damage** to Marked targets.
- Mark does not stack.
- A target may remain Marked until it dies; there is no one-target limit.
- Melee attacks do not receive the Mark bonus.

This makes Orcs the setup unit for the Barbarian firing line.

#### Quickdraw

After Orc makes a ranged attack during its first turn, it returns at **50% ATB**.

- Quickdraw is usable once per stack per battle.
- Moving, waiting, defending, or making a melee attack consumes the opening turn without triggering Quickdraw.
- The second turn does not retain Banner of the First Raid.

**Implementation tax:** low–medium; Mark status plus a first-turn ranged trigger.

---

### Ogre

#### Bully

Ogre deals **50% more melee damage** to units whose tier is lower than the Ogre's.

Equal- and higher-tier targets receive normal damage.

#### Follow Through

When Ogre's primary melee attack destroys its target, up to 50% of the attack's unused overkill damage is dealt to the adjacent enemy stack with the lowest current total HP.

- The secondary enemy must be adjacent to the Ogre after the attack.
- Only one secondary stack is hit.
- Ties are resolved by stable stack ID.
- Follow Through cannot trigger itself and does not provoke retaliation.

Ogre specialises in turning a powerful opening hit against chaff into useful damage instead of wasting it.

**Implementation tax:** medium; expose overkill from primary damage and choose one adjacent enemy.

---

### Ram Rider

#### Defense Reduction IV

Reuse the existing ability: Ram Rider treats the target as having 20% less defense while calculating its attack.

#### Battering Ram

If Ram Rider moved at least three cells before its melee attack, it deals **50% more damage** and attempts to push a surviving target one cell directly away.

- Push only occurs if the destination is empty, legal, and unblocked.
- If the target cannot be pushed, it takes an additional 25% collision damage instead.
- Collision damage does not trigger retaliation or on-hit effects.
- The Ram Rider occupies the original target cell after a successful push.

This creates formation disruption rather than a second Cavalier-style jousting bonus.

**Implementation tax:** medium; movement check, displacement validation, and grid update.

---

### Cyclops

#### Boulder Burst

Cyclops ranged attacks become enemy-only area attacks.

- Primary target takes 100% normal ranged damage.
- Every other enemy in the surrounding 3×3 area takes 50% of the final primary damage.
- Friendly units are never hit.
- A surviving primary target becomes Marked after damage resolves; secondary targets are not Marked.
- Secondary damage does not trigger retaliation.

#### Marked Quarry

Against a Marked primary target:

- the primary Mark bonus increases from 30% more damage to **60% more damage** for Cyclops; and
- Boulder Burst secondary damage increases from 50% to **75%**.

Cyclops remains functional alone, but Orc setup turns it into the centrepiece of an archer build.

**Implementation tax:** low–medium after the shared splash helper and Mark status exist.

---

### Thunderbird

#### Flying

Reuse the existing Flying movement rule.

#### Thunder Dive

If Thunderbird moved at least four cells before its melee attack, lightning erupts around the primary target.

- Primary target takes the normal melee attack.
- Every other enemy in the target's surrounding 3×3 area takes 50% of the final primary damage.
- Friendly units are not damaged.
- The primary target cannot retaliate.
- Secondary damage cannot trigger another Thunder Dive.

The long required movement makes landing-cell access part of the counterplay.

**Implementation tax:** low–medium after movement tracking and the splash helper.

---

### Behemoth

#### Defense Reduction VIII

Reuse the existing ability: Behemoth treats the target as having 40% less defense.

#### Rampage

Whenever Behemoth's primary melee attack destroys its target stack, Behemoth immediately returns at **100% ATB**.

- Rampage may trigger repeatedly in the same sequence.
- The chain ends as soon as an attack fails to destroy its primary target.
- Secondary and artifact damage do not trigger it.
- Retaliation kills do not trigger it.

Behemoth should feel like an army-ending capstone when several damaged enemy stacks are left exposed.

**Implementation tax:** low; it is an uncapped kill-to-ATB rule.

---

## 6. Barbarian Hero: Battle Cries Instead of Mana

### Core rules

- Barbarian heroes have maximum and starting mana of **0**.
- They cannot cast spells, even if an artifact or saved run contains a spell identifier.
- The spellbook button becomes a **War Horn** button on Barbarian hero turns.
- Battle Cries cost no resource, but each cry has one use per battle.
- Issuing a cry spends the hero's turn unless an artifact says otherwise.
- Cries buff friendly units; they do not directly damage or debuff enemies.
- Cries follow controller ownership in co-op.
- A normal Barbarian hero begins with all three basic cries below.

### Charge!

All living friendly melee units gain, for their next turn:

- +2 speed; and
- 25% more melee damage.

The effect is consumed even if the unit waits or defends. It stacks with Banner of the First Raid.

### Loose!

Every living friendly shooter deals **40% more damage with its next ranged attack**, and that attack consumes no ammunition.

- The buff remains until that stack shoots or dies.
- A melee attack, move, wait, or defend does not consume it.
- Multi-shot effects receive the damage bonus, but the whole action saves only its normal ammunition cost once.

### Blood for Blood!

Until the Barbarian hero's next turn, all friendly units:

- deal 50% more damage; and
- take 50% more damage.

This is the dangerous finishing cry. Its incoming-damage penalty is still active during enemy actions and retaliation.

### AI priorities

1. Use Charge! when at least three melee stacks can attack on their next turn.
2. Use Loose! when at least two shooters have ammunition and a legal target.
3. Use Blood for Blood! when estimated friendly attacks before the hero's next turn can destroy at least two enemy stacks or end the battle.
4. Otherwise use the normal hero attack.

---

## 7. Barbarian Artifacts

Use the same metadata as the other faction redesigns:

- `faction?: 'barbarian'`
- `requiresUnit?: UnitName | UnitName[]`
- `starterForFaction?: 'barbarian'`

### Common

#### Redcap Knives

**Requires:** Goblin  
**Effect:** Mob Rule grants 20% more damage per adjacent friendly stack instead of 15%, up to 60% more damage.

#### Split-Fang Bridle

**Requires:** Wolf Rider  
**Effect:** Double Strike's second attack deals 75% damage instead of 50%.

#### Red-Fletched Arrows

**Requires:** Orc  
**Effect:** Marked targets take 45% more ranged damage from every friendly shooter instead of 30% more. Marked Quarry still adds another 30 percentage points for Cyclops.

#### Headsman's Cleaver

**Requires:** Ogre  
**Effect:** Follow Through transfers 100% of unused overkill damage instead of 50%.

#### Ironbound Horns

**Requires:** Ram Rider  
**Effect:** Battering Ram requires only two cells of movement and collision damage increases from 25% to 50%.

#### Shaped Stones

**Requires:** Cyclops  
**Effect:** Boulder Burst deals 75% secondary damage normally and 100% against a Marked primary target.

#### Storm Spurs

**Requires:** Thunderbird  
**Effect:** Thunder Dive requires only three cells of movement and its secondary lightning deals 75% damage.

#### Broken Maw Chain

**Requires:** Behemoth  
**Effect:** Every successful Rampage kill grants 25% more damage to Behemoth's next attack. The bonus stacks until Rampage fails to kill.

### Rare

#### Map of the First Raid

**Faction:** Barbarian  
**Effect:** Banner of the First Raid grants +4 speed instead of +2 during each unit's first turn.

#### Banner of No Return

**Faction:** Barbarian  
**Effect:** Banner of the First Raid grants 50% more damage instead of 30% more.

#### Butcher's Pennant

**Faction:** Barbarian  
**Effect:** If a unit destroys an enemy during its empowered first turn, Banner of the First Raid also empowers that unit's second turn.

- Each stack can extend the Banner only once.
- The second turn receives the currently modified Banner values.

#### Black-Fletched Quiver

**Requires:** Orc or Cyclops  
**Effect:** All friendly shooters begin with three additional shots and suffer no ranged distance penalty.

#### Spotter's Monocle

**Requires:** Orc  
**Effect:** Marking Shot also marks every enemy adjacent to the primary target.

Only the primary target takes attack damage; this simply prepares a Cyclops area.

#### Horde Drum

**Faction:** Barbarian  
**Effect:** Whenever an enemy stack dies, every friendly unit waiting for its next turn gains 10% ATB.

Each enemy stack can trigger Horde Drum once, including if it later returns through a rebirth mechanic.

#### Bronze War Horn

**Faction:** Barbarian  
**Effect:** Charge! grants +4 speed and 40% more melee damage instead of +2 speed and 25% more damage.

#### Horn of the Hunt

**Faction:** Barbarian  
**Effect:** Loose! grants 75% more ranged damage instead of 40% more, and empowered shots apply Mark before damage is calculated.

This allows a pure Cyclops army to begin the firing-line engine without an Orc.

#### Skull Trumpet

**Faction:** Barbarian  
**Effect:** Blood for Blood! increases outgoing damage by 75%, while friendly units still take 50% more damage.

#### Bloodletter Axe

**Faction:** Barbarian  
**Effect:** The Barbarian hero's normal attack deals **300% damage**.

- This affects only the hero's direct attack action, not Battle Cries or artifact damage.
- The multiplier replaces the hero's normal 100% damage rather than adding a 300% bonus.
- Bloodletter Axe multiplies with other hero-attack artifacts.

### Epic

#### Red Sunrise

**Faction:** Barbarian  
**Effect:** Banner of the First Raid always empowers the first two turns of every starting unit.

Butcher's Pennant can extend the Banner to a third turn if the second empowered turn kills an enemy.

#### Endless Hunt

**Faction:** Barbarian  
**Effect:** Whenever any friendly unit destroys an enemy with its primary attack, it returns at 50% ATB.

- If the unit's own ability returns it at a higher value, use the higher value rather than adding them.
- Behemoth Rampage therefore remains 100% ATB.
- Secondary, splash, and damage-over-time kills do not trigger it.

#### Rain of Iron

**Requires:** Orc or Cyclops  
**Effect:** Every friendly ranged attack deals 50% of its final primary damage to all other enemies in the target's surrounding 3×3 area.

- Friendly units are not hit.
- Cyclops uses the higher Boulder Burst percentage rather than adding another splash instance.
- Against a Marked primary target, Rain of Iron secondary damage increases to 75%.

#### Voice of the Warchief

**Faction:** Barbarian  
**Effect:** Every Battle Cry has two uses per battle, and issuing a cry returns the hero at 50% ATB instead of 0%.

- The same cry cannot be issued twice in a row.
- This does not grant an immediate extra action; the hero must fill the remaining half of its ATB bar before acting again.
- This creates a cry-focused hero without introducing mana or a new rechargeable resource.

#### Worldsplitter

**Faction:** Barbarian  
**Effect:** The Barbarian hero's normal attack deals **500% damage**. This multiplier stacks multiplicatively with Bloodletter Axe, producing a 15× hero attack when both are held. If the target survives, it also becomes **Marked for Death** for the rest of the battle.

Marked for Death:

- causes the target to take **20% more damage from all sources**;
- affects melee, ranged, hero, ability, splash, retaliation, and damage-over-time damage;
- does not amplify the Worldsplitter hit that first applies it;
- does not stack with itself; and
- is separate from the Orc's ranged Mark, so a target may carry both effects.

If a target has both marks, ranged damage benefits from both multipliers. For example, Ranged Mark's 30% increase and Marked for Death's 20% increase combine multiplicatively for 1.3 × 1.2 = 1.56, or 56% more ranged damage.

---

## 8. Intended Builds

### First-Turn Wipe

**Core:** Banner of the First Raid, Map of the First Raid, Banner of No Return, Butcher's Pennant, Red Sunrise

The army crosses the battlefield with extreme reach and damage. Every opening kill preserves the window, rewarding careful target ordering rather than defensive setup.

### Endless Melee Hunt

**Core:** Goblin, Wolf Rider, Thunderbird, Behemoth, Horde Drum, Endless Hunt

Fast melee stacks soften or finish enemies in sequence. Each death advances the rest of the army, and individual killers return quickly to continue the attack.

### Marked Firing Line

**Core:** Orc, Cyclops, Red-Fletched Arrows, Shaped Stones, Spotter's Monocle, Rain of Iron

Orcs mark a clustered formation and Cyclopes convert those marks into amplified area damage. Quickdraw allows Orcs to mark a second target early.

### Arrow Storm

**Core:** Orc, Cyclops, Black-Fletched Quiver, Horn of the Hunt, Rain of Iron

Loose! opens the battle with ammunition-free empowered shots. Horn of the Hunt supplies Marks even without an Orc, while Rain of Iron turns every shooter into area artillery.

### Break the Line

**Core:** Ram Rider, Thunderbird, Ironbound Horns, Storm Spurs, Charge!, Bronze War Horn

The cry supplies enough movement to trigger charge abilities. Rams displace formation anchors and Thunderbirds detonate the exposed cluster.

### Chaff Butchers

**Core:** Goblin, Ogre, Redcap Knives, Headsman's Cleaver, Horde Drum

Goblins surround damaged stacks while Ogres convert excessive finishing damage into another victim. Enemy deaths accelerate the next wave.

### Warchief

**Core:** Bronze War Horn, Horn of the Hunt, Skull Trumpet, Voice of the Warchief

The hero spends the battle directing alternating melee and ranged power turns. This is the Barbarian alternative to a caster build: fewer choices than a spellbook, but each choice affects much more of the army.

### Warlord's Execution

**Core:** Bloodletter Axe, Worldsplitter, fast melee units, Endless Hunt

With both weapons, the hero opens a priority target with a 15× attack and leaves any survivor Marked for Death. The rest of the army then exploits its 20% universal vulnerability, while kills feed the faction's ATB engine.

---

## 9. Implementation Order

### Phase 0 — Hero and opening-state foundations

1. Add artifact faction, unit, and starter metadata.
2. Grant Banner of the First Raid in `newRun('barbarian')`.
3. Track first-turn use and Banner extensions directly on each starting battle stack.
4. Apply opening speed through the same effective-speed read path used by movement previews and AI.
5. Apply opening damage through the shared final-damage path, including secondary strikes from the empowered action.
6. Set Barbarian maximum/starting mana to zero and reject Barbarian spell actions in the engine.
7. Hide the spellbook and mana display for Barbarian heroes.

### Phase 1 — Low-tax aggression abilities

1. Mob Rule and Blood Rush
2. Double Strike and Pounce
3. Marking Shot and Quickdraw
4. Bully
5. Defense Reduction reuse
6. Rampage

### Phase 2 — Shared attack shapes

1. Expose unused overkill damage for Follow Through.
2. Implement Battering Ram displacement.
3. Reuse the shared splash helper for Boulder Burst and Thunder Dive.
4. Add AI scoring for push destinations, Marked targets, and kill-to-ATB attacks.

### Phase 3 — Battle Cries

1. Add a `cry` hero action separate from `cast`.
2. Add per-controller cry charges to serialized battle state.
3. Implement Charge!, Loose!, and Blood for Blood!.
4. Replace the Barbarian spellbook UI with the War Horn panel.
5. Add AI cry timing.

### Phase 4 — Artifacts

1. Add common unit-specific numerical artifacts.
2. Add Banner modifiers and ensure replacement values compose deterministically.
3. Add ranged and Mark artifacts.
4. Add hero-attack multipliers and Marked for Death.
5. Add Battle Cry artifacts.
6. Add Red Sunrise, Endless Hunt, Rain of Iron, Voice of the Warchief, and Worldsplitter last.

---

## 10. Important Edge Rules

- The first turn belongs to each starting battle stack, not the current round.
- Deployment cannot split stacks or duplicate Banner charges and once-per-battle abilities.
- Deployment actions do not consume the first turn.
- A unit killed before acting never transfers its unused Banner effect.
- If several ATB-setting effects trigger, use the highest resulting ATB value unless an artifact explicitly says to add.
- Percentage damage bonuses multiply once each; UI previews must display the complete product.
- Ranged Mark is a status, not a raw defense penalty, and increases ranged damage from every friendly shooter rather than only Orcs and Cyclopes.
- Marked for Death is a separate status that increases all incoming damage by 20%; it can coexist with Ranged Mark.
- Marks are stored on the target with the applying controller and allied team. Their benefits are team-wide: the original source unit does not need to remain alive, and any allied combatant—including a co-op partner's unit—may use the mark when it meets the stated attack condition.
- Bloodletter Axe and Worldsplitter multiply with one another, producing a 15× hero attack before other modifiers.
- Barbarian Battle Cries are non-magical hero actions: Sorcery, Magic Resistance, Silence, mana regeneration, and spell artifacts do not affect them.
- Co-op Barbarian heroes maintain separate cry charges and only buff units under their controller.
- Artifact and ability splash effects resolve once; overlapping definitions choose the highest percentage rather than creating duplicate hits.
