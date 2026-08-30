# Knight Abilities and Artifacts

The Knight faction rewards patient formations, risky friendly-fire attacks, retaliation, and explosive cavalry charges. Automatic level-based stat bonuses will be removed from runs; artifacts and unit drafts will provide most run-to-run growth.

**Terminology:** A **turn** is the period in which a unit becomes active and chooses what to do. An **action** is the move, attack, wait, defend, or ability used during that turn. A multi-hit attack remains one action containing several hits.

## Unit abilities

| Unit | Abilities |
|---|---|
| **Peasant** | **Militia:** Gain +1 attack and defense per 10 living Peasants, with no cap. **Spearwall:** Enemy Jousting bonuses do not apply against Peasants. |
| **Archer** | **Area Shot:** Every shot deals 50% damage to every non-hero stack in the targeted 3×3 area, including the selected target and friendly units. It consumes one shot and initially requires an occupied target cell. |
| **Griffin** | **Flying:** Move over obstacles and units. **Unlimited Retaliation:** Retaliate against every eligible melee attack. |
| **Standard Bearer** | **Bravery II:** Gain +2 morale. |
| **Swordsman** | **Large Shield:** Take 50% less damage from ranged creature attacks. **Focus:** Spend the full turn to permanently gain +1 initiative and +1 minimum/maximum damage. Focus stacks without a cap. |
| **Monk** | **Cleanse:** Spend the full turn to choose a friendly unit and remove all removable negative combat effects from it. Cleanse has no cooldown or use limit. **Claim Blessing:** Whenever a Monk hit deals damage, steal one random non-Innate combat buff from the target and grant it to the Monk. |
| **Cavalier** | **Gallop:** A movement-only action of at least three cells costs half a turn. **Ride-By Attack:** A special charging attack that deals 50% more damage, prevents retaliation, and returns Cavalier to the cell where it started the action. Ride-By Attack has a cooldown of 2 and can therefore be used every third Cavalier turn. |
| **Champion** | **Grand Joust:** Deal 20% more melee damage per cell moved; charges of at least three cells prevent retaliation. **Overrun:** Every melee attack deals 50% of the primary hit's damage to an enemy directly behind the target. A killing charge of at least three cells also advances the Champion into the target's cell and returns it at 50% ATB. Penetration does not chain. |

### Monk effect rules

Cleanse removes every removable negative effect currently applied to the chosen friendly unit, including Burn, Bind, Blind, Pinning, Infection, Curse, reduced Morale, and temporary combat penalties.

- Monk may target itself.
- Cleanse does not restore lost creatures or HP.
- It does not remove weaknesses built into the unit definition or permanent trade-offs printed on an artifact.
- Using Cleanse spends the Monk's turn, but it may be used again on every later turn.

Claim Blessing transfers one randomly selected, non-Innate positive combat effect whenever a Monk hit deals positive damage.

- The target loses the chosen buff and Monk gains it with the same strength and remaining duration.
- A stackable effect transfers in full unless that effect explicitly says only one stack may be stolen.
- Buffs created during battle by unit abilities, such as Focus, Blood Frenzy, or Haste Ritual, are non-Innate unless their own rule says otherwise.
- A positive effect that cannot be transferred must be marked **Innate**. Hero spells, Standing Orders, Battle Cries, Hunt Plans, Infernal Rites, artifact effects, passive auras, and source-specific states such as Soaring are Innate.
- Base statistics, ATB, ammunition, ability charges, and other resources are not buffs and are never eligible.
- If the target has several non-Innate buffs, use the battle's seeded random selection. If it has none, nothing is stolen.
- Each damaging hit may steal one buff.

Every positive combat effect should carry an explicit `innate: boolean` marker. Claim Blessing may steal only effects with `innate: false`; the engine should never infer this from an effect's name.

The unit panel should show **Innate** on protected buff tooltips so the player can understand why Claim Blessing cannot steal them.

## Cavalry roles

Cavalier is now a mobile skirmisher, while Champion is a committed line-breaker.

### Ride-By Attack

Ride-By Attack is selected instead of a normal melee attack. It may be used only when Cavalier can move at least three cells before reaching its target.

