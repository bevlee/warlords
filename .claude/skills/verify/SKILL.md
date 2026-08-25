---
name: verify
description: Build, launch, and drive the Warlords battle UI to verify changes end-to-end
---

# Verifying Warlords

SvelteKit + Vite app. The game simulation runs client-side, but saves now live
on the server: `npm run dev` also mounts the save API (`/api/session`,
`/api/save/:slot`) backed by SQLite at `data/warlords-dev.db`. Delete that file
for a clean first-run state; the client's session token is in `localStorage`
under `warlords.session`. Reads of an absent save answer 404 — two of them show
up as console errors on a first load, which is expected, not a bug.

## Launch

```bash
npm run dev -- --port 5199   # background; ready when curl localhost:5199 → 200
```

## Drive (headless Chrome via playwright-core)

`/campaign` opens on the **faction screen** (first run only: six cards, then
`Begin campaign`), otherwise straight to the **map** — the mode's home. A
chapter node leads to the **encounter screen**: brief, the enemy army it will
actually field, and recruiting. Recruiting is one `input[type=range]` per unit
(`aria-label="<Unit> count"`), flanked by `one more/one fewer <Unit>` buttons;
its `max` is the row's count plus whatever the unspent gold buys, so it moves
as other rows change. Then `Start battle` (disabled until something is bought).
Battles end on a result screen whose only exit is `Continue` → map. Faction is
fixed for the campaign; `Reset hero` on the map (two-step confirm) is the only
way to change it.

`/coop` still uses the older `ArmySetup` with `add 5 <Unit>` stepper buttons.

No Playwright browsers are installed; use system Chrome:
`chromium.launch({ channel: 'chrome', headless: true })` with `playwright-core`
installed in a scratch dir (`npm i playwright-core`).

Useful hooks in the battle UI:

- Status line: first `p.text-sm.font-medium.text-slate-100` — starts with "Your …" on the
  player's turn, "Enemy … are acting…" during AI turns, "Victory!"/"Defeat" at end.
- Reachable cells: `button.bg-slate-500\/50` — the darker "range blob"
  (click to move; cursor stays the default arrow).
- Enemy stacks: `div.grid button:has(span.bg-red-700)` (red count plate);
  player stacks have `span.bg-sky-700`. There are no target rings anymore.
- **Melee is aim-by-cursor**: hovering an attackable enemy shows a sword
  cursor and a red-edged landing tile picked from the cursor's position
  (`.cell.aim-origin` + `.aim-arrow`); clicking executes move+attack in one
  go. A Playwright `click` works because it mouse-moves first (aim resolves
  before the press). Shooters are single-click (bow cursor); Shift forces
  melee. A damage forecast (`.preview`, 💀 kills / 💥 damage) floats by the
  hovered target.
- All cells have aria-labels: `"<Unit> ×<count> at col,row"` or `"cell col,row"`.
- **Layout is three horizontal bands** inside `div.battle-screen`, which sizes
  itself to the space left below the page header and publishes `--fx` (a
  viewport-derived "scaled pixel"). Everything is a multiple of `--fx`, so
  never assert absolute pixel sizes.
  1. `.atb-band` — the ATB ribbon (see below).
  2. `.battle-middle` — `.flank` (settings/auto-battle/hero) · `.board-column`
     (status strip + board + overlays) · `.info-rail` (creature info).
  3. `.dock-band` — `.dock` (action dock) + `.log-slot` (battle log).
- Action dock (`div.dock`, bottom-left): the active stack's portrait, name,
  ×count and HP bar; then `Wait` ⏳ and `Defend` 🛡️
  (`button[aria-label="Wait"|"Defend"]`); then three circular active-ability
  slots — all dashed placeholders for a normal stack, with the first becoming
  `button[aria-label="Spellbook"]` on the hero's turn (opens the book panel —
  role=dialog 'Spellbook', spells are `Cast <Name>` buttons with hover
  role=tooltip descriptions, ✕ is 'Close spellbook', backdrop click closes);
  then the active stack's passive abilities in `.passive-list`, which scrolls
  while its `PASSIVE ABILITIES` caption stays pinned to the dock's bottom edge.
- Left flank: a ⚙️ `button[aria-label="Settings"]` opens a popover
  (`.settings-popover`) with the combat-speed pills and `Resign`, and a
  permanently-disabled `button[aria-label="Auto battle"]` sits beside it (a
  placeholder — nothing is wired to it). The hero is a bare sprite at the foot
  of the same column (`button[aria-label^="Hero"]`); hovering it fills the
  creature rail with hero rows (Level, Mana x/y, XP…).
