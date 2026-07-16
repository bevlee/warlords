# Artifact Icons & Battle Marker — Design

Give every gauntlet artifact an image, and show active artifacts during
battle so the player can see which army-wide bonuses apply.

## Item icons

`src/lib/ui/ItemIcon.svelte` — sibling of `SpriteVector.svelte`, same
flat-vector language: `viewBox="0 0 64 64"`, `#0f172a` outline at
stroke-width 2, rounded joins/caps, bright Tailwind-palette fills.
Props: `id` (item id) + `class` passthrough. One branch per item:

| Item | Icon |
|---|---|
| Blade of the Vanguard | upright sword, steel blade / amber guard |
| Aegis Charm | kite shield with gem boss |
| Warhorn of Haste | curved horn with motion ticks |
| Rabbit's Foot | white paw on a cord |
| Banner of Courage | forked pennant on a pole |
| Greatsword of Ruin | wide two-hander, red-tinged blade |
| Tower Shield Sigil | tall tower shield, emblem stripe |
| Drums of War | war drum, crossed sticks |
| Horseshoe of Fortune | golden horseshoe |
| Standard of Heroes | double-tail royal standard |
| Berserker's Brew | frothing tankard, red liquid |
| Stalwart Doctrine | open book with shield mark |
| Reckless Standard | torn black banner |
| Crown of the Warlord | gold crown, red jewels |
| Relic of the Ancients | glowing purple rune amulet |

Unknown ids render a fallback pouch so a future item never ships
invisible. Rarity is conveyed by the surrounding ring (existing
`RARITY_STYLE` colors), not baked into the icon. The one vector serves
all sizes: draft cards (~48px), battle strip (~28px), sidebar (~20px).

## Battle marker

`src/lib/ui/ArtifactStrip.svelte`: horizontal row of icon chips docked
top-left of the battle view beside the settings cog. Chip = ~28px
ItemIcon in a rounded `bg-slate-900/85` tile with a rarity-colored
ring. Hover/tap opens a `role="tooltip"` popover (spellbook pattern):
item name (rarity-tinted), rarity label, `itemEffectText`. Renders
nothing when the item list is empty, leaving non-gauntlet battles
untouched.

## Data flow

- `Battle.svelte` gains optional `items?: ItemId[]`; gauntlet page
  passes `run.items` next to the existing `armyBonuses`.
- `ArtifactStrip`/`ItemIcon` read `ITEMS` / `itemEffectText` from
  `$lib/gauntlet/items` (no cycle — gauntlet never imports ui/).
- Draft artifact cards show the icon above the name; the map sidebar's
  Artifacts list becomes icon + name rows.

## Testing

Visual components — verified by driving the app (draft, map sidebar,
battle strip + tooltip) headless with screenshots. Logic already lives
in `items.ts` under existing tests.
