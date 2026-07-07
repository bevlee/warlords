# Sword/Bow Cursors + Hero Spells — Design

The last two combat gaps from `docs/VISION.md`.

## Cursor treatment

LordsWM changes the mouse cursor itself near targets. We keep the floating
⚔️/🏹 hover icons (good on touch) and add real cursors: cells whose click
melees show a sword cursor, shoot targets a bow, spell targets a sparkle —
inline SVG data-URI cursors (emoji glyph in an SVG `<text>`), falling back to
`crosshair`.

## Hero spells

The hero can cast instead of striking, LordsWM-style, once per hero turn.

- `Hero.mana` (new field): starts at `5 + 3·level`; spent on cast, never
  regenerates within a battle.
- Spells (barbarian starter set):
  - **Lightning** (3 mana): `12 + 8·level` true damage to one enemy stack —
    ignores the attack/defense modifier (log as `cast`).
  - **Bloodlust** (2 mana): +4 attack to one friendly stack for the battle.
  - **Stoneskin** (2 mana): +4 defense to one friendly stack for the battle.
- `UnitStack` gains optional `attackBuff`/`defenseBuff` (default 0) that feed
  the damage formula; buffs are battle-long and stack if recast.
- New action `{ type: 'cast'; spell; targetId }`, valid only for the hero:
  validates mana, applies the effect, logs a `cast` event, costs the hero's
  turn (re-enter at 0). `applyAction` stays permissive about anything else.

## UI

- Hero flank portrait shows mana (💧n).
- On the hero's turn a spell bar appears beside Wait/Defend: one button per
  spell with cost, disabled when mana is short. Selecting a spell enters
  spell-targeting (enemies ring for Lightning, friendlies highlight for
  buffs); clicking a valid stack casts; clicking elsewhere or reselecting
  cancels. Without a selected spell, clicking an enemy still strikes.
- Buffed stacks show ⚡ (attack) / 🛡 (defense already used for defend — use
  🗿 for stoneskin) badges; unit info shows buffed stats.

## Testing

TDD the engine: mana gating and spend, lightning damage + death handling,
buffs affecting `calculateDamage`, cast consumes the hero turn, non-hero cast
rejected. UI verified in headless Chrome per the verify skill.
