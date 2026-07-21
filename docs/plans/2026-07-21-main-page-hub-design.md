# Main Page Hub — Design

Repurpose the main page from a direct campaign drop-in into a **hub** that
routes to three modes: **Tutorial** (onboarding), **Gauntlet** (the solo
roguelite run that already lives at `/gauntlet`), and **Events** (seasonal
co-op PvE). Two layouts carry it — a desktop bento and a mobile stack — plus
the event screen the hub routes into, where party composition happens.

Visual reference (mockup of all three views, desktop + mobile):
`https://claude.ai/code/artifact/d5f1a0dd-e676-4bb7-9556-f6888060db80`.

## Current behaviour

- `src/routes/+page.svelte` owns the whole main mode: `screen: 'setup' |
  'campaign' | 'battle' | 'result'`, the hero, the campaign state, and the
  battle loop. On mount it loads the hero and jumps a returning player
  straight to the campaign map. There is no hub — the campaign *is* the front
  page.
- `src/routes/gauntlet/+page.svelte` is a self-contained roguelite run with
  its own economy (`$lib/gauntlet/run.ts`, `loadRun`/`saveRun`).
- The top bar is a single `<h1>Warlords</h1>` plus a text link to Gauntlet.
  The hero's level and faction surface throughout `ArmySetup`, but the page
  chrome itself carries no profile control.
- Persistence is the `warlords` IDB kv store (`src/lib/storage.ts`):
  `loadHero`/`saveHero`, `loadRun`/`saveRun`, `loadArmy`/`saveArmy`,
  `loadCampaign`/`saveCampaign`.

## Routes

The hub is a thin routing layer; each mode keeps (or gains) its own route so
deep-links and the existing Gauntlet code are untouched.

- `/` — **new hub** (`+page.svelte` rewritten). Reads save state, renders the
  three mode cards, routes on click.
- `/campaign` — the **existing** main-mode flow moved here verbatim
  (setup → campaign map → battle → result). See *Open decisions* — this is
  the one structural call to confirm.
- `/tutorial` — new, guided lessons.
- `/gauntlet` — unchanged.
- `/events` — new, the current season's event screen.
- `/events/[slug]` — a specific event (current or past), including party
  composition.
- `/settings` — new, behind the profile control.

## The hub (`/`)

`+page.svelte` becomes presentational: load state in `onMount`, render, route.
No battle logic remains here (it moves with the campaign to `/campaign`).

**Top bar** — drop level and faction from the chrome entirely. It carries two
things:

- **Gold** — read from `hero.gold`, the wallet added in the main-mode-fixes
  work. Spendable currency is the one number worth persisting in the chrome.
- **Profile** — a single control (avatar + gear) that routes to `/settings`.
  Who you play is decided inside each mode, not advertised in the header.

**Mode cards** — one `ModeCard.svelte`, three instances. Each card's primary
button is *computed from save state*, never a generic "Play":

- **Tutorial** — reads lesson progress; shows a progress bar and
  "Continue lesson →" (or "Start" when unstarted, hidden once complete).
- **Gauntlet** — reads `loadRun()`; "Resume run" + act/node line when a run is
  live, else "New run". Links to `/gauntlet`.
- **Events** — reads the active season; a *teaser only* (countdown + reward),
  button "Enter event →" routing to `/events`. It holds no party state. When no
  season is live it degrades to a quiet "Next event in 3d" card — the hub never
  shows an empty slot.

**Layout** — desktop is a two-column bento: Events takes the tall left cell
because it expires; Gauntlet and Tutorial stack right. Mobile collapses to one
column ordered by urgency (expiring event → resumable run → onboarding) with a
sticky bottom nav (Home / Learn / Events / Profile) in the thumb zone. This is
a single grid-to-flex swap on one breakpoint — no duplicate markup.

## Events (`/events`, `/events/[slug]`)

The mode with the most new surface. Two responsibilities: show *one* event and
let a party form.

**Event screen** — briefing on one side (description, countdown, modifiers,
reward), party composition on the other. The only navigation out is "← Hub" and
a single **Past events** link; there is no mode switcher, so focus stays on the
fight in front of you.

**Party composition** lives here and only here — the hub card never had it:

- Up to four seats (`PartyRoster.svelte`): the local player (Leader), filled
  seats with ready state, and open seats offering **Invite** / **Find
  teammates** (matchmaking).
