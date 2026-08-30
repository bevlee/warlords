# Demon Faction Abilities & Faction Artifacts

**Goal:** Give every Demon unit a distinctive battlefield role, replace cosmetic abilities with real mechanics, and make Demon runs feel reckless, explosive, and capable of producing spectacular chain reactions.

The central Demon question should be: **how much of my own army am I willing to burn or sacrifice to take control of the battle?**

**Terminology:** A **turn** is the period in which a unit becomes active and chooses what to do. An **action** is the move, attack, wait, defend, or ability used during that turn. A multi-hit attack remains one action containing several hits.

---

## 1. Findings from the Current Engine

The current Demon roster has a good theme, but several of its defining abilities are descriptions rather than mechanics.

1. **Four important abilities are currently cosmetic.**
   - Demon `gate`
   - Pit Fiend `cast_haste`
   - Efreet `fire_immunity`
   - Devil `teleport`

2. **The existing Gating faction skill is asymmetric.**
   - It only checks fallen player-controlled Demon units.
   - It immediately restores a dead stack with one creature.
   - Enemy Demon armies cannot use it.
   - Because automatic faction-skill ranks are planned for removal, Gating should become an explicit unit or artifact mechanic rather than an automatic level reward.

3. **Burn is already mostly functional.**
   - Efreet attacks apply a fixed burn for two rounds.
   - Reapplying Burn refreshes it rather than stacking it.
   - Player Fire Magic increases its damage, but enemy bonuses do not have an equivalent path.
   - Burn damage does not currently check `fire_immunity`.
   - Some UI text assumes Burn always came from an Efreet.

4. **Life Drain is already functional.**
   - Blood Fiend heals for a percentage of damage dealt.
   - Healing is capped at the stack's original creature count.
   - This is a strong base for an overhealing/growth mechanic.

5. **Active abilities cannot currently create new stacks.**
   - The existing ability resolution path replaces or modifies stacks already in the battle.
   - Gate needs support for creating a stack, assigning its side and cell, and inserting it into the turn order.

6. **AI active-ability logic is currently healing-focused.**
   - Gate and Haste Ritual need simple AI rules or the enemy will never use them.

7. **A normal movement-range Teleport would add very little.**
   - Devil already has high speed and Flying.
   - Teleport needs to mean unrestricted battlefield movement, followed by a powerful arrival attack.

8. **The planned splash-damage primitive is extremely valuable here.**
   - Gog fireballs, Imp death bursts, Hell Hound secondary heads, and several artifacts can all share it.
   - The helper should support damage scaling, friendly fire, ability filtering, fire immunity, and a clear primary target.

9. **Death resolution needs a shared hook.**
   - Cinderburst, rebirth, Burn spreading, and death-triggered artifacts need a consistent order of operations.
   - Suggested order: resolve damage → mark death → trigger death burst → trigger death artifacts → attempt rebirth → clear or restore the cell → update turn order.

---

## 2. Faction Identity

### Demon: explosive momentum

Demon armies convert **fire, casualties, and spent turns** into tempo.

- Imps are living bombs.
- Gogs spread fire through clustered formations, including careless friendly formations.
- Hell Hounds punish enemies who surround them.
- Demons open gates and return from death.
- Blood Fiends turn wasted healing into damage for their next attack.
- Pit Fiends spend a turn accelerating the whole army.
- Efreets can fight safely inside the faction's own fires.
- Devils turn unrestricted movement into a devastating assassination strike.

The faction should be dangerous to both players. Its strongest effects are deliberately capable of hitting friendly units, and several builds become stronger when cheap units die at the right moment.

---

## 3. Proposed Roster

| Tier | Unit | Ability 1 | Ability 2 | Battlefield role |
|---|---|---|---|---|
| 1 | Imp | Kindling | Cinderburst | Cheap burner and living bomb |
| 2 | Gog | Hellfire Shot | Ignition | Friendly-fire area artillery |
| 3 | Hell Hound | Three-Headed Strike | No Retaliation | Mobile multi-target melee attacker |
| 4 | Demon | Gate | Infernal Rebirth | Summoner that must be killed twice |
| 4 | Blood Fiend | Life Drain V | Overfeed | Converts excess healing into burst damage |
| 5 | Pit Fiend | Haste Ritual | Torment Aura | Army accelerator and fire enabler |
| 6 | Efreet | Flying | Living Flame | Fire-immune incendiary attacker |
| 7 | Devil | Teleport | Doomstep | Global-reach assassin |

