# Warlords — Reference Vision

**Reference game: [Lords of War and Money](https://www.lordswm.com/about-game)**
(LordsWM, a HoMM5-style browser game). The battle screen should ultimately look
and play like LordsWM's. This doc is the durable checklist; dated docs in
`docs/plans/` record individual milestones.

## What LordsWM's combat looks like (from their help pages)

- **Battlefield**: square grid seen in perspective; squares light up to show
  how far the active stack can move. Obstacles (rocks) block walkers; flying
  units pass over them.
- **Initiative bar ("ATB scale")**, bottom-center: *continuous* — units are
  positioned along a scale by initiative; faster units act more often and can
  appear twice per cycle. Combat starts with a random 0–10% deviation.
  **Wait** pushes a stack back half a cycle (a delay, not a skip). Stack frame
  colour = owning player. Hovering a stack highlights it on both the bar and
  the battlefield. Spells can shift bar positions.
- **Melee**: pointing at an enemy turns the cursor into a **sword**; moving the
  cursor around the enemy picks the attack direction, and *the square you will
  attack from lights up*. (Ours: two-step click — select enemy, then click one
  of the lit attack-from tiles. Same information, different gesture.)
- **Shooters**: bow cursor; an **adjacent enemy stack disables shooting**;
  Shift+click forces a melee attack instead.
- **Damage**: `N × R(min,max) × [1 + 0.05(A−D)]` (divide when D>A) — matches
  our formula — plus a defender faction-skill reduction we don't model.
- **Screen**: battlefield + control panels, combat log window, hero present
  with castable actions.
- **Around combat**: hero/lord levelling, factions with faction skills,
  economy, PvP and clan wars — the long-horizon direction.

## Where we stand

Have already: grid with lit move squares · stack tokens with counts and HP ·
matching damage formula · retaliation · morale/luck · flyers passing over
occupants · shooter range · player-chosen attack-from tile with ⚔️/🏹
indicators · owner colours · combat log · 2.5D perspective board ·
**ATB initiative bar** (continuous scale, repeat turns, wait = half-cycle,
0–10% start deviation, bottom strip with two-way hover sync) ·
**shooter melee-block** (adjacent enemy disables shooting; Shift-click forces
melee) · **Defend** (+30% defense until own next turn, 🛡️ badge) ·
**obstacles** (seeded rocks in the middle columns) · **hero as an actor**
(flank portrait, own ATB turn, whole-board no-retaliation strike,
untargetable, army death = defeat).

Also done: **sword/bow/sparkle cursors** on targets (SVG data-URI cursors) ·
**hero spells** (mana = 5 + 3·level; Lightning true damage, Bloodlust /
Stoneskin battle-long buffs; spell bar on the hero's turn).

### Gaps, roughly in priority order

All LordsWM combat mechanics are in, plus the **army setup screen**
(300-gold recruiting, generated matching enemy, setup → battle → result →
setup loop). What remains is content and meta-game:

Also done: **hero progression** — victories grant XP equal to the defeated
army's value, levels give +1 attack/defense (mana, strike, and Lightning
already scale), battle budgets grow 50/level, and the hero persists in
IndexedDB with a reset option.

Also done: **Knight and Wizard factions** (7-tier rosters each, picked on
the army setup screen alongside Barbarian) and **faction skills** —
Barbarian Offense/Armorer/Leadership, Knight Tactics/Armorer/Leadership,
Wizard Sorcery/Intelligence/Mysticism — unlocking and levelling with the
hero and feeding the damage formula (Offense/Armorer) and starting morale
(Leadership). Knight Cavalier/Champion have Jousting (+5% damage per cell
charged); Wizard Gorgon has Death Stare (10% chance to instantly kill the
top defending creature).

1. **Long term** — unit art replacing emoji standees, PvP/economy layers,
   remaining faction skills without combat effects yet (Tactics, Sorcery's
   spell-damage hookup, Intelligence, Mysticism).
