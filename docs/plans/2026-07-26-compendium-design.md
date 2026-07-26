# Compendium — design

A browsable in-game reference for every unit, faction, ability, spell, faction skill,
gauntlet item, and gauntlet unit skill, with a record of what the player has met in
battle. Reachable from the hub and deep-linked from the screens where the information
is actually wanted.

## Decisions

| Question | Decision |
|---|---|
| Gating | **None.** Everything is browsable from the first launch. Entries the player has met carry an "Encountered" marker and a per-faction count. |
| Backstory | **Out of scope.** No lore prose, no lore data layer. The compendium is a mechanical reference; the existing `FACTION_INFO` one-liners are the only prose. |
| Discovery storage | New server save slot `compendium`, beside `hero`/`army`/`campaign`/`gauntletRun`. Follows the player across devices; cleared by the hero reset. |
| Discovery trigger | **On sight**, at battle start — every stack on the field, win or lose. Gauntlet items and unit skills record when *offered* in a draft. |
| Container | The `/compendium` page is the only place entries render. In-game links open a new tab; the in-battle hover panel is unchanged. |

### Why no gating

An open compendium is a planning tool — the player can compare a Champion against a
Titan before committing 150 gold. A locked one is a collection toy that happens to
also be a reference, and it only works as a reference once you no longer need it.
Discovery markers keep the collection texture without taking the utility away.

### Why on-sight discovery

It fires from one place — the battle's mount — so campaign, gauntlet, events, and
co-op are covered without touching three separate result handlers. It also survives a
rage-quit or a dropped connection, and losing to a Vampire five times still teaches
you what a Vampire is.

### Why a page and not an overlay

`UnitInfo` already shows base stats *and* full ability descriptions on hover
(`src/lib/ui/UnitInfo.svelte`). An in-battle modal would mostly re-show what is
already on screen. What hover cannot give is the full roster, cross-references,
filtering, and the encountered log — and those want room. Dropping the overlay also
drops a focus trap, an Esc handler, and z-index negotiation with the battle grid's
existing overlays.

## Architecture

Two new pure modules. Neither defines game data.

```
src/lib/compendium/
  entries.ts     aggregates existing exports into a uniform entry model
  discovery.ts   the "seen" set: shape, merge, load/save
```

### Entry model

A discriminated union over seven kinds, each built by mapping an existing export:

| Kind | Source | Count |
|---|---|---|
| `unit` | `CATALOG` (engine/catalog.ts) + `UNIT_COSTS` (engine/recruit.ts) | 48 |
| `faction` | `FACTION_INFO` + `FACTION_UNITS` (engine/factions.ts) | 6 |
| `ability` | `ABILITY_INFO` (ui/abilities.ts) | 25 |
| `spell` | `SPELLS` + `lightningDamage` (engine/battle.ts) | 3 |
| `factionSkill` | `FACTION_SKILL_DEFS` (engine/factionSkills.ts) | 18 |
| `item` | `ITEMS` + `itemEffectText` (gauntlet/items.ts) | 15 |
| `unitSkill` | `UNIT_SKILLS` (gauntlet/skills.ts) | 5 |

Every entry carries `{ kind, id, name }`. `id` is the existing stable key — a catalog
slug, an ability id, an `ItemId` — so nothing new is persisted or migrated.

**`entries.ts` never restates a fact.** A unit's damage is read from
`CatalogUnit.base`; an item's effect line from `itemEffectText()`. Adding a unit to
`demon.ts` makes it appear in the compendium with no further edits. This is the
property that keeps the module from rotting, and the tests enforce it.

Cross-references fall out for free: a unit entry's `abilities` are ability-entry ids,
a faction entry's roster is unit-entry ids.

### Discovery

```ts
export interface DiscoveryState {
  units: string[];        // catalog slugs
  factions: FactionClass[];
  items: ItemId[];
  unitSkills: SkillId[];
}
```

Sorted arrays, so the stored JSON is stable and diffable. Every field is defaulted on
read, so a save written before a field existed still loads — the same tolerance
`migrateUnitSkills` already applies in `gauntlet/skills.ts`.

The merge is pure:

```ts
mergeDiscovery(state, additions): DiscoveryState | null   // null when nothing is new
```

That `null` is the whole performance story — the save fires only on an actual
discovery, so replaying chapter 1 writes nothing.

## Routing

One route, `src/routes/compendium/+page.svelte`, with all state in the query string:

```
/compendium?tab=units&entry=champion
/compendium?tab=abilities&entry=death_stare
/compendium?tab=units&faction=demon&tier=7
```

