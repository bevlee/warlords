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

No Playwright browsers are installed; use system Chrome:
`chromium.launch({ channel: 'chrome', headless: true })` with `playwright-core`
installed in a scratch dir (`npm i playwright-core`).

Useful hooks in the battle UI:

- Status line: first `p.text-sm.text-slate-300` — starts with "Your …" on the
  player's turn, "Enemy … are acting…" during AI turns, "Victory!"/"Defeat" at end.
- Reachable cells: `button.bg-emerald-800\/60` (click to move).
- Attackable enemies: `div.grid button:has(div.ring-red-500)` (click to attack/shoot).
- All cells have aria-labels: `"<Unit> ×<count> at col,row"` or `"cell col,row"`.
- `Wait` and `New battle` are role=button by name.
- Unit info panel: the sidebar `dl` — hover any unit's cell to populate it
  (count, HP, attack, defense, damage, speed, initiative, range, shots).
- ATB turn bar: horizontal strip under the board; entries are
  `button[aria-label^="turn "]` ("turn N: <Unit> ×<count>"), current unit
  first. Fast units repeat. Hovering an entry glows the matching field token
  (`div.token-standing.hover-glow`). Waiting re-enters at half a cycle —
  the waiter drops down the bar, it doesn't just go to the back.
- Hover an attackable enemy to reveal `.action-icon` (⚔️ melee/move+attack,
  🏹 shoot) on its cell.
- Melee is two-step: click the enemy → amber origin tiles appear with aria
  labels ending in "attack from here" (`button[aria-label$="attack from here"]`);
  click one to move+attack, click the enemy again to quick-attack, click
  elsewhere to cancel. Shift+click forces melee targeting for shooters.
- Shooters with an adjacent living enemy can't shoot (status says
  "Shooting blocked — enemy adjacent!"; their targets show ⚔️ not 🏹).
- `Defend` button next to Wait: logs "brace for defense", shows a 🛡️ badge
  (`span[title="defending"]`) until the stack's next turn.
- Obstacles: ~7 rocks per battle, `button[aria-label^="obstacle"]`; clicks
  on them are no-ops and pathing flows around them.

Flows worth driving: move a unit, wait, attack an adjacent enemy (check the
retaliation log line), shoot with Orcs, play to Victory (AI acts every 450 ms;
poll status ~every 300 ms, a full battle finishes in ~1–2 min), restart.

- Hero: flank portrait `button[aria-label^="Hero"]` left of the board; on
  "Your hero's turn" every enemy is a target — click one to strike.

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
