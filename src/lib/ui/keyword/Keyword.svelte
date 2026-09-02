<script lang="ts">
  import { findKeyword, type Segment } from '$lib/compendium/keywords';
  import { keywordPopup, OPEN_DELAY } from './popupState.svelte';

  interface Props {
    entryKind: Extract<Segment, { kind: 'keyword' }>['entryKind'];
    id: string;
    label: string;
    /** Inside the popup, a term replaces what the popup shows rather than
     *  opening a second one. Hover opens the first card; click drills. */
    nested?: boolean;
  }

  let { entryKind, id, label, nested = false }: Props = $props();

  const target = $derived(findKeyword(`${entryKind}:${id}`));

  let element = $state<HTMLButtonElement>()!;
  let openTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelOpen() {
    clearTimeout(openTimer);
    openTimer = undefined;
  }

  function open(fromKeyboard = false) {
    cancelOpen();
    if (!target) return;
    if (nested) keywordPopup.drill(target);
    else keywordPopup.show(target, element, fromKeyboard);
  }

  function onEnter() {
    // A term inside the popup is click-only: swapping the card as the cursor
    // crossed the text would make the popup unreadable.
    if (nested) return keywordPopup.keepOpen();
    keywordPopup.keepOpen();
    openTimer = setTimeout(() => open(), OPEN_DELAY);
  }

  function onLeave() {
    cancelOpen();
    if (!nested) keywordPopup.scheduleClose();
  }

  /** Only keyboard focus opens the card. A mouse click focuses the button
   *  before it fires `click`, so opening on every focus would let the click
   *  that follows toggle the card straight back shut. */
  function onFocus() {
    if (element.matches(':focus-visible')) open(true);
  }

  function onClick() {
    cancelOpen();
    // Tapping the open term again closes it, so touch has a way out that is
    // not "tap somewhere harmless".
    if (!nested && keywordPopup.open && keywordPopup.anchor === element) keywordPopup.close();
    else open();
  }
</script>

<!-- A button, not a link: it opens an explanation in place. The popup carries
     the link out to the full entry. -->
<button
  bind:this={element}
  type="button"
  class="keyword"
  aria-expanded={!nested && keywordPopup.open && keywordPopup.anchor === element}
  onmouseenter={onEnter}
  onmouseleave={onLeave}
  onclick={onClick}
  onfocus={onFocus}
  onblur={onLeave}
>{label}</button>

<style>
  .keyword {
    /* Inherits the surrounding text so a dense panel does not turn into
       confetti — the underline is the whole affordance. */
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: help;
    text-decoration: underline dotted;
    text-decoration-color: var(--color-amber-400, #fbbf24);
    text-underline-offset: 2px;
  }

  .keyword:hover,
  .keyword:focus-visible {
    color: var(--color-amber-300, #fcd34d);
    text-decoration-style: solid;
  }

  .keyword:focus-visible {
    outline: 2px solid var(--color-amber-500, #f59e0b);
    outline-offset: 2px;
    border-radius: 2px;
  }
</style>
