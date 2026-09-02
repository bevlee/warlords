# Changelog

Notable changes to Warlords. Anything before the first entry below is in the git history only.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- **Title screen at `/`.** The default page is now a title screen for the gauntlet: the wordmark, a
  single play button, and quiet links to the compendium and battle history. The button reads
  `Resume` and names the run's faction and node while a run is live.
- **Battle speed is remembered.** `battleSpeed` joins the saved profile (`src/lib/profile.ts`), so
  the cog on the title screen, the cog inside a battle, and `/settings` all read and write one
  value and it holds between battles instead of resetting to normal each fight.
- **A rules section on `/gauntlet`.** "How the Gauntlet works" sits at the foot of the page, out of
  the way during a battle: the ten nodes and their bosses, the enemy difficulty curve and veterancy,
  that your whole army returns at full strength between fights, what each win pays out, and Endless.
- **Legacy hub at `/legacy`.** The former multi-mode home page — seasonal event, campaign, gauntlet,
  and compendium cards — is preserved at its own route, with a banner pointing at the new home.

- **Keyword tooltips.** Game terms in effect text are hoverable: the card names the term, gives its
  effect line, and links to the full compendium entry. Terms inside the card can be followed in
  turn, swapping it in place with a back crumb. Live wherever effect text appears — the compendium,
  the gauntlet draft, army setup, recruit rows, and the battle HUD. Descriptions carry the terms as
  `[[…]]` markup (`src/lib/compendium/keywords.ts`); tests fail on a marker that resolves to
  nothing, and on any component that renders a description without going through `KeywordText`.
- **An Artifacts section in the compendium.** The Items tab is now Artifacts, grouped by how you
  obtain them — starting, per-faction, legacy — and filterable by faction and rarity. An artifact's
  entry names the faction that drafts it and the units that unlock it.

### Changed

- **The run screen is four full-width bands** — act, hero, artifacts, army — instead of a page of
  rows beside a 224px sidebar. The army shows as full unit cards, the same panel a battle shows when
  you click a stack, with the artifacts that act on each unit inside its own card; artifacts read as
  cards with a rarity chip and their required unit as a linked term, rather than a sentence of 10px
  mono. Drafts mount above the bands rather than replacing them, so the army and artifacts you are
  drafting into stay on screen while you choose.
- **Acts mean something.** Act boundaries always landed on the bosses and each act always raised the
  enemy tier ceiling; the screen now says so. A cleared act collapses to one line, the current act
  expands with its nodes as pips ending on its boss, and a locked act is a name and a lock.
- **The next encounter shows the enemy's stacks** — who they are, how many, and their faction —
  instead of a strength figure. Generating them is deterministic on the run seed, so scouting the
  fight before committing to it costs nothing.
- **The hero's kit is readable between battles.** The run screen lists its actions with full
  descriptions, targeting and duration, and reflects artifact upgrades — a Barbarian holding Bronze
  War Horn reads "+4 Speed · +40%" before the fight, not during it. `heroActionsFor(hero, artifacts)`
  is the pure half of `heroActionViews`, shared with the battle's hero sheet.
- **"Enemy Veterancy" is now "Enemy bonus"**, in the field, the function, the props and the two
  strings a player reads. It was jargon for "the enemy gets stronger as the rank climbs".
- `/campaign` and `/events`, reachable only from the legacy hub, link back to `/legacy` rather than
  to `/`.
- `HubTopBar` takes a `home` prop so its wordmark leads to whichever hub renders it.
- The gauntlet's faction-select blurb is one line; the detail moved to the rules section.

- **Artifacts that modify an ability now give both numbers.** "Focus Fire arrows gain 35% per
  consecutive hit instead of 25%, up to 140% instead of 100%", rather than a bare new figure with
  no baseline to compare against. See `docs/artifact-text-clarity-audit.md` for the full audit.
- **ATB is gone from player-facing text.** Descriptions say what it buys instead: "acts again
  immediately", "back into the order twice as soon", "brings its next turn 10% sooner".
- **The battle log reads as sentences.** 21 of the engine's 34 status effects printed their raw id
  ("affected by follow_through"). Damage now names its source, target first — "Wild Knights take 55
  damage from Thunder Dive" — with the ability hoverable, and a shooter's splash names the ability
  that caused it rather than logging a generic "splash".
- `EntryFilters` is total: every field holds a real value, and an unrecognised query parameter reads
  as "all" rather than as a filter that silently matches nothing.

### Fixed

- **An icon that content blockers ate.** `count.png` matched EasyPrivacy-style tracking-pixel
  filters, so privacy browsers blocked it; because the icons are globbed eagerly, one blocked asset
  failed the whole module and took the route's dynamic import with it. Renamed to `units.png`, with
  a test that fails on any asset named like blocker bait.
- The compendium no longer tells you the fifteen legacy stat artifacts are "offered during a
  gauntlet run" — nothing can draft them, and they are now grouped and labelled as such.

### Removed

- **Power figures on the run screen.** The army's total and the encounter's `strength ~N` are gone.
  Nothing in the game interacts with the number, and it counts none of the things that decide a
  fight — artifacts, unit skills, hero actions, the enemy bonus — so comparing two of them was
  confidence the figure could not support. `encounterBudget` and `armyCost` still size encounters
  and drafts behind the screen; the enemy's stacks are what the player reads instead.
- **Hero level and stats on the run screen.** A run's hero never spent a stat point and never moved
  off 2 Attack / 1 Defence, so the line reported nothing. The hero band shows what the hero can do.
- **Bloodlust and Stoneskin from the wizard's default spellbook**, which is now Lightning alone.
  Both spells still resolve if something grants them; `SpellBook` had been listing all three
  regardless of what the hero knew, and now filters by the hero's own book.
- **Faction skills.** Each faction once had three skills that levelled with the hero and quietly
  scaled damage, morale, mana and deployment. They were superseded by hero actions and artifacts —
  things a player picks and can see — and nothing had granted one since, so every hero ran with a
  skill level of 0 and every bonus helper was an identity function. The compendium tab advertising
  twenty of them is gone, along with the dead engine code. `Hero.factionSkills` stays on the type so
  heroes saved before the change still load; it is never populated.


- The `← main game` link beside the gauntlet page title.
