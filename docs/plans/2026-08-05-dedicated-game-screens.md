# Dedicated Game Screens

## Status

Proposed implementation specification.

## Summary

Major game modes should own the whole application viewport while active. A
battle is not a card embedded below a page heading and is not a translucent
modal over another menu. It is an opaque, dedicated game screen that replaces
the current mode visually until the player exits or the battle resolves.

Introduce a shared `GameScreen` shell and render `Battle` inside it as the only
active screen content. Remove `Battle.svelte`'s knowledge of document position,
host `<main>` padding, page scrolling, and remaining page height. Battle scaling
will use the viewport directly.

This first change keeps battle state in the existing Campaign, Gauntlet, Co-op,
and Replay route components. It does **not** add a new `/battle` route or move
transient state into a global store. A dedicated screen is a rendering and
layout boundary here, not necessarily a URL boundary.

## Problem

`Battle.svelte` is currently rendered inside padded `<main>` elements owned by
four different hosts:

- `src/routes/campaign/+page.svelte`
- `src/routes/gauntlet/+page.svelte`
- `src/routes/coop/+page.svelte`
- `src/routes/history/[id]/+page.svelte`

Because the battle does not own its viewport, `measureFit()` must:

1. Read the battle element's document-space top.
2. Find its nearest `<main>`.
3. Read the host's computed bottom padding.
4. Calculate the height remaining below page chrome.
5. Write that height back onto the battle root.
6. Re-measure after a frame in case fonts or images shifted the page.

This couples a reusable game component to unrelated host markup and makes every
new battle host another implicit layout contract. The comments required to
explain feedback safety are evidence that the ownership boundary is wrong.

## Goals

- Battle occupies one opaque application viewport while active.
- No campaign, gauntlet, co-op, or replay page header remains in normal document
  flow around the battle.
- `Battle.svelte` does not inspect its parent, document position, page scroll,
  or host padding.
- One shared screen shell establishes viewport size, background, overflow, and
  isolation for game modes.
- The existing proportional `--fx` system remains intact.
- Resizing the window still recalculates `--fx` immediately.
- Exiting battle returns to the correct parent mode with its existing in-memory
  state preserved.
- Loading, error, setup, map, draft, and result screens continue to scroll when
  their own content requires it.
- Replay controls remain available without reducing or unpredictably shifting
  the battle viewport.

## Non-goals

- Creating a new `/battle` SvelteKit route.
- Serializing all campaign or gauntlet state for cross-route transfer.
- Redesigning battle bands, board proportions, or action controls.
- Replacing the `--fx` scaling system with individually responsive dimensions.
- Converting ordinary menus into dialogs or translucent overlays.
- Refactoring battle engine state, networking, replay timing, or ATB behavior.
- Guaranteeing a playable phone layout. The current battle remains a
  desktop/tablet landscape experience.

## Screen model

Only one major screen is in normal flow at a time:

```text
Campaign setup/map  ->  Battle screen  ->  Campaign result/map
Gauntlet draft      ->  Battle screen  ->  Gauntlet reward
Co-op setup/lobby   ->  Battle screen  ->  Co-op result/setup
History loading     ->  Replay screen  ->  History
```

The previous screen may remain represented by component state in its route, but
its DOM must not remain visible underneath the battle. The battle background is
opaque; there is no modal backdrop and no reduced opacity on battle content.

## Shared `GameScreen` shell

Add `src/lib/ui/GameScreen.svelte`.

Responsibilities:

- Establish exactly one dynamic viewport of space.
- Prevent document-level overflow while the screen is active.
- Provide the common dark game background and foreground color.
- Give children a `position: relative` containing block for popovers and
  full-screen status layers.
- Allow each screen to manage its own internal scrolling.

Suggested API:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    label: string;
  }

  let { children, label }: Props = $props();
</script>

<section class="game-screen" aria-label={label}>
  {@render children()}