Every unit has two readable ideas. A few of the abilities contain multiple closely linked effects, but they present as one coherent rule rather than several unrelated bonuses.

---

## 4. Detailed Unit Abilities

### Imp

#### Kindling

Every successful Imp melee attack applies **Burn** to the primary target.

- Base Burn: 3 damage at the start of the target's next two turns.
- Reapplying Burn refreshes its duration unless an artifact allows it to stack.
- Fire-immune units cannot receive Burn.

This gives even a small surviving Imp stack a useful job: set up a target for Gogs, Pit Fiends, and fire artifacts.

#### Cinderburst

When the entire Imp stack dies, it explodes in a 3×3 area centred on its final cell.

- Deals fire damage equal to **25% of the Imp stack's starting total HP**.
- Hits every non-hero stack in the area, including friendly units.
- The damage is calculated from the stack's original battle size, not the overkill amount.
- Fire immunity prevents the damage.
- A reborn Imp stack can explode again only if the effect that rebirthed it explicitly allows another Cinderburst.

This is intentionally positional. The opponent may avoid killing an Imp surrounded by their own troops, while the Demon player may deliberately send it into a valuable cluster.

**Implementation tax:** shared death hook, fire-damage tag, 3×3 splash helper.

---

### Gog

#### Hellfire Shot

Gog's normal ranged attack becomes an area attack.

- Primary target: 100% normal ranged damage.
- Every other stack in the surrounding 3×3 area: 50% of the final primary damage.
- Secondary damage hits friendly units as well as enemies.
- Secondary victims do not trigger retaliation or on-hit melee effects.
- Fire immunity prevents only the splash damage; the primary projectile remains normal physical damage.

#### Ignition

Every surviving stack damaged by Hellfire Shot receives Burn, including friendly stacks caught in the blast.

- Primary and secondary targets use the same base Burn.
- Fire-immune units cannot be ignited.
- A zero-damage result does not apply Burn.

Gogs should feel powerful and slightly awkward. The faction can mitigate their risk with Efreets, sacrifices, careful spacing, or artifacts that reward fire spreading.

**Implementation tax:** shared splash helper; existing Burn application can be reused.

---

### Hell Hound

#### Three-Headed Strike

Every Hell Hound melee attack can bite up to three enemy stacks.

- The primary target takes full damage.
- Up to two other enemy stacks adjacent to the primary target take 50% of the primary hit's damage.
- Secondary bites never hit friendly units.
- If more than two secondary targets are eligible, select the two with the highest current total HP; break ties by stable stack ID.
- Secondary bites do not trigger retaliation or other primary-target on-hit effects.

The deterministic target rule keeps the ability automatic and AI-friendly while allowing the opponent to influence which stacks are exposed.

#### No Retaliation

The primary target cannot retaliate against the Hell Hound's attack.

This is reused unchanged from the existing engine.

**Implementation tax:** filtered splash helper. No new active-ability UI is needed.

---

### Demon

#### Gate

Once per battle, a Demon stack may spend its full turn opening a gate in an empty adjacent cell.

- The gate summons a friendly Imp stack containing **3 Imps per living Demon**.
- The player selects the adjacent destination cell.
- The summoned stack enters at 0% ATB and acts normally thereafter.
- The summon is temporary and is removed after battle; it is not added to the strategic army.
- If no adjacent cell is empty, Gate cannot be used.
- Summoned Imps have Kindling and Cinderburst, but cannot benefit from effects that duplicate a death trigger unless explicitly stated.

For AI use: Gate when an adjacent cell is available and the Demon stack is above 40% of its starting count. Prefer a cell adjacent to the largest cluster of enemy total HP, but avoid an occupied friendly Cinderburst area when possible.

#### Infernal Rebirth

The first time a Demon stack dies, it immediately reforms in its cell with **30% of its starting creature count**, rounded up.

- Rebirth can occur only once per stack per battle.
- Excess damage does not carry into the reborn stack.
- The reborn stack retains its current position in the initiative cycle but returns at 0% ATB.
- Rebirth happens after death bursts and death artifacts, so killing a Demon still counts as a death event.
- A gated or otherwise temporary stack cannot use Infernal Rebirth unless an effect explicitly grants it.

This replaces the old automatic Gating identity with a reliable, visible unit mechanic that works for both sides.

