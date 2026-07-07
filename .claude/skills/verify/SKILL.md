---
name: verify
description: Build, launch, and drive the Warlords battle UI to verify changes end-to-end
---

# Verifying Warlords

SvelteKit + Vite app; the whole game runs client-side (no backend).

## Launch

```bash
npm run dev -- --port 5199   # background; ready when curl localhost:5199 → 200
```

## Drive (headless Chrome via playwright-core)

The app opens on the **army setup screen**: stepper buttons
`button[aria-label="add 5 Goblin"]` etc., gold in the first
`span.text-amber-300`, then `Start battle` (role=button; disabled until
something is bought). Battles end with "New battle" (same armies, new seed)
or "Change army" (back to setup, fresh generated enemy).

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
- Actions are circular icon buttons at the top-right of the battlefield:
  `Wait` ⏳, `Defend` 🛡️, `Spellbook` 📖 (hero turn only; opens the book panel —
  role=dialog 'Spellbook', spells are `Cast <Name>` buttons with hover
  role=tooltip descriptions, ✕ is 'Close spellbook', backdrop click closes), `Forfeit` 🏳️, plus the speed pills — all role=button by
  aria-label. The status line + last two log lines sit in a translucent
  top-center strip (`p.text-sm.font-medium.text-slate-100` is the status
  now); the full BattleLog panel is gone.
- Unit info panel: the sidebar `dl` — hover any unit's cell to populate it
  (count, HP, attack, defense, damage, speed, initiative, range, shots).
- ATB turn bar: horizontal strip under the board; entries are
  `button[aria-label^="turn "]` ("turn N: <Unit> ×<count>"), current unit
  first. Fast units repeat. Hovering an entry glows the matching field token
  (`div.token-standing.hover-glow`). Waiting re-enters at half a cycle —
  the waiter drops down the bar, it doesn't just go to the back.
- Shooters with an adjacent living enemy can't shoot (status says
  "Shooting blocked — enemy adjacent!"; their targets show ⚔️ not 🏹).
- `Defend` button next to Wait: logs "brace for defense", shows a 🛡️ badge
  (`span[title="defending"]`) until the stack's next turn.
- Obstacles: ~7 rocks per battle, `button[aria-label^="obstacle"]`; clicks
  on them are no-ops and pathing flows around them.

Flows worth driving: move a unit, wait, attack an adjacent enemy (check the
retaliation log line), shoot with Orcs, play to Victory (AI acts every 450 ms;
poll status ~every 300 ms, a full battle finishes in ~1–2 min), restart.

- Hero: flank portrait `button[aria-label^="Hero"]` left of the board (mana
  in `span.text-sky-300`); on "Your hero's turn" every enemy is a target —
  click one to strike, or use the violet spell buttons (Lightning/Bloodlust/
  Stoneskin by role=button name) then click a highlighted stack to cast.

Gotchas: capture `pageerror`/console errors; a stray dev-only 404 (Chrome
devtools probe) is environment noise, not a bug.

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
(3 unit cards, click one) → map. Run persists in IndexedDB key `gauntletRun`
(kv store) — but note each Playwright launch is a fresh profile, so
persistence checks must reload within one browser session. To test late-run
states, inject a crafted RunState into idb via page.evaluate and reload.