- A **Ready — start siege** primary action, enabled once the party is ready.
- Seat/ready/invite state is per-session party state, not part of the hero
  save.

**Past events** — a lightweight archive behind one link: finished seasons, the
rewards earned, and re-entry to `/events/[slug]` for read-only detail. A
doorway, not a competing headline.

**Season data** — the current season (slug, name, copy, countdown end,
modifiers, reward, wave config) comes from an events service. For the UI track
this is a typed `EventSeason` model backed by a stub/mock loader
(`$lib/events/season.ts`) so the whole screen is buildable and testable without
a backend. Real season scheduling and, critically, **co-op PvE multiplayer**
(matchmaking + netcode/authority for a shared battle) are a separate backend
track — see *Out of scope*.

## Tutorial (`/tutorial`)

Guided lessons over the existing battle engine. Progress is a small persisted
record (`loadTutorialProgress`/`saveTutorialProgress` in `storage.ts`, key
`tutorial`): `{ completed: string[]; next: string }`. The hub card and the
`/tutorial` index both read it. Lesson content itself (scripted boards,
prompts) is scoped as its own follow-up; this plan covers the routing, the
progress model, and the hub surfacing.

## Profile & settings (`/settings`)

Replaces the faction avatar. Two groups:

- **User settings** — display name, avatar.
- **Game settings** — audio, animation/reduced-motion, and the existing
  **Reset progress** action (today buried in `ArmySetup` as `onreset` →
  `handleReset`; it moves here, where destructive account actions belong).

## Shared components & tokens

New, mode-agnostic, reused across hub and event screen:

- `ModeCard.svelte` — accent rail, kicker, title, state slot, primary button.
- `HubTopBar.svelte` — gold + profile.
- `Countdown.svelte` — days/hrs/min, `tabular-nums`, ticks client-side.
- `PartyRoster.svelte` — the four-seat composition list.
- `Countdown` and the accent colours key off a small token set: Events
  frost/violet, Gauntlet amber, Tutorial sky. One accent per mode, carried from
  the hub card into that mode's own screens as wayfinding. Semantic colours
  (gold, victory-emerald, defeat-rose) stay separate from the mode accents.

Tokens live in `tailwind.config.js` `theme.extend.colors` (currently empty) so
both the hub and the mode screens pull the same values.

## Responsive

- Desktop bento and mobile stack are the *same components*, re-flowed at one
  Tailwind breakpoint (`sm`/`md`). No separate mobile route.
- Every mobile card exposes exactly one full-width primary button (≥44px
  target); desktop may add a secondary (e.g. Gauntlet "New" beside "Resume").
- Navigation: top-right controls on desktop, sticky bottom nav on mobile.
- Screens render dark by design (the game's committed look); no light variant
  for the app itself.

## Testing

- `season.ts`: countdown math (days/hrs/min from an end timestamp), live vs.
  between-seasons state selection.
- `storage`: `tutorialProgress` round-trips; hub reads Gauntlet run + tutorial
  progress + season without throwing when any is absent (fresh player).
- Hub logic: each card's computed primary action given state — no run → "New",
  live run → "Resume"; unstarted/mid/complete tutorial; live/absent season.
- Browser verification (`/verify`): fresh player sees all three cards with
  first-run copy; start a Gauntlet run, return to hub, card shows "Resume";
  enter the event, fill a seat, ready up; profile routes to settings and reset
  returns to a fresh hub. Check the mobile breakpoint (bottom nav, single
  primary per card).

## Open decisions

- **Where the current campaign goes.** This plan moves the existing
  setup/campaign/battle flow to `/campaign` and makes `/` a pure hub, which is
  the smallest, safest change — no engine code moves, only its route. The
  alternative is to fold the campaign into **Tutorial** as its guided content
  and retire the standalone campaign. That's a bigger product call; confirm
  before implementation, since it decides whether `/campaign` exists at all.

## Out of scope

- **Co-op PvE multiplayer** — matchmaking, party sync, and shared-battle
  authority/netcode. The UI is built against a stubbed events/party service;
  real multiplayer is its own track and gates actually *playing* an event.
- **Season content authoring** — the tooling/schedule that defines seasons;
  this plan consumes a season, it doesn't author one.
- **Tutorial lesson content** — the scripted boards and prompts; this plan
  covers routing, progress persistence, and hub surfacing only.
- **Gauntlet internals** — unchanged; the hub only links into it.