**Implementation tax:** summoned-stack support, destination selection, `usedAbilities`, `rebirthUsed`, and AI rules.

---

### Blood Fiend

#### Life Drain V

Blood Fiend heals for **50% of the damage dealt** by its primary melee attack.

- Reuse the existing Life Drain implementation.
- Secondary damage, artifact damage, and Burn do not count unless an artifact says otherwise.

#### Overfeed

When Life Drain would heal the Blood Fiend above its normal maximum HP, the excess healing is stored as **Blood Charge**.

- The next primary melee attack adds the full stored Blood Charge as bonus physical damage.
- Blood Charge is then consumed, whether or not the target survives.
- Bonus damage from Blood Charge does not itself trigger Life Drain. This prevents the same overflow from feeding itself indefinitely.
- Blood Charge persists between turns but is lost at the end of battle or when the Blood Fiend dies.
- There is no base cap on stored Blood Charge.

Example: a fully healed Blood Fiend deals 100 damage and would drain 50 HP. That 50 HP becomes 50 Blood Charge, adding 50 damage to its next primary melee attack.

The Blood Fiend now alternates between feeding and releasing a heavier strike. Damaging it before its turn allows some Life Drain to become ordinary healing instead, reducing the amount converted into offence.

**Implementation tax:** expose discarded overhealing from the existing heal helper and store one per-stack damage value.

---

### Pit Fiend

#### Haste Ritual

Once per battle, the Pit Fiend may spend its full turn permanently granting **+2 initiative** to every currently living friendly Demon-faction stack.

- The bonus lasts until the end of battle.
- It applies to the Pit Fiend as well.
- Stacks summoned after the ritual do not inherit the bonus.
- Multiple Pit Fiend stacks may each perform the ritual; bonuses stack.
- The ritual advances no ATB beyond the normal cost of spending the turn.

For AI use: perform the ritual on the first safe turn if at least three friendly stacks are alive. Otherwise attack normally.

The spent turn creates an interesting window: the Demon army becomes substantially faster, but the opponent gets a chance to punish the ritual.

#### Torment Aura

While at least one friendly Pit Fiend stack lives, burning enemies deal **20% less damage**.

- The aura does not stack with additional Pit Fiend stacks.
- It affects normal attacks, retaliation, and damaging abilities.
- It does not reduce fixed environmental damage or self-inflicted costs.
- The penalty is checked when damage is dealt, so killing the final Pit Fiend immediately removes it.

This makes Burn a control tool rather than only a damage-over-time effect.

**Implementation tax:** an active effect that reaches every friendly stack, plus an outgoing-damage aura check.

---

### Efreet

#### Flying

Reuse the existing Flying movement rule unchanged.

#### Living Flame

Efreet is made of infernal fire.

- Immune to Burn and all damage explicitly tagged as fire.
- Every successful primary melee attack applies Burn.
- Existing Burn is removed immediately if a unit gains Living Flame during battle.
- Physical primary damage from Gog and other attacks is not prevented merely because the attacker is fire-themed.

Living Flame makes Efreet the ideal unit to place inside Imp explosions and Gog fireballs. This creates a real formation advantage rather than a narrowly defensive immunity.

**Implementation tax:** introduce a fire-damage tag/check and route Burn application through one immunity-aware helper.

---

### Devil

#### Teleport

Devil may move to any empty, unblocked battlefield cell regardless of distance, intervening units, or terrain.

- Teleport replaces ordinary walking and Flying for the Devil.
- It may be used as a move-only action or as the movement portion of a melee attack.
- The destination still needs to be a legal cell from which the target can be attacked.
- Immobilisation prevents Teleport unless its source explicitly permits displacement.

#### Doomstep

Devil's primary melee attacks against **burning targets**:

- deal **double damage**; and
- cannot be retaliated against.

Doomstep does not require the Devil to teleport during the same action. Retaliation never triggers Doomstep, and the target must still be burning when damage is resolved.

This creates a simple two-unit combination: another Demon unit marks a target with Burn, and the Devil uses Teleport to reach it from anywhere. The opponent can protect important burning units by denying the Devil a legal landing cell.

For AI use: prefer the highest-value burning target that Doomstep can kill. If no burning unit can be attacked, maximise ordinary expected damage.

**Implementation tax:** global reachability for this unit and an existing-status check during primary melee damage.

---

## 5. Shared Rules and Edge Cases

