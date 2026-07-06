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
indicators · owner colours · combat log · 2.5D perspective board.

### Gaps, roughly in priority order

1. **ATB initiative bar** — replace the per-round speed-sorted queue with a
   continuous initiative scale (repeat turns for fast units, wait = half-cycle
   delay, 0–10% start deviation). Engine change + horizontal bar UI at
   bottom-center with hover-sync to the battlefield.
2. **Shooter melee-block** — adjacent enemy disables shooting; add forced
   melee (Shift-click equivalent).
3. **Defend action** — reduce incoming damage until next turn (we only have
   Wait, which is currently a plain skip).
4. **Obstacles** — the grid supports `blocked` cells but battles never place
   any; add rocks/terrain to battlefields.
5. **Hover sync + cursors** — hovering a stack highlights it in the turn bar
   and vice versa; sword/bow cursor treatment near targets.
6. **Hero as an actor** — hero portrait on the flank with per-round actions
   (attack, later spells).
7. **Long term** — unit art replacing emoji standees, factions beyond
   Barbarian, faction skills in the damage formula, PvP/economy layers.
