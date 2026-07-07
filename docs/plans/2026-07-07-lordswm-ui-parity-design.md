# LordsWM UI Parity — Design

Per reference screenshots: sprites instead of emoji cards, darker-tile
movement range with a static cursor, and cursor-angle attack aiming with a
damage preview.

## Tokens → sprites

- Hand-drawn inline **SVG sprites** (`Sprite.svelte`, one flat-color stylized
  figure per unit: Goblin, Wolf Rider, Orc, Ogre, Cyclops, Thunderbird,
  Behemoth, Hero, plus a boulder for obstacles). Consistent style: 64×80
  viewBox, dark outline, standing on the tile with the existing ground
  shadow.
- The card chrome goes away: no background, no rings, no HP bar on the
  field. A small **count plate** sits at the sprite's feet (blue for player,
  red for enemy). Active unit gets a **yellow arc** under its feet; defend/
  buff badges stay as tiny glyphs by the plate. Turn bar and info panel use
  the same sprites.

## Movement & attack interaction (LordsWM model)

- **Range**: reachable cells render as a *darker* tile blob; everything else
  stays flat. Cursor stays the default arrow over movement (no pointer).
- **Melee aiming**: hovering an attackable enemy shows the sword cursor and
  picks a landing tile from the cursor's position within the enemy tile —
  the valid attack origin whose direction from the enemy best matches the
  cursor offset. That origin cell is edged red with an arrow pointing at the
  target; **click executes move+attack** in one go. This replaces the
  two-step click-enemy-then-tile flow (and its amber tiles / floating ⚔️).
  Shift still forces melee for shooters; shooters otherwise get the bow
  cursor and single-click shots.
- **Damage preview**: while aiming at any target, a small floating box shows
  💀 kills range and 💥 damage range — new pure selector
  `damagePreview(attacker, defender, heroAttack)` (min/max roll through the
  real modifier math, luck excluded), TDD'd.

## Chrome tightening

- Tile gaps shrink to hairlines with subtle bluish grid lines on a flat
  board; turn-bar entries become framed portraits (side-coloured 2px frame,
  count in the corner) using the sprites.

## Testing

TDD `damagePreview`. Browser verification per the verify skill (drivers
updated: melee is now a single aimed click on the enemy).