### Fire damage

Fire should be a real damage tag rather than flavour text.

Fire sources in this design:

- Burn ticks
- Imp Cinderburst
- Gog secondary splash
- artifact-created explosions

The physical primary hit from an Efreet or Gog remains physical unless explicitly changed by an artifact.

### Burn

Default Burn rules:

- 3 damage (multiplied by the guantlet round number) at the start of the victim's turn 
- 2 remaining ticks when first applied
- reapplication refreshes the duration to 2
- does not stack by default
- cannot be applied to a fire-immune stack
- source attribution is generic, not hardcoded to Efreet

Burn should store its source side and source stack ID when possible. This allows future kill credit, artifacts, and consistent Fire Magic scaling.

### Temporary summons

Summoned stacks:

- are tagged `summoned`
- participate fully in grid occupancy, turns, targeting, death, and morale effects
- never alter the strategic army
- are removed when battle ends
- must carry a stable unique stack ID

### Death triggers

One damage event can cause several deaths. Resolve those deaths in a stable order based on stack ID, then process any newly caused deaths. Limit each death-trigger instance to once per death so explosions cannot recursively repeat without a new stack actually dying.

### Faction checks

Artifact and ritual effects should check explicit unit faction metadata or the unit catalog, rather than scanning display names. Summoned Imps must still count as Demon-faction units.

---

## 6. Proposed Demon hero mechanic: Infernal Rites

Demon heroes have **no mana and cannot cast spells**. Instead, they perform Infernal Rites. A Rite spends the hero's turn and may be used repeatedly, but every use consumes part of the Demon army or its existing Burn. The decision is not whether the hero can afford mana; it is how much battlefield material the player is willing to sacrifice.

Rites are not spells. Spell resistance, Sorcery, Silence, mana effects, and spell artifacts do not affect them.

The starting ideas are:

### Blood Offering

Choose a friendly Demon unit and sacrifice 10% of its current creatures, rounded up. Every other living friendly Demon unit advances 10% ATB.

- The sacrificed creatures die normally and may trigger Cinderburst, Ashen Covenant, or other death effects.
- The chosen stack may be destroyed by the offering.
- Summoned units may be sacrificed, but they grant only half the normal ATB.

This can accelerate an entire attack at the cost of a valuable stack, or deliberately detonate an Imp in the right position.

### Feed the Fire

Choose any burning unit. Consume one of its remaining Burn ticks immediately:

- deal that tick's damage now; and
- apply Burn to every non-fire-immune unit adjacent to it, including friendly units.

The chosen unit loses the consumed future tick. The player must decide whether to preserve Burn for Doomstep, Torment Aura, and Brand of Damnation or cash it in to spread the fire immediately.

### Demonic Bargain

Choose a friendly Demon unit. It immediately suffers sacrifice damage equal to 20% of its starting total HP. If it survives, its next primary attack before the end of its next turn:

- deals double damage; and
- cannot be retaliated against.

Sacrifice damage ignores defense and fire immunity. This prevents Efreet from accepting the bargain for free and makes the chosen unit's survival part of the risk.

These Rites intentionally use three different prices—creatures, future Burn, and HP—so the hero decision changes with the state of the battlefield.

---

## 7. Demon Artifacts

Artifacts should use the same gating fields as the Wizard redesign:

- `faction?: 'demon'`
- `requiresUnit?: UnitName`

Unit-specific artifacts should only enter the reward pool when the required unit is present in the player's strategic army. Faction-wide artifacts require the Demon hero/faction.

### Common

#### Powder Keg

**Requires:** Imp  
**Effect:** Cinderburst deals 40% of the Imp stack's starting total HP instead of 25%.

#### Sulfurous Pitch

**Requires:** Gog  
**Effect:** Hellfire Shot's secondary damage increases from 50% to 75%. Friendly fire remains enabled.

#### Brass Collar

**Requires:** Hell Hound  
**Effect:** Three-Headed Strike's secondary bites deal 75% damage instead of 50%.

#### Brimstone Key

**Requires:** Demon  
**Effect:** Gate summons 5 Imps per living Demon instead of 3.

#### Blood Chalice

**Requires:** Blood Fiend  
**Effect:** Overfeed converts excess healing into Blood Charge at 200% efficiency. Every 1 point of discarded healing stores 2 bonus damage instead of 1.

#### Cracked Hourglass

