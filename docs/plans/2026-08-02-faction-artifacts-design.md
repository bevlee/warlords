# Faction Artifacts — Design

Faction-specific artifacts for the gauntlet, offered from the same post-victory
draft as today's global artifacts. A run playing Knight can be offered the 15
global artifacts *plus* the 3 Knight artifacts, and never another faction's.

Builds on `2026-07-16-gauntlet-items-design.md` (the global catalog, offer
cadence, rarity weighting) and `2026-07-17-artifact-icons-design.md` (icons).

## Pooling model

One catalog, one pool, one roll. Faction artifacts are not a second draw
bolted beside the global draw — they are appended to the same candidate list
and the existing rarity-weighted roll runs over the merged list. That keeps
determinism, the owned-item exclusion, and the capped-stat exclusion working
unchanged.

```
eligible(run) = GLOBAL ∪ FACTION[run.faction]
              − owned(run)
              − deadPicks(run)          // every positive stat already capped

weight(item)  = RARITY_WEIGHT[item.rarity] × (item.faction ? FACTION_AFFINITY : 1)
```

`itemDraftOptions` then picks `ITEM_OFFER_COUNT` (2) items without replacement,
exactly as it does now, summing `weight` instead of `RARITY_WEIGHT` directly.

### Why the affinity multiplier

Without a thumb on the scale the global pool buries the faction pool. Current
global weight mass is 300 (common) + 280 (rare) + 10 (epic) = 590. Three
faction artifacts at 2 rare + 1 epic contribute `75 × k`:

| affinity `k` | faction share per card | P(≥1 faction card in a 2-card offer) |
|---|---|---|
| 1 (no boost) | 11% | ~21% |
| 2 | 20% | ~37% |
| **3 (chosen)** | **28%** | **~48%** |
| 4 | 34% | ~56% |

`k = 3` puts a faction artifact in roughly half of all offers — present enough
to shape a run's identity, rare enough that drawing one still feels like an
event. It is a single constant; retune it without touching the roll.

Optional variant, if the run should get more faction-flavoured as it goes:
make affinity a function of act — `1.5 / 3 / 5` for acts 1/2/3 — which raises
act-3 offers to ~62% while keeping act 1 mostly generic.

Optional guarantee, if ~48% is too swingy: reserve slot 1 for the faction
sub-pool (when non-empty) on offers from act 2 onward, and fill the remaining
slot from the merged pool. Stronger identity, less variety; recommend shipping
the pure weighted blend first and adding this only if playtests want it.

### Distribution on round victories

Unchanged cadence: `recordBattle` fills `pendingItems` when
`battlesWon % 3 === 0`, so offers land at wins 3, 6, 9, 12… The merged pool
means no new branch in `recordBattle` at all — `itemDraftOptions(next)` already
receives the whole `RunState`, and `run.faction` is what selects the sub-pool.

Pool drain in endless: with 15 global + 3 faction artifacts, a long run
exhausts the faction sub-pool after ~3 faction draws and the roll degrades
gracefully to global-only (the pool filter simply stops yielding faction ids).
No special case needed — `itemDraftOptions` already returns fewer than 2 items
when the pool runs dry.

## Catalog

Authored as two literals and merged, with the faction stamped programmatically
so a new entry cannot be mis-tagged. Rarities are rare/epic only: faction
artifacts are identity pieces, not filler. Numbers sit at a slight premium over
the global equivalents (global rare = +8 atk) to give a reason to want them.

| Faction | Artifact | Rarity | Effect | Leans into |
|---|---|---|---|---|
| Barbarian | Warpaint of the Horde | rare | +10 atk, +1 morale | horde aggression |
| Barbarian | Chieftain's Skull Totem | rare | +6 atk, +2 morale | extra-turn snowball |
| Barbarian | Bloodrage Idol | epic | +14 atk, −5 def, +1 luck | all-in offense |
| Knight | Oathbound Bulwark | rare | +10 def, +1 morale | attrition |
| Knight | Lion Standard | rare | +4 def, +2 morale | steady line |
| Knight | Crusader's Reliquary | epic | +6 atk, +8 def, +1 morale | balanced elite |
| Wizard | Arcane Focus | rare | +10 atk, +1 init | fragile burst |
| Wizard | Ward of the Conclave | rare | +8 def, +1 luck | shores up frailty |
| Wizard | Astral Codex | epic | +2 init, +2 luck | act first, hit twice |
| Necromancer | Grave Lantern | rare | +2 init | fixes undead slowness |
| Necromancer | Bone Meal Reliquary | rare | +4 atk, +8 def | keeps the horde alive |
| Necromancer | Crown of Bones | epic | +8 atk, +8 def, −1 init | slow, unkillable wall |
| Ranger | Hunter's Mark Quiver | rare | +8 atk, +1 luck | archer crits |
| Ranger | Windrunner Charm | rare | +2 init, +1 morale | mobility stacking |
| Ranger | Heartwood Idol | epic | +6 atk, +2 init, +1 morale | skirmisher tempo |
| Demon | Brimstone Brand | rare | +12 atk, −4 def | reckless raiders |
| Demon | Pact Chain | rare | +2 luck, −4 def | gamble on doubles |
| Demon | Infernal Sigil | epic | +10 atk, +1 init, +1 luck | burst tempo |

