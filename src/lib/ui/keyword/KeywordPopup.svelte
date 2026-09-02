<script lang="ts">
  import { entryHref, KIND_TERM } from '$lib/compendium/entries';
  import { keywordPopup } from './popupState.svelte';
  import KeywordText from './KeywordText.svelte';

  let card = $state<HTMLDivElement | null>(null);

  const target = $derived(keywordPopup.target);

  /** Placed by hand rather than by CSS anchor positioning, which is still
   *  Chromium-only. The popover attribute is what matters here: it puts the
   *  card in the top layer, so a scrolling panel or the battle HUD cannot clip
   *  it, and it brings light-dismiss and Esc with it. */
  function place() {
    const anchor = keywordPopup.anchor;
    if (!anchor || !card) return;
    const a = anchor.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const margin = 8;
    const gap = 6;

    const left = Math.max(
      margin,
      Math.min(a.left + a.width / 2 - c.width / 2, window.innerWidth - c.width - margin),
    );
    // Below the term by default, flipped above when there is no room — a card
    // that would hang off the bottom of a phone is worse than one that covers
    // the line above.
    const below = a.bottom + gap;
    const top = below + c.height > window.innerHeight - margin
      ? Math.max(margin, a.top - c.height - gap)
      : below;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  $effect(() => {
    if (!card) return;
    const isOpen = card.matches(':popover-open');
    if (keywordPopup.open && !isOpen) card.showPopover();
    else if (!keywordPopup.open && isOpen) card.hidePopover();
  });

  /**
   * Dismissal is ours rather than the popover API's. `popover="auto"` brings
   * light-dismiss for free, but it counts the very click that opens the card as
   * an outside click and shuts it again — so tap-to-open never worked. Manual
   * mode keeps the top-layer rendering and we listen for ourselves, from the
   * next frame, so the opening gesture has finished before we start watching.
   */
  $effect(() => {
    if (!keywordPopup.open) return;

    let listening = false;
    const onPointerDown = (event: PointerEvent) => {
      const el = event.target as Node | null;
      if (!el) return;
      if (card?.contains(el) || keywordPopup.anchor?.contains(el)) return;
      keywordPopup.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const anchor = keywordPopup.anchor;
      keywordPopup.close();
      anchor?.focus();
    };

    const frame = requestAnimationFrame(() => {
      listening = true;
      document.addEventListener('pointerdown', onPointerDown, true);
    });
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      if (listening) document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  // Re-place whenever the shown entry changes: drilling into a longer blurb
  // changes the card's height, and a flipped card would end up in the wrong
  // place otherwise.
  $effect(() => {
    if (target && card?.matches(':popover-open')) {
      place();
      if (keywordPopup.fromKeyboard) card.focus();
    }
  });

</script>

<svelte:window onresize={() => keywordPopup.open && place()} onscroll={() => keywordPopup.close()} />

<div
  bind:this={card}
  popover="manual"
  role="dialog"
  aria-label={target ? `${KIND_TERM[target.entryKind]}: ${target.name}` : undefined}
  tabindex="-1"
  class="card"
  onmouseenter={() => keywordPopup.keepOpen()}
  onmouseleave={() => keywordPopup.scheduleClose()}
>
  {#if target}
    {#if keywordPopup.canGoBack}
      <button type="button" class="back" onclick={() => keywordPopup.back()}>‹ Back</button>
    {/if}
    <p class="kind">{KIND_TERM[target.entryKind]}</p>
    <h2 class="name">{target.name}</h2>
    <p class="blurb"><KeywordText text={target.blurb} nested /></p>
    <a class="more" href={entryHref(target.entryKind, target.id)}>Open in compendium →</a>
  {/if}
</div>

<style>
  .card {
    position: fixed;
    inset: auto;
    margin: 0;
    max-width: min(19rem, calc(100vw - 1rem));
    padding: 0.65rem 0.8rem 0.7rem;
    border: 1px solid var(--color-slate-600, #475569);
    border-radius: 0.5rem;
    background: var(--color-slate-800, #1e293b);
    color: var(--color-slate-200, #e2e8f0);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
    overflow: visible;
  }

  .card:not(:popover-open) {
    display: none;
  }

  .back {
    font: inherit;
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--color-slate-400, #94a3b8);
    background: none;
    border: 0;
    padding: 0 0 0.2rem;
    cursor: pointer;
  }

  .back:hover {
    color: var(--color-amber-300, #fcd34d);
  }

  .kind {
    margin: 0;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-slate-500, #64748b);
  }

  .name {
    margin: 0.1rem 0 0.25rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-amber-300, #fcd34d);
  }

  .blurb {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--color-slate-300, #cbd5e1);
  }

  .more {
    display: inline-block;
    margin-top: 0.5rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--color-slate-400, #94a3b8);
    text-decoration: none;
  }

  .more:hover {
    color: var(--color-amber-300, #fcd34d);
  }
</style>
