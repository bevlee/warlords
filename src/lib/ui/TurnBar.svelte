<script lang="ts">
  import type { BattleAction, BattleState, UnitStack } from '$lib/engine/types';
  import { affectsAtbPreview, turnBarEntries } from './turnBar';
  import Sprite from './Sprite.svelte';

  interface Props {
    state: BattleState;
    hoveredId: string | null;
    /** The action the player is hovering in the dock, or null. Set, the strip
     *  shows the scale that action would produce instead of the live one. */
    previewAction?: BattleAction['type'] | null;
    onhover: (unit: UnitStack | null) => void;
  }

  // Aliased: a local `state` would shadow the `$state` rune.
  let { state: battleState, hoveredId, previewAction = null, onhover }: Props = $props();

  // Each entry carries the round it falls in, so the strip can break itself
  // into rounds inline — `startsRound` is set on the first turn of each new
  // one, which is where the marker goes. See ./turnBar.ts for the projection.
  const effectivePreview = $derived(affectsAtbPreview(previewAction) ? previewAction : null);
  const entries = $derived(turnBarEntries(battleState, effectivePreview));

  // Paged, not scrolled. Scrolling cost a permanent scrollbar across the
  // ribbon's full width — space the portraits can use instead — and a hovered
  // portrait's scale-up could nudge the scroll offset, shifting every other
  // portrait under the cursor. Paging moves by whole viewport widths, so
  // nothing drifts.
  let viewport = $state<HTMLDivElement>();
  let track = $state<HTMLDivElement>();
  let page = $state(0);
  let viewportWidth = $state(0);
  let contentWidth = $state(0);

  const pageCount = $derived(viewportWidth > 0 ? Math.max(1, Math.ceil(contentWidth / viewportWidth)) : 1);
  // Clamped to the end of the content, so the last page is a full strip that
  // overlaps the one before it rather than a near-empty remainder.
  const offset = $derived(Math.min(page * viewportWidth, Math.max(0, contentWidth - viewportWidth)));

  function measure() {
    const v = viewport;
    const t = track;
    if (!v || !t) return;
    viewportWidth = v.clientWidth;
    // Measured off the children's layout offsets rather than the track's
    // scrollWidth: the track lets its content overflow visibly, so scrollWidth
    // just reports the track's own width. offsetLeft/offsetWidth also ignore
    // both the track's translate and a hovered portrait's scale-up.
    const first = t.firstElementChild as HTMLElement | null;
    const last = t.lastElementChild as HTMLElement | null;
    contentWidth = first && last ? last.offsetLeft + last.offsetWidth - first.offsetLeft : 0;
    if (page > pageCount - 1) page = pageCount - 1;
  }

  // Stacks die and the predicted order shortens; the ribbon resizes with --fx.
  $effect(() => {
    void entries.length;
    measure();
  });

  $effect(() => {
    const v = viewport;
    if (!v || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    return () => ro.disconnect();
  });

  // Every turn — and every projection — re-predicts the whole order, so a page
  // further along stops meaning anything. Snap back to the head of the strip,
  // which is where both the acting stack and the projected landing spot are.
  $effect(() => {
    void battleState.currentUnitId;
    void effectivePreview;
    page = 0;
  });
</script>

<!-- LordsWM-style turns bar: a chevron ribbon of framed portraits with the
     round medallion and paging arrows built into its frame. Full width on
     purpose — a content-sized ribbon visibly narrows as stacks die. Every
     dimension is a multiple of --fx; see "Fitting the screen" in Battle.svelte. -->
<div class="atb-ribbon" class:projecting={!!effectivePreview}>
  <button
    type="button"
    class="atb-arrow"
    aria-label="Previous page of turn order"
    disabled={page === 0}
    onclick={() => (page -= 1)}
  >◀</button>

  <div class="round-medallion" title="Round {battleState.round}">
    <span class="round-label">RND</span>
    <span class="round-value">{battleState.round}</span>
  </div>

  <div class="atb-viewport" bind:this={viewport}>
    <div class="atb-track" bind:this={track} style="transform: translateX(-{offset}px)">
      {#each entries as entry, i (`${entry.unit.id}-${i}`)}
        {#if entry.startsRound}
          <div class="round-marker" role="separator" aria-label="Round {entry.round} begins">
            {entry.round}
          </div>
        {/if}
        <button
          type="button"
          class="portrait relative shrink-0 overflow-hidden rounded-sm border-2 transition-transform
            {entry.unit.side === 'player' ? 'border-sky-400 bg-sky-950' : 'border-red-500 bg-red-950'}
            {entry.isCurrent ? 'current ring-2 ring-amber-300' : ''}
            {entry.isProjected ? 'projected ring-2 ring-emerald-300' : ''}
            {entry.unit.id === hoveredId ? 'scale-110 brightness-125' : ''}"
          aria-label="turn {i + 1}: {entry.unit.definition.name} ×{entry.unit.count}{entry.isProjected
            ? ' — where this stack lands'
            : ''}"
          onmouseenter={() => onhover(entry.unit)}
          onmouseleave={() => onhover(null)}
        >
          <Sprite name={entry.unit.definition.name} class="h-full w-full" />
          <span class="count-plate">{entry.unit.count}</span>
        </button>
      {/each}
    </div>
  </div>

  <button
    type="button"
    class="atb-arrow"
    aria-label="Next page of turn order"
    disabled={page >= pageCount - 1}
    onclick={() => (page += 1)}
  >▶</button>
</div>

<style>
  .atb-ribbon {
    display: flex;
    width: 100%;
    align-items: center;
    gap: calc(8 * var(--fx));
    padding: calc(5 * var(--fx)) calc(22 * var(--fx));
    background: linear-gradient(180deg, #1c2748 0%, #111a33 60%, #0b1121 100%);
    border-top: 1px solid rgb(203 168 92 / 0.45);
    border-bottom: 1px solid rgb(203 168 92 / 0.45);
    box-shadow:
      0 6px 24px rgb(0 0 0 / 0.6),
      inset 0 1px 0 rgb(255 255 255 / 0.05);
    clip-path: polygon(
      calc(20 * var(--fx)) 0,
      calc(100% - 20 * var(--fx)) 0,
      100% 50%,
      calc(100% - 20 * var(--fx)) 100%,
      calc(20 * var(--fx)) 100%,
      0 50%
    );
  }

  .round-medallion {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: calc(38 * var(--fx));
    height: calc(38 * var(--fx));
    border-radius: 50%;
    border: 2px solid rgb(203 168 92 / 0.7);
    background: #0d1428;
    box-shadow: inset 0 0 12px rgb(0 0 0 / 0.7);
  }

  .round-label {
    font-family: ui-monospace, monospace;
    font-size: calc(9 * var(--fx));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    color: rgb(203 168 92 / 0.85);
  }

  .round-value {
    font-family: ui-monospace, monospace;
    font-size: calc(15 * var(--fx));
    font-weight: 700;
    line-height: 1.15;
    color: #f5d98b;
  }

  .atb-arrow {
    flex: none;
    width: calc(26 * var(--fx));
    height: calc(52 * var(--fx));
    border-radius: calc(4 * var(--fx));
    border: 1px solid rgb(148 163 184 / 0.4);
    background: rgb(30 41 59 / 0.9);
    color: #cbd5e1;
    font-size: calc(12 * var(--fx));
    line-height: 1;
  }

  .atb-arrow:hover:not(:disabled) {
    background: rgb(51 65 85 / 0.95);
    border-color: #cbd5e1;
  }

  .atb-arrow:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .atb-viewport {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    /* Room for a hovered portrait's scale-up, which would otherwise be clipped
       by the overflow rule above. */
    padding: calc(6 * var(--fx)) 0;
  }

  .atb-track {
    display: flex;
    /* Exactly the viewport's width, with the portraits overflowing it — that is
       what makes translateX(-100%) advance by precisely one page. */
    width: 100%;
    align-items: flex-end;
    /* Centred while the whole order fits, flush left once it overflows, so
       paging always starts from the first portrait. */
    justify-content: safe center;
    gap: calc(5 * var(--fx));
    transition: transform 0.2s ease;
  }

  .portrait {
    width: calc(65 * var(--fx));
    height: calc(78 * var(--fx));
  }

  .portrait.current {
    transform: translateY(calc(-4 * var(--fx)));
  }

  /* Where the acting stack lands if it takes the hovered action. Lifted like
     .current so the eye finds it in the same place, but green rather than
     amber: this slot is a projection, not a turn anyone is taking yet. */
  .portrait.projected {
    transform: translateY(calc(-4 * var(--fx)));
  }

  /* The whole strip dims while projecting, so a hypothetical order is never
     mistaken for the real one at a glance. The projected slots stay lit. */
  .projecting .portrait {
    opacity: 0.55;
  }

  .projecting .portrait.projected {
    opacity: 1;
  }

  .projecting {
    border-color: rgb(110 231 183 / 0.55);
  }

  .count-plate {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0 calc(3 * var(--fx));
    background: rgb(0 0 0 / 0.72);
    font-family: ui-monospace, monospace;
    font-size: calc(12 * var(--fx));
    font-weight: 700;
    line-height: 1.3;
    color: #fcd34d;
  }

  /* Inline round break: the strip reads as one continuous timeline, with these
     marking where one round hands over to the next. */
  .round-marker {
    display: flex;
    flex: none;
    align-self: stretch;
    align-items: center;
    justify-content: center;
    width: calc(26 * var(--fx));
    border-left: 1px solid rgb(203 168 92 / 0.5);
    border-right: 1px solid rgb(203 168 92 / 0.5);
    background: rgb(203 168 92 / 0.08);
    font-family: ui-monospace, monospace;
    font-size: calc(13 * var(--fx));
    font-weight: 700;
    line-height: 1;
    color: rgb(245 217 139 / 0.9);
  }
</style>