Master-detail: filter rail, entry grid, detail panel, driven by
`$page.url.searchParams`. Selecting an entry `pushState`s, so the back button walks
the browsing history and every view is a shareable link — which is what makes the
deep links possible without a second route file or a duplicated detail component.

Two columns on desktop (grid plus sticky detail). Single column on mobile, where
picking an entry swaps the grid for the detail with a back chevron.

### Components

```
src/lib/ui/compendium/
  EntryGrid.svelte      cards, faction/tier/kind filters, text search, Encountered badges
  EntryDetail.svelte    thin dispatcher, one branch per kind
  UnitEntry.svelte
  AbilityEntry.svelte
  ItemEntry.svelte
  FactionEntry.svelte
```

Reused as-is: `Sprite`, `TIER_STYLE`, `ItemIcon`, `skillIconFor`/`skillGlyph`,
`abilityInfo`.

One extraction: `STAT_META` (icon, label, tooltip per stat) is currently private to
`UnitInfo.svelte`. It moves to `src/lib/ui/statMeta.ts` and both import it, so
"⚡ Initiative — determines turn order" reads identically in both places.

`UnitInfo` itself is **not** reused. It takes a battle-time `UnitStack` — current HP,
shots left, spell buffs, the hero's attack folded in — and bending it to accept a
static `CatalogUnit` would make the battle sidebar worse to serve a page that wants
different content. The compendium shows base stats plus gold cost, and no live state.

## Integration

| Site | Affordance |
|---|---|
| Home hub | A `ModeCard`-style entry, plus a fifth slot in the mobile bottom nav |
| Army setup — unit rows | Unit name becomes a link (`ArmySetup.svelte`, the `<p>` at the name) |
| Army setup — faction cards | A `📖` link in the card corner |
| `UnitInfo` — unit name | Link |
| `UnitInfo` — ability labels | Link to the glossary entry |
| Gauntlet draft cards | Link on item and skill names |

Links *into* the compendium carry `target="_blank" rel="noopener"`, so a live battle
is never navigated away from. Links *within* the compendium navigate in place.

Unit rows in `ArmySetup` are `<div>`s, so the name becomes an anchor directly. Faction
cards are `<button>`s — an `<a>` nested in a `<button>` is invalid HTML, so those get
a sibling link positioned in the corner, leaving the primary click unchanged.

The campaign map is **not** linked. That integration was proposed while lore was in
scope; without it, a campaign entry says nothing the node isn't already showing.

## Hooks

**Battle** — in the existing `onMount` in `Battle.svelte`:

```ts
if (!replay) recordSeen({
  units: battle.units.filter(u => !u.isHero).map(u => slugify(u.definition.name)),
  factions: [hero.class],
});
```

`battle` is already resolved at that point whether it came from `initBattle` or an
`initialState`, so campaign, gauntlet, events, and co-op are all covered by this one
call. Replays are skipped — re-watching history should not discover anything.

Fire-and-forget, never awaited, failures swallowed. A missing badge is cosmetic; it
must never be able to interrupt a battle.

**Gauntlet** — items and unit skills record when offered in a draft, so an option the
player passed over is still readable afterwards.

## Testing

Two files, both pure-module, matching how the repo already tests (`environment: 'node'`,
no jsdom).

`src/lib/compendium/__tests__/entries.test.ts`

- Every `CATALOG` unit produces exactly one entry
- Entry ids are unique across all kinds — what guarantees `?tab=&entry=` cannot collide
- Every ability id on any unit def has an `ABILITY_INFO` entry — the regression guard
  for the "keep in sync" comment in `ui/abilities.ts`
- Every `ItemId`, `SkillId`, and faction is covered
- Unit entry stats are read from `CatalogUnit.base`, not transcribed

`src/lib/compendium/__tests__/discovery.test.ts`

- `mergeDiscovery` returns `null` when nothing is new
- Additive, deduplicated, sorted, order-independent
- A save missing a field loads with it defaulted; unknown ids do not throw

No component tests. Adding jsdom and testing-library for one feature is not worth it,
and by design the logic worth testing lives in the pure layer.

## Edits outside the new module

- `SaveSlot` union in `src/lib/net/api.ts` — add `compendium`
- `SLOTS` guard in `server/api.ts` — add `compendium`
- Hero reset path — clear the compendium save so a fresh warlord starts with an empty log

## Out of scope

Lore and any lore data layer. Gating or locked states. Campaign-map links. New art
(skill icons already fall back to glyphs). Discovery toasts — on-sight fires at battle
start, where a "new entry" popup would be noise. A unit-comparison view.