- The primary hit deals 50% more damage.
- The target cannot retaliate.
- After the hit and all immediate effects resolve, a surviving Cavalier automatically returns to the cell where it started the action.
- The return does not depend on Cavalier's remaining movement.
- Returning is part of the same action and does not trigger Gallop.
- On-hit effects, stolen buffs, kills, and death effects resolve before Cavalier returns.
- If the starting cell becomes occupied or illegal during resolution, Cavalier remains in the attack cell.
- If Cavalier dies during the action, it does not return.

Ride-By Attack begins battle ready. After use, it enters a **2-turn cooldown**:

- Cavalier cannot use it during its next two turns.
- The cooldown decreases after each of those turns, regardless of whether Cavalier moves, attacks, waits, defends, or loses the turn to a negative effect.
- It becomes ready again on Cavalier's third turn after the original use.
- Each Cavalier stack tracks its own cooldown.
- The cooldown is spent only after a legal Ride-By Attack resolves; cancelling or submitting an invalid target does not consume it.

The UI should show **Ready**, **2**, or **1** on the ability button. Cavalier repeatedly charges out and returns to safety, while Champion wants to drive forward through an enemy line with Grand Joust and Overrun.

## Proposed Knight hero mechanic: Standing Orders

Knight heroes have **no mana and cannot cast spells**. Instead, the hero may spend its turn issuing one Standing Order. Only one Order can be active at a time, and it remains active until the hero replaces it. Orders have no charges; their cost is giving up the hero's attack whenever the battle calls for a different formation.

Orders are not spells. Spell resistance, Sorcery, Silence, mana effects, and spell artifacts do not affect them.

The starting values below are deliberately simple:

### Hold the Line

Any friendly Knight unit that ends its turn without moving becomes **Braced** until its next turn.

- A Braced unit takes 30% less damage.
- It cannot be pushed or otherwise forcibly displaced.
- Moving clears Braced immediately.

This is the patient order. It supports Focus, Peasant formations, ranged protection, and Griffin retaliation, but allows the enemy to dictate where the fight happens.

### Ready the Counterattack

The first retaliation made by each friendly Knight unit between hero turns:

- deals 50% more damage; and
- advances that unit 10% ATB.

This is strongest when the opponent commits to melee. It is much weaker against shooters or an enemy willing to wait, giving both players a reason to change their approach.

### Advance by Ranks

When a friendly Knight unit finishes a move-only action adjacent to another friendly Knight unit, it returns at 50% ATB.

- The unit must move at least two cells.
- Forced movement does not count.
- An action that includes an attack does not qualify.

This moves a slow formation without turning Knight into another Barbarian rush. Switching away from Hold the Line also means surrendering its defensive protection.

## Knight artifacts

| Artifact | Rarity | Effect |
|---|---|---|
| **Muster Bell** | Common | Militia grants +1 attack/defense per 8 Peasants instead of 10. |
| **Blackpowder Fletching** | Common | Area Shot deals 65% damage to every affected unit, including friendlies. |
| **Drillmaster's Manual** | Common | Every Focus also grants +1 attack and defense. |
| **Silver Spurs** | Common | Ride-By Attack's cooldown is reduced from 2 to 1, allowing it to be used every second Cavalier turn. |
| **Shieldwall Standard** | Rare | Friendly stacks adjacent to a Swordsman inherit Large Shield. |
| **Barbed Volley** | Rare | Area Shot survivors lose 2 defense until their next turn, including friendlies. |
| **Gryphon Talon Bracers** | Rare | Griffin retaliations deal 50% more damage and advance the Griffin 10% ATB. |
| **Martyr's Banner** | Rare | The first Peasant stack destroyed each battle grants every surviving Knight stack +1 initiative and +1 damage. |
| **Consecrated Censer** | Rare | A unit targeted by Cleanse cannot receive new negative combat effects until the start of its next turn. |
| **Stormlance** | Epic | Champion penetration continues through every enemy in line; each secondary enemy takes 50% of the original hit. |
| **Manual of Perfect Form** | Epic | Using Focus grants one Focus stack to every living Swordsman stack. |
| **Royal Muster** | Epic | Friendly stacks adjacent to Peasants receive half of the Peasant stack's uncapped Militia bonus. |

Knight artifacts should only appear during Knight runs. Unit-specific artifacts should normally be offered only after the relevant unit joins the army, preventing dead rewards once automatic level bonuses are removed.
