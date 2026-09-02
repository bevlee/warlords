# Keyword tooltips design

Hovering a game term anywhere in the UI opens a small card explaining it, so a
player meets a mechanic where they are confused by it rather than having to go
looking. The same system makes cross-referencing cheap: text can name a term
exactly and link it, instead of inventing a word for it.

This is the direct answer to root cause 4 in the
[artifact text clarity audit](../artifact-text-clarity-audit.md) — six terms that
appear only in artifact text and are defined nowhere a player can reach.

## Decisions

| Question | Decision |
| --- | --- |
| Where | Everywhere: compendium, gauntlet draft, army setup, recruit rows, and the battle HUD |
| How keywords are found | Explicit `[[…]]` markup in the source strings, not auto-matching |
| Coupled to the errata rewrite? | No. Tooltips ship first; markup is added per faction afterwards |
| Touch | Tap opens, tap-away closes. Nothing navigates by accident |
| Popup contents | Term name, its effect line, and a link to the full compendium entry |
| Nesting | The popup is enterable; inner keywords swap it in place with a back crumb |

## Markup

Keywords live in the description strings themselves:

```ts
f('barbarian', 'butchers_pennant', "Butcher's Pennant", 'rare',
  'A kill on an [[banner_of_the_first_raid|empowered]] turn also empowers that stack’s next turn.'),
```

`[[id]]` shows the entry's own name. `[[id|display text]]` shows the second half
instead — this is what lets prose keep reading naturally while still pointing at
the canonical term, and it is why auto-matching was rejected: the sentence
almost never contains the exact name.

`[[kind:id]]` disambiguates. Entry ids are unique within a kind, not globally,
and gauntlet skills deliberately share ids with the abilities they grant. A bare
id resolves by fixed precedence — ability, item, unit, spell, faction skill — so
`[[focus]]` is the ability and `[[unitSkill:focus]]` is the draft card.

## Parser

`src/lib/compendium/keywords.ts`:

- `parseKeywords(text): Segment[]` splits a string into plain runs and resolved
  tokens `{ kind, id, label }`. An unresolvable marker degrades to its display
  text, so a bad id reads as ordinary prose rather than raw brackets.
- `stripKeywords(text): string` flattens markers to display text, for the dozen
  places that render descriptions into `title=` attributes and aria-labels,
  which cannot hold components.

Both memoise on the input string in a module-level `Map`. Descriptions are
static and the battle screen re-renders often.

## Components

**`Keyword.svelte`** — the trigger. A `<button>`, not a link, with a dotted amber
underline that inherits the surrounding text size; no inline badges or icons, or
dense panels like `UnitInfo` turn into confetti.

**`KeywordPopup.svelte`** — one instance, mounted in `+layout.svelte`, driven by a
small store. Dozens of keywords on a screen must not each mount a card. Built on
the native Popover API for its top-layer rendering, which a scrolling panel or
the tilted battle board cannot clip. Placement is `getBoundingClientRect`
clamped to the viewport, about thirty lines and no dependency.

> **Corrected during implementation.** This design said `popover="auto"` would
> give light-dismiss and Esc for free. It does — but it also counts the very
> click that opens the card as an outside click and closes it again, so
> tap-to-open never worked. The popup uses `popover="manual"` and owns its own
> dismissal: a `pointerdown` listener registered on the next animation frame,
> so the opening gesture is over before it starts watching, plus a `keydown`
> listener for Esc. Roughly fifteen extra lines for behaviour that is now
> deterministic on both mouse and touch.

**`KeywordText.svelte`** — takes a string, runs `parseKeywords`, renders plain runs
as text and keyword runs as `Keyword`.

## Nesting

The popup renders its own effect line through `KeywordText`, so resolution is
recursive by construction. Only the interaction needed deciding.

The popup is **enterable**: `mouseleave` starts a 200ms close timer that entering
the popup cancels. This is the safe-bridge pattern used by GitHub's hovercards
and Wikipedia's page previews, and it means the popup's link and inner keywords
are reachable with no pin gesture at all.

Clicking a keyword inside the popup **swaps its content in place** and grows a
`‹ back` crumb. Hover opens the first card; click drills. Depth is unlimited but
there is only ever one card on screen.

Stacking cards instead was rejected. The pool already contains cycles —
Butcher's Pennant → Banner of the First Raid → Map of the First Raid → Banner of
the First Raid, and Endless Quiver → Wayfarer's Compass → back. A back stack
handles those for free; a tower of cards does not, and it runs off the bottom of
a phone by the third level.

Pinning via right-click was also considered and rejected. Tap-to-open already
makes every touch popup sticky, so a pinned/ephemeral distinction would exist
only on desktop, and "inner keywords are hoverable only once pinned" would be a
rule that is true on one platform and meaningless on the other. It also costs a
`preventDefault` on the context menu, and its touch equivalent is the long-press
already rejected for the primary interaction.

## Behaviour

**Timings.** 150ms before opening on hover so a cursor sweeping a sentence does
not strobe; 200ms before closing, cancelled by entering the popup. Click and tap
open immediately.

**Keyboard.** `aria-expanded` on the trigger. Enter or Space opens, Esc closes and
returns focus. Only *keyboard* focus opens the card, tested with
`:focus-visible` — a mouse click focuses the button before it fires `click`, so
opening on every focus would let the click that follows toggle the card shut
again. A keyboard-opened popup takes focus; a hover-opened one does not.
This is required because the popup is a shared instance in the layout, so its
DOM position does not follow the trigger and tab order would otherwise jump to
the end of the page. `role="dialog"`, not `role="tooltip"` — it contains a link,
and interactive content is not allowed in a tooltip.

**Battle.** The popup closes on any dispatched action, so it cannot sit over the
board mid-turn. Keywords appear only in text panels, never on grid tiles, so
hover-to-show-movement-range is untouched.

## Integration

Mechanical once the components exist. `{info.description}` becomes
`<KeywordText text={info.description} />` at roughly fifteen sites: `UnitInfo`,
`ActionDock` passive descriptions, `ArtifactStrip`, `RecruitRow`, `ArmySetup`,
`FactionSelect`, `UnitEntryView`, `EntryDetail`, and four spots on the gauntlet
page including the draft cards. The six `title={…description}` attributes become
`title={stripKeywords(…)}`. `EntryCard`'s subtitle strips rather than renders —
it is a single truncated line, and truncating around live components is a mess.

## Testing

Parser unit tests: plain text passes through untouched, `[[id]]` and
`[[id|label]]` both resolve, `[[kind:id]]` picks the right kind, an unresolvable
marker degrades to its display text, and `stripKeywords` leaves no brackets.

The test that keeps this alive: walk every description in `ITEMS`,
`ABILITY_INFO`, `UNIT_SKILLS`, `FACTION_SKILL_DEFS` and `SPELL_TEXT` and fail on
any marker that does not resolve to a real entry. Rename an id and CI names the
lines to fix, in the same spirit as the existing entry-coverage tests.

## Rollout

Three commits, each shippable on its own:

1. Parser and tests. No markup in any string yet, so nothing changes on screen.
2. Components and the layout mount, wired into the compendium only.
3. The remaining fourteen render sites, then markup added to the strings one
   faction at a time.

## What shipped

All three steps, plus the errata rewrite folded in after all — once the strings
were being edited for markup, restating each artifact's effect as an explicit
*from x% to y%* was the same pass.

Two render sites the design missed were caught by the leak guard rather than by
review: `SpellBook`'s spell effect line, and the spell branch of `EntryDetail`.
The guard also flagged `ModeCard`, reached only through a prop three files away.
It earned its place on the first run.
