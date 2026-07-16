# Gauntlet Items & Buffs — Design

Run-persistent items (Slay the Spire / Monster Train relic style) that buff
army-wide unit stats: attack, defense, initiative, luck, morale.

## Acquisition

- Every 3rd battle won (battlesWon 3, 6, 9, …) the post-battle draft offers
  the usual 3 unit cards **plus 2 item cards**. The player still picks exactly
  one thing — a unit card or an item.
- Applies to the whole run (nodes 1–10 and endless).
- Items are unique: each can be owned at most once. Items whose only effect
  targets a stat already at cap (luck/morale cap at +3 total) are excluded
  from offers.
- Rarity weights: 60% common / 35% rare / 5% epic. Offers are seeded from the
  run seed (deterministic, same pattern as unit drafts).

## Item catalog

Effects apply to every player stack at battle start (not the hero stack, not
summoned allies — same rule as hero skill bonuses).

| Rarity | Item | Effect |
|---|---|---|
| common | Blade of the Vanguard | +4 attack |
| common | Aegis Charm | +4 defense |
| common | Warhorn of Haste | +1 initiative |
| common | Rabbit's Foot | +1 luck |
| common | Banner of Courage | +1 morale |
| rare | Greatsword of Ruin | +8 attack |
| rare | Tower Shield Sigil | +8 defense |
| rare | Drums of War | +2 initiative |
| rare | Horseshoe of Fortune | +2 luck |
| rare | Standard of Heroes | +2 morale |
| rare | Berserker's Brew | +10 attack, −4 defense |
| rare | Stalwart Doctrine | +10 defense, −1 initiative |
| rare | Reckless Standard | +2 morale, −1 luck |
| epic | Crown of the Warlord | +5 attack, +5 defense, +1 morale |
| epic | Relic of the Ancients | +4 attack, +4 defense, +1 initiative, +1 luck, +1 morale |

Scale rationale: each point of (atk − def) difference is ±5% damage (cap 20),
so attack/defense items need big numbers. Each luck point is a 12.5% chance
to double damage; each morale point a 1/24 chance of an extra turn — so ±1/±2
is already large there. Unit initiative runs 8–14 (10 = one turn per round),
so +1 initiative ≈ 10% more turns.

## Architecture

**New module `src/lib/gauntlet/items.ts`**
- `ItemId`, `ItemDef { id, name, rarity, effects: Partial<Record<Stat, number>> }`
  where `Stat = 'attack' | 'defense' | 'initiative' | 'luck' | 'morale'`.
- `ITEMS: Record<ItemId, ItemDef>` — the catalog above.
- `itemDraftOptions(run): ItemId[]` — 2 seeded picks, rarity-weighted,
  excluding owned items and capped-stat items.
- `itemBonuses(itemIds): Record<Stat, number>` — summed effects.

**RunState (`src/lib/gauntlet/run.ts`)**
- Add `items: ItemId[]` (default `[]`; loader tolerates missing field on old
  saves).
- Add `pendingItems: ItemId[] | null` beside `pendingDraft`; `recordBattle`
  fills it when `battlesWon % 3 === 0`.
- New `applyItemPick(run, itemId)` mirrors `applyPick` (clears both pending
  fields, back to map).

**Engine**
- `UnitStack.initiativeBonus?: number`; turn order fill rate becomes
  `(definition.initiative + initiativeBonus) / 10` (`turnOrder.ts`).
- `initBattle` gains an optional `armyBonuses` param. Player stacks (not hero,
  not allies) get: `attackBuff`/`defenseBuff` += atk/def, `morale`/`luck` +=
  bonus (clamped to ±3), `initiativeBonus` set.

**UI**
- Gauntlet draft screen: item cards rendered alongside unit cards with
  rarity-tinted styling and effect text.
- Run header: owned item list with effects on hover/tap.
- `Battle.svelte` accepts and forwards `armyBonuses` to `initBattle`.

## Testing

- `items.test.ts`: catalog sanity, deterministic offers, owned/capped
  exclusions, `itemBonuses` summing.
- `run.test.ts` additions: item offer cadence (every 3rd win), `applyItemPick`.
- Engine tests: `initiativeBonus` affects ATB order; `initBattle` applies
  `armyBonuses` to player stacks only, luck/morale clamped.