**Requires:** Pit Fiend  
**Effect:** Haste Ritual grants +3 initiative instead of +2.

### Rare

#### Furnace Heart

**Faction:** Demon  
**Effect:** When a burning stack dies, its Burn jumps to every non-fire-immune stack in its surrounding 3×3 area, including friendly units. The transferred Burn has two ticks and uses the dead stack's current Burn damage.

#### Blackened Wick

**Faction:** Demon  
**Effect:** Burn deals double damage on every tick.

#### Gatekeeper's Chain

**Requires:** Demon  
**Effect:** Gate may be used twice per battle. The second Gate summons half as many Imps, rounded up.

#### Feastmaster's Hook

**Requires:** Blood Fiend  
**Effect:** Life Drain heals for 100% instead of 50% when the primary target is burning.

#### Tormentor's Brand

**Requires:** Pit Fiend  
**Effect:** Torment Aura reduces burning enemies' damage by 35% instead of 20%, and those enemies also have −1 speed.

#### Ashen Covenant

**Faction:** Demon  
**Effect:** Whenever a friendly Demon-faction stack dies, every surviving friendly stack gains 10% ATB. Each individual stack can trigger the Covenant once per battle, even if it later returns or is reborn.

#### Devil's Contract

**Requires:** Devil  
**Effect:** When Doomstep kills its primary target, the Devil returns at 50% ATB instead of 0%.

### Epic

#### Mouth of Hell

**Faction:** Demon  
**Effect:** Every friendly non-summoned Demon-faction stack gains one use of Gate. It summons Imps whose total maximum HP equals 25% of the source stack's starting total HP, rounded up to a whole Imp. The Demon unit's own Gate remains separate.

This is the centrepiece Gate-swarm artifact. It is intentionally capable of filling the board and creating many Cinderburst threats.

#### Crown of Wildfire

**Faction:** Demon  
**Effect:** Burn applications stack their damage instead of replacing it. Every new application also refreshes the combined Burn to two ticks.

Example: a target with 3-damage Burn struck by two more Burn sources now takes 9 damage per tick.

#### Brand of Damnation

**Faction:** Demon  
**Effect:** Burning units take 200% damage from attacks and direct-damage abilities. Burn ticks and other damage-over-time effects are not doubled by this artifact.

Together with Blackened Wick, this creates two separate Burn payoffs: doubled damage from the fire itself and doubled direct damage against burning targets.

#### Seal of the Ninth Circle

**Faction:** Demon  
**Effect:** The first time each friendly non-summoned Demon-faction stack dies, it immediately returns with 30% of its starting creature count. A Demon unit that already has Infernal Rebirth instead returns with 60%.

Each stack still creates its normal death event before returning, enabling death-trigger builds.

#### Hell's Verdict

**Requires:** Devil  
**Effect:** Doomstep also deals 50% of its final primary damage as fire damage to every other stack in the target's surrounding 3×3 area, including friendly units.

---

## 8. Intended Builds

### Living Bombs

**Core:** Imp, Powder Keg, Ashen Covenant, Seal of the Ninth Circle

Send Imps into enemy formations, let their deaths damage the formation and accelerate the survivors, then return them for another dangerous life. Efreets can occupy the blast area safely.

### Wildfire Artillery

**Core:** Gog, Efreet, Sulfurous Pitch, Blackened Wick, Furnace Heart, Crown of Wildfire

Gogs ignite packed formations, Burn deals double damage, and dead burning stacks pass the fire onward. Crown of Wildfire lets repeated applications build a lethal damage-over-time stack. Efreets give the player safe anchor points inside otherwise dangerous blast zones.

### Mark and Execute

**Core:** Gog or Efreet, Brand of Damnation, Devil, Devil's Contract

Burn the most important enemy, doubling all direct damage it receives, then let the Devil teleport to it and apply Doomstep. Doomstep's own multiplier and Brand of Damnation combine for an exceptionally strong execution attack.

### Gate Swarm

**Core:** Demon, Brimstone Key, Gatekeeper's Chain, Mouth of Hell

Trade early turns for a battlefield full of temporary Imps. The summons screen enemy movement, spread Burn, and threaten chained death bursts.

### Blood Banquet

**Core:** Blood Fiend, Blood Chalice, Feastmaster's Hook, Gog or Efreet

Use another unit to ignite a durable enemy. Feastmaster's Hook increases Life Drain against it, while Blood Chalice doubles the resulting excess-healing conversion. The Blood Fiend banks a large Blood Charge and releases it into its next victim.