Stat-only effects, so this ships with **zero engine change** — `itemBonuses`
already sums any `ArmyBonuses` key and `initBattle` already applies the result.
Effects that read faction-specific (extra raise chance for Necromancer, shot
count for Ranger) would need new engine plumbing; deliberately out of scope for
the first cut.

## Architecture

**`src/lib/gauntlet/items.ts`**

- `ItemDef` gains `faction?: FactionClass` — absent means global.
- Two source literals, merged into the existing flat `ITEMS` record:

```ts
const GLOBAL_ITEMS: Record<GlobalItemId, ItemDef> = { /* today's 15 */ };

const FACTION_CATALOG: Record<FactionClass, Record<string, Omit<ItemDef, 'faction'>>> = {
  barbarian: { warpaint_of_the_horde: { … }, … },
  …
};

export const ITEMS: Record<ItemId, ItemDef> = {
  ...GLOBAL_ITEMS,
  ...Object.fromEntries(
    (Object.entries(FACTION_CATALOG) as [FactionClass, Record<string, Omit<ItemDef, 'faction'>>][])
      .flatMap(([faction, defs]) =>
        Object.values(defs).map(def => [def.id, { ...def, faction }] as const)
      )
  ),
} as Record<ItemId, ItemDef>;
```

- `ITEM_IDS` stays `Object.keys(ITEMS)`, so every downstream consumer
  (compendium entries, `itemIconFor`, `itemBonuses`, save loading) picks the
  new artifacts up for free.
- New `FACTION_AFFINITY = 3` and `offerWeight(item)`.
- New exported `itemPool(run): ItemId[]` — the eligibility filter above, split
  out of `itemDraftOptions` so it is directly testable.
- `itemDraftOptions` swaps both `RARITY_WEIGHT[ITEMS[id].rarity]` reads (the
  sum and the subtract loop) for `offerWeight(ITEMS[id])`.

`FactionClass` is a type-only import from `../engine/types`, which `items.ts`
already imports — no new module cycle.

**`run.ts`** — no change. `recordBattle` passes the whole `RunState`; faction
selection happens inside the pool filter.

**Save compatibility** — items persist as ids and resolve through the flat
`ITEMS` record, so old saves load unchanged and a run holding a faction id
needs no migration. `itemBonuses` never inspects `faction`, so even a
hand-edited save carrying a foreign faction's artifact still sums correctly.

**Determinism caveat** — the rng stream is unchanged, but the *pool* it indexes
into is not, so an in-flight save sitting on a pending offer will see different
cards after deploy. Offers already stored in `pendingItems` are unaffected;
only freshly-rolled ones shift.

**Compendium** (`src/lib/compendium/entries.ts`) — `ItemEntry` gains
`faction?: FactionClass`, populated from `ITEMS[id].faction`, so faction
artifacts can be labelled and filtered the way unit entries already are. The
`ITEM_ENTRIES` builder is otherwise untouched.

**UI** — the draft artifact card gains a small faction chip above the rarity
label when `item.faction` is set (rarity styling unchanged, so the two signals
don't compete). Map sidebar and `ArtifactStrip` need no change. Icons: 18 new
PNGs in `src/lib/assets/items/`; until they land `ItemIcon` renders its pouch
fallback, so the feature is playable before the art is.

## Testing

- **Catalog** — ids unique across both literals; every faction artifact's
  `faction` is a real `FactionClass`; existing name-uniqueness and
  effect-non-empty checks extend to the merged record automatically.
- **Pool isolation** — across all 6 factions × 200 seeds, `itemDraftOptions`
  never returns an artifact whose `faction` differs from `run.faction`.
- **Faction share** — over ~600 seeds, faction artifacts land in 35–65% of
  offers (loose bounds; the point is to catch an affinity constant that has
  been zeroed or wildly mistuned, not to pin the exact rate).
- **Drain** — a run owning every artifact of its faction still receives 2
  global offers.
- **Existing rarity test must be restated.** `items.test.ts` currently asserts
  `common > rare > epic` over the whole offer stream, and that ordering holds
  only by a hair today (weight mass 300 vs 280). Adding rare/epic faction
  artifacts at any affinity ≥ 1 flips it — by design, since faction artifacts
  are meant to be rare-tier. Replace the global assertion with: the ordering
  holds within the *global* sub-pool, and `epic > 0` overall. Do not "fix" this
  by demoting faction artifacts to common — the ordering is the thing that
  changed, not the catalog.