</section>
```

Suggested layout contract:

```css
.game-screen {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  color: #f1f5f9;
  background: #0f172a;
  isolation: isolate;
}
```

Use `100dvh` so browser chrome changes do not leave stale space. Add a `100vh`
fallback before `100dvh` if supported-browser testing shows it is necessary.
Do not set `opacity` on this shell; alpha belongs in individual background
colors, otherwise all descendants become translucent.

`GameScreen` should not know which game mode it contains and should not perform
navigation or hold battle state.

## `Battle.svelte` sizing

### Remove

Delete the following layout state and behavior from `Battle.svelte`:

- `MIN_SCREEN_H`
- `screenEl`
- `availableH`
- `el.getBoundingClientRect()`
- `window.scrollY`
- `el.closest('main')`
- `getComputedStyle(page).paddingBottom`
- The animation-frame follow-up measurement
- `bind:this={screenEl}` on the battle root
- `height: {availableH}px` on the battle root
- Comments describing remaining page height and host `<main>` assumptions

### Keep

Keep the authored design dimensions and readability clamps:

```ts
const DESIGN_H = 900;
const DESIGN_W = 1560;
const FX_MIN = 0.7;
const FX_MAX = 1.4;
```

### Replace `measureFit()`

The battle now receives the full visual viewport, so scaling only needs viewport
dimensions:

```ts
function measureFit() {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;

  fx = Math.max(
    FX_MIN,
    Math.min(FX_MAX, width / DESIGN_W, height / DESIGN_H)
  );
}
```

Measure once on mount and on subsequent viewport resizes. If
`window.visualViewport` is used, subscribe to its `resize` event during mount
and remove the listener during cleanup. Retain the ordinary window resize path
as a fallback. Do not use a second animation-frame measurement.

The SSR/default value remains:

```ts
let fx = $state(1);
```

### Battle root contract

Change the root to:

```svelte
<div class="battle-screen" style="--fx: {fx}px">
```

and make its box explicit:

```css
.battle-screen {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  flex-direction: column;
  gap: calc(8 * var(--fx));
}
```

No Battle child should create document-level scrolling. Existing internal
scroll regions such as logs and chat remain internal.

## Host migration

The key rule is that the padded menu `<main>` and the full-screen battle shell
must be mutually exclusive top-level branches. Do not place `GameScreen` inside
the padded `<main>`.

### Campaign

Restructure `src/routes/campaign/+page.svelte`:

```svelte
{#if screen === 'battle'}
  <GameScreen label="Campaign battle">
    {#key battleKey}
      <Battle ... />
    {/key}
  </GameScreen>
{:else}
  <main class="min-h-screen ...">
    <!-- setup, campaign map, and result -->
  </main>
{/if}
```

Use the route's actual battle discriminator; if battle is currently represented
by the final catch-all `{:else}`, replace that ambiguity with an explicit
`'battle'` screen value before moving the markup.

The Hub and Battle History page header must not render during battle. Battle's
existing settings/exit control remains the way out.

### Gauntlet

Move the `inBattle` branch outside the padded `<main>`:

```svelte
{#if loaded && run && inBattle}
  <GameScreen label="Gauntlet battle">
    <Battle ... />
  </GameScreen>
{:else}
  <main class="min-h-screen ...">
    <!-- loading, setup, draft, rewards, and errors -->
  </main>
{/if}
```

Remove the conditional header-hiding workaround because the whole menu main is
now absent during battle.

### Co-op

Render `GameScreen` when `battleState && loadout` is true. Setup/lobby headings,
connection setup messages, and page links remain inside the non-battle `<main>`.

Connection-loss and waiting-for-peer feedback that is relevant during battle
must remain inside the dedicated screen. Existing fixed reconnect/abandonment
layers should be positioned relative to `GameScreen` where possible, not the
document body.

The WebSocket client and parent route state remain mounted, so this refactor
must not reconnect merely because the visual screen changed.

### Replay/history detail

Loading and error states remain ordinary scrollable page content. Once a replay
is ready, render a dedicated `GameScreen label="Battle replay"`.

The replay toolbar becomes a compact screen overlay rather than normal-flow page
chrome. Position it at the top of the replay screen with a z-index above Battle,
and ensure it does not alter Battle's measured viewport. The co-op replay chat
becomes an internal drawer/panel or bottom overlay with its own scrolling.

All replay controls must remain keyboard reachable, and their overlay must not
cover Battle's essential action/status controls at supported viewport sizes.
If this cannot be achieved without a replay-control redesign, add a dedicated
reserved overlay zone inside `Battle` rather than reintroducing parent-height
measurement.

## Other game modes

The component is intentionally reusable for future migration of the hub,
Campaign Map, Gauntlet draft, Compendium, Events, Settings, Army Setup, and
History. This specification only requires Battle and Replay adoption. Other
screens may adopt `GameScreen` incrementally; scrollable screens should use an
internal `overflow-y: auto` content region rather than body scrolling once
migrated.

## Navigation and state ownership

- Existing route components continue to own campaign, gauntlet, co-op, and
  replay state.
- Entering battle changes the route component's screen discriminator; it does
  not navigate to a new URL in this change.
- Exiting invokes the existing `onexit` callback and restores the appropriate
  parent screen.
- Battle result callbacks and persistence calls remain unchanged.
- Browser refresh behavior remains exactly as it is today.
- A later project may promote battles to addressable routes once battle state
  has a stable persistence/loading contract.

## Global CSS

Retain `:root { --fx: 1px; }` as the SSR/default scaled pixel.

Review the `html { scrollbar-gutter: stable; }` comment in `src/app.css`. The
rule may remain useful for scrollable menu screens, but its comment must no
longer claim it protects the battle board from host-page scrollbar changes.

Do not globally set `body { overflow: hidden; }`, because non-game pages still
need normal scrolling. The exclusive `GameScreen` branch should prevent battle
overflow by construction.

## Accessibility

- Use an opaque `<section>` landmark with an informative `aria-label`; do not
  give it modal dialog semantics.
- Do not add a focus trap solely because the screen is full viewport. It is a
  screen, not a dialog.
- When entering a battle, move focus to the battle's primary heading/status or
  active control if current focus was inside DOM that has just unmounted.
- Existing Escape behavior continues to close the most local Battle layer
  first; Escape must not unexpectedly exit the entire battle.
- Replay toolbar and internal chat remain keyboard accessible.
- Respect safe-area insets if controls touch a viewport edge:
  `env(safe-area-inset-*)` may be added to the shared shell or the affected
  overlay.

## Responsive behavior

Supported verification sizes:

- 1920x1080
- 1560x900 (authored design size)
- 1366x768
- 1280x720
- 1024x600 minimum landscape target

At each size:

- No document scrollbar appears during battle.
- No battle band is clipped.
- ActionDock labels remain legible.
- The board receives excess space above `FX_MAX`; chrome does not grow without
  bound.
- At `FX_MIN`, internal flex regions absorb the remaining squeeze.

Viewport sizes below the supported landscape target may show an explicit
"rotate or enlarge the window" state in a later change. This refactor must not
silently add a second scrolling layout for them.

## Testing

### Automated

- `npm run check`
- `npm test`
- Add a component-level test, if the existing test harness supports DOM sizing,
  that verifies `Battle` no longer calls parent/document measurement APIs.
- Keep existing Campaign, Gauntlet, Co-op, and Replay state-transition tests
  passing.

### Manual

For Campaign, Gauntlet, Co-op, and Replay:

1. Enter battle from the host mode.
2. Confirm no host heading, padding, or menu content remains visible.
3. Resize through every supported verification size.
4. Confirm the battle remains exactly one viewport with no document scrollbar.
5. Open settings, spellbook, expanded log, chat/reconnect UI, and any other
   Battle overlay; confirm clipping and stacking remain correct.
6. Exit or finish the battle and confirm the previous mode returns with its
   state intact.
7. In Replay, confirm play/pause, restart, speed selection, and chat remain
   usable without reflowing Battle.

## Implementation order

1. Add `GameScreen.svelte` and document its full-viewport contract.
2. Simplify `Battle.svelte` sizing and viewport scaling.
3. Move Campaign's battle branch outside its padded `<main>`.
4. Move Gauntlet's battle branch outside its padded `<main>`.
5. Move Co-op's battle branch outside its padded `<main>` and verify connection
   state is preserved.
6. Convert replay detail's ready state into a dedicated Replay screen and
   reposition its toolbar/chat.
7. Update stale global and Battle sizing comments.
8. Run automated checks and the manual viewport matrix.

## Acceptance criteria

- `Battle.svelte` contains no `screenEl`, `availableH`, `MIN_SCREEN_H`,
  `getBoundingClientRect`, `closest('main')`, host-padding lookup, `window.scrollY`,
  or delayed animation-frame measurement.
- `Battle.svelte` calculates `--fx` only from the visual/window viewport and the
  design-size clamps.
- Battle is rendered inside `GameScreen` by Campaign, Gauntlet, Co-op, and
  Replay.
- The padded host `<main>` is not mounted while Battle is active.
- Battle has an opaque background and is not presented with modal semantics.
- No document-level scrollbar appears during battle at supported viewport sizes.
- Existing battle exit, result, persistence, replay, and networking behavior is
  unchanged.
- Replay controls remain usable without making Battle measure remaining page
  height.
- `npm run check` and `npm test` pass.