- Status line: `p.status-text` (still carries `.text-sm.font-medium.text-slate-100`)
  in the strip above the board.
- Creature-info rail (`.info-rail`, right of the board): hover any unit's cell
  to populate it (count, HP, attack, defense, damage, speed, initiative, range,
  shots) — single-column rows. Right-click pins it (amber border + × unpin);
  Esc unpins.
- Battle log (`.log-slot`, bottom-right, hidden under 1024px): recent lines,
  sticks to the bottom. Its `Expand` button opens the full history in a modal
  (`div[role=dialog][aria-label="Battle log"]`); backdrop click, the × button,
  or Esc closes it.
- ATB turn bar: the chevron ribbon at the TOP of the screen, with a round
  medallion (`RND` / number) on the left and `button[aria-label^="Scroll turn
  order "]` arrows at both ends — always rendered, disabled when the strip
  already fits. Entries are `button[aria-label^="turn "]`
  ("turn N: <Unit> ×<count>"), current unit first. Fast units repeat. Hovering
  an entry glows the matching field token (`div.token-standing.hover-glow`).
  Waiting re-enters at half a cycle — the waiter drops down the bar, it
  doesn't just go to the back.
- Shooters with an adjacent living enemy can't shoot (status says
  "Shooting blocked — enemy adjacent!"; their targets show ⚔️ not 🏹).
- `Defend` button next to Wait: logs "brace for defense", shows a 🛡️ badge
  (`span[title="defending"]`) until the stack's next turn.
- Obstacles: ~7 rocks per battle, `button[aria-label^="obstacle"]`; clicks
  on them are no-ops and pathing flows around them.

Flows worth driving: move a unit, wait, attack an adjacent enemy (check the
retaliation log line), shoot with Orcs, play to Victory (AI acts every 450 ms;
poll status ~every 300 ms, a full battle finishes in ~1–2 min), restart.

- Hero: flank portrait `button[aria-label^="Hero"]` at the foot of the left
  column; on "Your hero's turn" every enemy is a target —
  click one to strike, or use the violet spell buttons (Lightning/Bloodlust/
  Stoneskin by role=button name) then click a highlighted stack to cast.

Gotchas: capture `pageerror`/console errors; a stray dev-only 404 (Chrome
devtools probe) is environment noise, not a bug.

**Polling loops that also click**: action buttons (Wait/Defend) disable
during every animation beat, and a Playwright `click` with the default
timeout blocks ~30 s on a disabled button — a poll-and-click loop then
spends the whole battle stalled inside click auto-wait and misses every
transient (`.sliding`/`.striking` standees, `.fx-text`). Always click with
`{ timeout: ~250 }` + `.catch(() => {})` inside sampling loops.

**Combat animations** (beat = STEP_DELAY_MS: 700/450/200 by speed): during
a move beat the moving standee has `.token-standing.sliding`; during an
attack/retaliate beat the attacker has `.token-standing.striking` (lunge
toward the target, `--strike-x/--strike-y` vars). Damage/buff/status text
floats in `.fx-text` elements. Set combat speed to `slow` and sample every
~90 ms to catch these.

**Clicking the tilted board**: standees are clickable and lean over the cell
behind them, so never click cells/targets at their bounding-box center —
Playwright either times out ("subtree intercepts pointer events") or, worse
historically, the click silently vanished. Click cells on their visible top
strip and rotate through candidates on retries:

```js
async function clickTop(loc) {
  const box = await loc.boundingBox();
  return loc.click({ position: { x: box.width / 2, y: Math.min(8, box.height / 4) } });
}
```

Never reintroduce `pointer-events: none` on elements inside the 3D-transformed
board subtree — Chromium's real-input hit-testing goes inconsistent with
`elementFromPoint` and clicks land on the wrong cell (that was the cause of a
whole class of "click does nothing" stalls).

## Gauntlet mode (`/gauntlet`)

Roguelite run: faction select (6 cards) → 10-node map (`Fight ⚔️` on the
current node, bosses at 3/7/10) → battle (Continue on the overlay) → draft
(3 unit cards, click one) → map.

**Every battle opens in a deploy phase** — the turn loop is frozen and the
status strip is replaced by a banner until you click
`getByRole('button', { name: 'Begin battle ⚔️' })`. Any driver that waits
for "Your …" turn text without clicking Begin first will idle forever. Run persists server-side under save slot
`gauntletRun` — each Playwright launch is a fresh profile (new
`localStorage`, hence a new session token and an empty save set), so
persistence checks must reload within one browser session. To test late-run
states, `PUT /api/save/gauntletRun` a crafted RunState with the page's token
via page.evaluate, then reload.
