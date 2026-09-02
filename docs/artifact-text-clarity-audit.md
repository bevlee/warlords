# Artifact text clarity audit

Every artifact effect line in `src/lib/gauntlet/items.ts`, read against what the
engine actually does. The trigger was Butcher's Pennant — "an empowered-turn
kill" — but the word "empowered" turned out to be one instance of six vocabulary
problems that between them account for most of the confusing lines.

> **Status: resolved.** Every line below has since been rewritten in
> `items.ts`, and the terms now carry `[[…]]` markup that renders as a hover
> definition anywhere the text appears — see the
> [keyword tooltips design](plans/2026-09-01-keyword-tooltips-design.md).
> Artifacts that modify another ability now state the change explicitly, as
> *"[[focus_fire]] arrows gain 35% per consecutive hit instead of 25%, up to
> 140% instead of 100%"*. This document is kept as the record of what was wrong
> and why, so the reasoning survives the fix.

Each row gives the text **as it was**, what a player could not work out from it,
and what the engine does.

## The six root causes

Fix these and roughly forty lines stop needing individual attention.

**1. "Empowered" is undefined, and it means two different things.**
Butcher's Pennant and Red Sunrise say "empowered". Martyr's Banner says
"empowers". They are unrelated mechanics. Worse, the thing the Barbarian ones
refer to — Banner of the First Raid — never uses the word: it says "during their
first turn". Nothing in Abilities, Spells, or Faction skills defines it, and the
in-battle effect chip calls the state "Banner of the First Raid". So the player
sees the word for the first time on the artifact that assumes they know it.

**2. "X%" means both "reduced to X%" and "increased by X%".**
Sulfurous Pitch — "secondary damage is 75%" — raises a 50%-of-a-hit splash.
Horn of the Hunt — "grants 75% ranged damage" — is a ×1.75 multiplier. Same
phrasing, opposite direction, same list.

**3. Replacement versus addition is never marked.**
Most commons overwrite a number that lives in an ability's text. Yewstring's
"gain 35% damage, up to 140%" replaces Focus Fire's 25%/100%. Needlepoint's "30%
more damage" adds. Nothing distinguishes them.

**4. Six terms appear only in artifact text.**
"Empowered", "Infection"/"infected", "affliction"/"afflicted", "Ranged Mark",
"Grimoire", "Compass". None is defined anywhere a player can reach. The
Infection one is the sharpest: the mechanic exists, but the game shows it as
"Zombie — Infecting Strike" everywhere except in these three artifacts.

**5. Scope words that never say whose.**
"Survivors", "other units", "waiting friendly units", "surrounding stacks",
"Shooters". Each resolves to something specific in the engine, and in four cases
the specific thing is narrower or wider than the obvious reading.

**6. "Stack" collides with itself.**
A stack is a unit group *and* a stacking buff, in the same sentence sometimes.
Manual of Perfect Form's "grants a stack to every living Swordsman" is the worst
case.

---

## Knight

| Artifact | Current text | What's unclear | What it does |
| --- | --- | --- | --- |
| Martyr's Banner | *The first destroyed Peasant stack empowers every surviving Knight stack.* | "Empowers" is never defined, and means something different here than on the Barbarian artifacts | +1 Initiative and +1 damage, permanent, to your living Knight-faction stacks. Once per battle |
| Manual of Perfect Form | *Focus grants a stack to every living Swordsman.* | "A stack" reads as a unit stack. Also unclear whether one Swordsman spends the turn or all of them | One Swordsman's Focus action applies the Focus buff to every living Swordsman you own |
| Royal Muster | *Stacks adjacent to Peasants gain half their Militia bonus.* | "Their" is ambiguous, and it doesn't say what happens next to two Peasant stacks | An adjacent stack gains half of that Peasant stack's Militia bonus (rounded down) to Attack and Defence. Only one Peasant stack counts, not the sum |
| Stormlance | *Overrun continues through every enemy in line.* | Doesn't say what the extra enemies take | Each takes 50% of the primary hit, the same as base Overrun. Continues to the board edge; gaps don't stop it |
| Blackpowder Fletching | *Area Shot deals 65% damage, including to friendlies.* | "Including to friendlies" is already true of Area Shot, so it reads as a new drawback | The only change is 50% → 65%. Friendly fire was always there |

## Ranger