### Haste Cult

**Core:** Pit Fiend, Cracked Hourglass, Tormentor's Brand, Devil

Spend the opening on Haste Ritual, suppress enemy damage with Burn and Torment, then use the permanent initiative advantage to create repeated Doomstep threats.

### Hellhound Pack

**Core:** Hell Hound, Brass Collar, Haste Ritual

Fast Hell Hounds dive into dense formations and damage three stacks without retaliation. This is the simplest Demon build and needs little new UI or targeting logic.

---

## 9. Suggested Build Order

### Phase 0 — Shared combat primitives

1. Add a generic damage-type or `fire` flag.
2. Route all Burn applications and ticks through fire-immunity checks.
3. Build the reusable 3×3 splash helper with friendly-fire and target-filter options.
4. Add a consistent death-resolution hook and stable death-trigger ordering.
5. Add faction and `requiresUnit` artifact gating.
6. Replace name-based Demon membership checks with catalog/faction metadata where practical.

These primitives also support the Wizard and Knight redesigns.

### Phase 1 — Low-tax passive abilities

1. Kindling
2. Hellfire Shot and Ignition
3. Three-Headed Strike
4. Overfeed
5. Living Flame
6. Torment Aura

This phase produces a playable Demon identity before summon or global-movement work begins.

### Phase 2 — Death and summon mechanics

1. Track per-stack death triggers and `rebirthUsed`.
2. Implement Infernal Rebirth.
3. Add temporary summoned stacks and stable IDs.
4. Implement Gate and its destination selection.
5. Extend AI to use Gate.

### Phase 3 — Active tempo and Devil movement

1. Implement Haste Ritual and its once-per-battle state.
2. Extend AI to value permanent army initiative.
3. Implement unrestricted Devil reachability.
4. Implement Doomstep as a Burn-status payoff.

### Phase 4 — Infernal Rites

1. Add a Demon hero-action panel in place of the spellbook.
2. Implement sacrifice damage and creature-count costs.
3. Allow a Rite to consume and spread an existing Burn.
4. Add AI scoring for army-wide ATB, Burn cash-out, and Demonic Bargain survival.
5. Confirm that Rites never use spell hooks or mana.

### Phase 5 — Artifacts

1. Add common numerical/unit artifacts first.
2. Add death-transfer and ATB artifacts.
3. Add Gatekeeper's Chain and Mouth of Hell after summons are stable.
4. Add Blackened Wick and Brand of Damnation with the other direct modifiers.
5. Add Crown of Wildfire after Burn source attribution is reliable.
6. Add Seal of the Ninth Circle last because it touches every death path.

### Phase 6 — Presentation and verification

1. Replace hardcoded Efreet Burn copy with generic source-aware combat text.
2. Preview Hellfire, Cinderburst, and Doomstep affected cells before confirmation.
3. Give summoned stacks and used active abilities clear visual markers.
4. Add AI and regression tests for full boards, simultaneous deaths, friendly fire, rebirth, and chained Burn deaths.

---

## 10. Implementation Tax by Ability

| Ability | Relative tax | Main dependency |
|---|---:|---|
| Kindling | Low | Generic Burn helper |
| Cinderburst | Medium | Death hook and splash helper |
| Hellfire Shot | Low–Medium | Splash helper |
| Ignition | Low | Burn helper |
| Three-Headed Strike | Low–Medium | Filtered splash helper |
| No Retaliation | Existing | Already implemented |
| Gate | High | Stack creation, placement, turn insertion, AI |
| Infernal Rebirth | Medium | Shared death resolution and state flag |
| Life Drain V | Existing | Already implemented |
| Overfeed | Low | Expose discarded healing and store Blood Charge |
| Haste Ritual | Medium | Active state and army-wide stat modifier |
| Torment Aura | Low–Medium | Final-damage modifier check |
| Flying | Existing | Already implemented |
| Living Flame | Low | Fire tag and immunity-aware Burn |
| Teleport | Medium | Unit-specific global reachability |
| Doomstep | Low | Burn-status check and damage multiplier |

The best early implementation slice is **Gog + Hell Hound + Blood Fiend + Efreet**. It establishes friendly-fire fire play, multi-target melee, overflow damage, and fire immunity using reusable combat helpers. Gate should follow once stack creation and death ordering have been made reliable.
