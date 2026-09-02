# Run screen redesign

The gauntlet page is the only thing `/` links to, yet it presents itself as one
mode among many and spends most of its width on things that no longer change.
This redesign makes it the game's main screen: the run, the hero's kit, the
artifacts and the army, each at a size you can read.

## What was wrong

- **"Warlords — Gauntlet"** titles a mode that has no siblings. `/` offers a
  single Play button, pointing here.
- **Acts are decoration.** Three headings sit over a reversed list of ten
  identical rows. Nothing distinguishes node 4 from node 3 except a skull.
  The data is better than the display: act boundaries land exactly on the
  bosses (3 / 7 / 10) and each act raises the enemy tier ceiling (3 → 5 → 7).
- **The army is a footnote** — 24×28px sprites in a 224px sidebar, plus a
  redundant `48× Skeleton · 12× Zombie` text strip.
- **Artifacts are unreadable.** They are now conditional prose
  ("[[area_shot]] hits for 65% of a normal shot"), rendered as one line of
  10px mono.
- **Level and stats mean nothing.** `hero.attack`/`defense` are frozen at 2/1
  for a whole run; nothing spends `statPoints`. Faction skills have since been
  retired entirely.

## Decisions

1. No mode branding. The page is **WARLORDS**; the run's identity is the act.
2. The screen is four full-width bands, not a sidebar: **act → hero →
   artifacts → army**. Draft picks mount as a fifth band above them.
3. Terminology is **artifacts** and **army**. Not items, gear, warband or loot.
4. Hero level, hero attack/defence and stat points leave the UI. What stays is
   what the hero can *do*.
5. Units, artifacts, abilities and keywords link through the compendium
   popover, the same interaction combat uses.

### Already landed

- `veterancy` → `enemyBonus` throughout, including the two player-facing
  strings. "Veterancy" was jargon for "the enemy gets stronger as the rank
  climbs".
- Bloodlust and Stoneskin leave the wizard's default book, which is now
  Lightning alone. Both spells still resolve if something grants them.
  `SpellBook` had been listing the three original spells regardless of what
  the hero knew, and now filters by `hero.spells`.

## The bands

### Act

Cleared acts collapse to one line: numeral, name, `cleared`, and the boss that
ended them. The current act expands — its name, what changed in plain words
("Enemies now field up to tier 5"), and its 3–4 nodes as pips: cleared, current,
unfought, boss. The boss pip always sits last, terminating the act.

The current node is a card, not a pip:

```
● BATTLE 5 · RANK 5
Demon army — ~275 power · 4 stacks · enemy bonus +2 ⚔/🛡
[Imp ×24] [Hell Hound ×9] [Succubus ×6] [Efreet ×2]      [ FIGHT ⚔ ]
```

Showing the enemy's actual stacks costs nothing: `generateGauntletEnemy` is
deterministic on the run seed, and the page already calls it to render the row.
Scouting before committing also gives the deployment screen a reason to exist.

Locked acts are one dim row with the name only. Endless replaces the band with
an Act IV-styled panel ("Beyond the Citadel — Depth 3") over the same node card.

### Hero

Answers one question: what can my hero do in a fight? Faction skills no longer
exist, so this is hero actions, each as a row of name, kind chip, the full
`description`, and a dim `targetingLabel · duration` line. No icons — main
removed `HeroActionView.icon` deliberately.

`heroActionViews` reads only two things off `BattleState`: owned artifacts and
use counters. Extract a pure `heroActionsFor(hero, artifactIds)` that both the
battle sheet and this band call, passing `run.items`. Artifact upgrades then
read honestly on the run screen — owning Bronze War Horn makes Charge say
*+4 Speed · +40%* before the fight rather than during it.

The wizard has no hero actions. Its band shows Lightning with its mana cost and
its current mana ceiling, which now scales with run depth (`5 + 3 × depth`).

### Artifacts

Cards, roughly 280px, three or four to a row:

```
┌──────────────────────────────────┐
│ Barbed Volley             RARE   │
│ ⟶ Archer                         │
│ Area shot survivors lose 2       │
│ Defence until their next turn.   │
└──────────────────────────────────┘
```

Name and a rarity chip — rarity as a legible tag, not a border colour to
decode — then a linked unit chip built from `requiresUnit` (structured data, no
prose editing), then the effect at readable size with keywords live. An
artifact whose unit is not in the army shows a dim "no Archer in your army"
state, which is invisible today.

### Army

Header: `ARMY — 4 stacks · 420 power`.

Each stack is a `UnitInfo size="large"` card — the same panel combat shows when
you click a stack — passed `items={run.items}`. That brings compendium links,
tier styling, stats, abilities, taught unit skills, and, through
`artifactInteractionsFor`, the artifacts that apply to that unit rendered
inside its own card. The run screen stops having a second, worse vocabulary for
units.

### Draft

Not a separate screen. When picks are pending, a draft band mounts **above** the
act band and the rest of the page stays put, so the army and artifacts you are
drafting into remain on screen. The act band's FIGHT button is disabled until
every pending pick is resolved.

```
BATTLE 4 WON — ACT II
[ 1 Reinforcements ]──[ 2 Artifact ]──[ 3 Skill ]
```

Steps tick as they are taken, replacing the "Pick one of each" footnote. Unit
cards are the same `UnitInfo` card as the army band; artifact cards are the
same card as the artifacts band.

## Cut from the page

Hero level, the `⚔2 🛡1` line, faction-skill list, the reversed node list, the
`Your army:` text strip, the 📖 external-tab compendium links (the popover
replaces them), and the four-paragraph "How the Gauntlet works" footer, which
moves behind a `?` in the header.

## Notes

- Unit skills stay: a real choice every third win, shown on the unit's card.
- `MAX_STACKS` is 10 but a run cannot approach it, so the header states the
  count plainly rather than a fraction.