| Artifact | Current text | What's unclear | What it does |
| --- | --- | --- | --- |
| Endless Quiver | *Shooters gain 6 shots and qualifying Compass movement gives 65% ATB.* | Three problems: 6 total or +6; which shooters; and "Compass" is an unexplained reference to another artifact | +6 shots to every shooter you own, any faction. "Compass" is Wayfarer's Compass, the Ranger starter: moving ≥3 cells without attacking. The 65% replaces its 50%, for shooters only |
| Bow of Echoes | *Wood Elf gains a second 75% arrow and Grand Elf a third.* | The 75% is not in the engine — the extra arrow is full damage | +1 arrow for either unit (Grand Elf's Double Shot goes 2 → 3). Each arrow spends a shot |
| Pollen Veil | *Long movement gives Sprite 50% ranged protection until its next turn.* | "Long movement" has no distance; "50% protection" could be a chance to avoid | Moving at least 3 cells; then it takes half damage from ranged attacks |
| Fleeting Shadow | *A safe Darting return gives Sprite 25% ATB.* | "Safe" is undefined | No enemy adjacent to the cell it returns to |
| Dew of the First Dawn | *Safe Darting returns permanently grant Sprite +1 Initiative.* | Same "safe"; also whether it's capped | Uncapped, once per qualifying return |
| Stag Spurs | *First Strike deals 100% more damage.* | Replaces or adds to the ability's 75% | Replaces it: 75% → 100% |
| Horn of the Wild Hunt | *Each melee stack's first kill grants other melee stacks 15% ATB.* | "Melee stack" omits the faction restriction | Ranger-faction non-shooters only, once per stack per battle, and only they receive it |
| Silver Horseshoe | *Fortune's Herald grants +2 Luck and 40% ATB.* | Inherits the ability's own vagueness — Fortune's Herald says only "grants Luck" | Whose Luck and on what trigger is only discoverable from the Unicorn's entry |
| Predator's Focus | *Consecutive ranged hits build a shared 10% damage bonus, up to 100%.* | "Shared" between which stacks | Pooled across the Wood Elf and Grand Elf stacks named in the requirement |
| Blinkwing Mantle | *Darting Assault may retreat within unused movement range.* | Reads as a rules clause, not an effect | The return cell is any cell inside the movement it hasn't spent, not the cell it started from |

## Barbarian

| Artifact | Current text | What's unclear | What it does |
| --- | --- | --- | --- |
| **Butcher's Pennant** | *An empowered-turn kill also empowers that stack's next turn.* | "Empowered turn" is defined nowhere. Also silent on which kills count and whether it chains | An empowered turn is one under Banner of the First Raid (+2 Speed, +30% damage). Killing the primary target on such a turn extends the buff by one more turn, and it chains for as long as the stack keeps killing |
| Red Sunrise | *Banner of the First Raid empowers the first 2 turns.* | Same undefined word | Extends the Banner buff from 1 turn to 2 |
| Map of the First Raid | *Banner of the First Raid grants +4 Speed.* | On top of the +2, or instead of it | Instead: +2 → +4 |
| Banner of No Return | *Banner of the First Raid grants 50% more damage.* | Same | Instead: +30% → +50% |
| Horn of the Hunt | *Loose! grants 75% ranged damage and Marks before damage.* | "75% ranged damage" reads as a reduction, the way it reads on Sulfurous Pitch | ×1.75 outgoing ranged damage, up from the cry's ×1.4 |
| Skull Trumpet | *Blood for Blood! grants 75% outgoing damage.* | Same phrasing problem, plus it hides that the cry's downside is untouched | ×1.75 outgoing, up from ×1.5. Still +50% incoming damage |
| Bronze War Horn | *Charge! grants +4 Speed and 40% melee damage.* | Additions or replacements | Replacements: +2 → +4 Speed, ×1.25 → ×1.40 damage |
| Black-Fletched Quiver | *Shooters gain 3 shots and ignore distance penalties.* | 3 total or +3; and "Shooters" contradicts the Orc/Cyclops requirement | +3 shots, Orc and Cyclops only. "Distance penalties" is the half-damage rule beyond a shooter's range |
| Horde Drum | *Enemy deaths grant waiting friendly units 10% ATB.* | "Waiting" reads as the Wait action | Every friendly non-hero stack except the one currently taking its turn. Only enemy deaths trigger it |
| Broken Maw Chain | *Rampage kills stack 25% damage until a failed kill.* | Whether it compounds, and whether it's capped | +25% per consecutive kill, uncapped, cleared by a turn that doesn't kill |
| Red-Fletched Arrows | *Ranged Mark causes 45% more ranged damage.* | Reads as +45% over normal. "Ranged Mark" is not a name used anywhere else | It raises the Marked bonus from +30% to +45% — about 11% more damage in practice |
| Ironbound Horns | *Battering Ram needs 2 cells and collision deals 50%.* | 50% of what, and when a collision even happens | Collision only occurs when the target has nowhere to be pushed. It then takes 50% of the attack's damage, up from 25% |
| Redcap Knives | *Mob Rule grants 20% per adjacent friendly, up to 60%.* | Adjacent to the Goblin or to the target | Adjacent to the target, as in the base ability |
| Headsman's Cleaver | *Follow Through transfers all unused overkill.* | Doesn't say who receives it | The weakest enemy adjacent to the attacker, not to the target |

## Wizard

| Artifact | Current text | What's unclear | What it does |
| --- | --- | --- | --- |
| Codex of the Unbound | *Half Arcane Conduit's bonus boosts Armour-Piercing attacks.* | Nearly unparseable — a fraction of one ability applied to a different one | Armour-piercing attacks deal 5% more damage. That is all |
| Prism of the Fallen | *Hero damage rises 20% per dead non-hero stack.* | Whose dead stacks, and when it's counted | Every destroyed non-hero stack on the field, both armies. Snapshotted at the start of the hero's turn |
| The Animus Engine | *Repair may rebuild a destroyed construct once.* | Once per battle or once per construct | Once per construct |
| Scroll of Slowing, Tome of Chain Lightning, Sigil of Resurrection, Tome of the Blizzard | *Grants Slow.* | Grants it to whom, at what cost | Adds the spell to the hero's spellbook at its usual mana cost. These four are the only artifacts whose effect line is a fragment |

## Demon

| Artifact | Current text | What's unclear | What it does |
| --- | --- | --- | --- |
| Furnace Heart | *A dead burning stack transfers Burn to surrounding stacks.* | "Surrounding" hides that it doesn't check sides | Every stack adjacent to the corpse, **your own included**, unless fire-immune. Burn lasts 2 rounds |
| Ashen Covenant | *Demon-faction deaths grant survivors 10% ATB.* | Whose deaths, and which survivors | Your own Demon-faction stacks dying, once each. The ATB goes to every stack you own, not only Demons |
| Seal of the Ninth Circle | *Each starting Demon stack returns once after death.* | Says nothing about how much comes back | 30% of starting count. A Devil, which already has Infernal Rebirth, returns at 60% instead. Summons don't qualify |
| Brimstone Key | *Gate summons 5 Imps per Demon.* | No baseline to compare against — Gate's own text says only "summon reinforcements" | The number is only meaningful next to the Demon entry |
| Crown of Wildfire | *Burn applications stack and refresh.* | Which part stacks, and whether it's capped | Burn damage-per-tick accumulates, uncapped; the duration resets to 2 rounds each application |
| Powder Keg | *Cinderburst deals 40% of starting HP.* | One creature's HP or the stack's | The stack's whole starting HP pool, as in the base ability (25%) |

## Necromancer

| Artifact | Current text | What's unclear | What it does |
| --- | --- | --- | --- |
| Blighted Soil | *Dead infected enemies spread Infection.* | "Infection" is not a term the game uses anywhere else | The effect is Infecting Strike, shown in battle as "Zombie — Infecting Strike" |
| Plague Bell | *Infected enemies raise twice as many Skeletons.* | Same term; also which raise it means | Corpses carrying Infecting Strike raise double from Gravewright's Grimoire |
| Crown of Ruin | *Infection, Curse and Morale Drain apply twice.* | Same term | Two applications per hit of each |
| Book of Grudges | *Necromancer damage rises 15% per target affliction.* | "Affliction" undefined; "Necromancer damage" reads as a faction restriction | +15% per distinct negative effect on the target, counting negative morale and burning. It applies to **every stack you own**, faction irrelevant |
| Chalice of Night | *Vampire Life Drain heals 150% against afflicted targets.* | Same "afflicted"; and 150% of what | Heals 150% of the damage dealt, up from the Vampire's 100% |
| Funeral Drum | *Every 5 lost Skeletons grants other units 10% ATB.* | "Other units" — whose, and what happens to a remainder | Your living non-Skeleton Necromancer stacks. The count carries over between triggers |
| Blood Tithe | *Every 6 excess Life Drain healing creates a Skeleton.* | 6 of what | 6 HP of overheal, which is one Skeleton's worth |
| Shroud of Preservation | *Half a killed Skeleton stack joins another.* | Which other stack | The largest surviving Skeleton stack you own |
| Marrow Crown, Dragon Ossuary | *Grimoire Skeletons enter at 50% ATB.* | "Grimoire" is a short name for another artifact | Gravewright's Grimoire, the Necromancer starter |

## Legacy artifacts

The fifteen flat stat items (Blade of the Vanguard, Aegis Charm, …) read
perfectly — but `isItemEligible` excludes them from every draft, so none of them
can be obtained. Until this audit the compendium listed them beside real
artifacts under the line "Offered during a gauntlet run", which was false for
exactly these fifteen. The compendium now groups them separately and says they
are no longer offered.

## Lines that are already clear

Roughly two-thirds of the pool needs nothing: Muster Bell, Drillmaster's Manual,
Silver Spurs, Shieldwall Standard, Barbed Volley, Gryphon Talon Bracers,
Consecrated Censer, Quicksilver Dew, Thornwall Seed, Grudge Axe, Canopy Idol,
Ratchet Loader, Tinker's Kit, Hexfield Core, Pressurised Bile Sac, Storm
Fletching, Conduit Array, Overcharged Rods, Vitriol Catalyst, Serpent's Coil,
Stormcrown, Cracked Hourglass, Gatekeeper's Chain, Blackened Wick, Brand of
Damnation, Mouth of Hell, Wailing Lantern, Crimson Needle, Withered Quiver,
Reaper's Tack, Vertebral Key, Knight's Reliquary, Empty Throne, Bloodletter Axe,
Worldsplitter, and the rest. They name a mechanic the player can look up and give
a number in a consistent direction.
