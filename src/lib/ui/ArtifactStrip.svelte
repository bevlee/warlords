<script lang="ts">
  import { ITEMS, itemEffectText, type ItemId, type ItemRarity } from '$lib/gauntlet/items';
  import { stripKeywords } from '$lib/compendium/keywords';

  interface Props {
    items?: ItemId[];
  }

  let { items = [] }: Props = $props();

  let card = $state<HTMLDivElement | null>(null);
  let anchor = $state<HTMLButtonElement | null>(null);
  let activeId = $state<ItemId | null>(null);
  let pinned = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const activeItem = $derived(activeId ? ITEMS[activeId] : null);

  const RING: Record<ItemRarity, string> = {
    default: 'ring-slate-500',
    common: 'ring-slate-500',
    rare: 'ring-sky-400',
    epic: 'ring-purple-400',
  };
  const NAME: Record<ItemRarity, string> = {
    default: 'text-slate-200',
    common: 'text-slate-200',
    rare: 'text-sky-300',
    epic: 'text-purple-300',
  };

  function cancelClose() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function open(id: ItemId, element: HTMLButtonElement) {
    cancelClose();
    activeId = id;
    anchor = element;
  }

  function close() {
    cancelClose();
    activeId = null;
    anchor = null;
    pinned = false;
  }

  function scheduleClose() {
    if (pinned) return;
    cancelClose();
    closeTimer = setTimeout(close, 120);
  }

  function toggle(id: ItemId, element: HTMLButtonElement) {
    if (pinned && activeId === id) close();
    else {
      open(id, element);
      pinned = true;
    }
  }

  function place() {
    if (!anchor || !card) return;
    const a = anchor.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const margin = 8;
    const gap = 8;
    const toRight = a.right + gap;
    const left = toRight + c.width <= window.innerWidth - margin
      ? toRight
      : Math.max(margin, a.left - c.width - gap);
    const top = Math.max(
      margin,
      Math.min(a.top + a.height / 2 - c.height / 2, window.innerHeight - c.height - margin),
    );
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  $effect(() => {
    if (!card) return;
    const isOpen = card.matches(':popover-open');
    if (activeItem && !isOpen) card.showPopover();
    else if (!activeItem && isOpen) card.hidePopover();
  });

  $effect(() => {
    if (!activeItem || !card?.matches(':popover-open')) return;
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!pinned) return;
    let listening = false;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || card?.contains(target) || anchor?.contains(target)) return;
      close();
    };
    const frame = requestAnimationFrame(() => {
      listening = true;
      document.addEventListener('pointerdown', onPointerDown, true);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (listening) document.removeEventListener('pointerdown', onPointerDown, true);
    };
  });
</script>

<svelte:window
  onresize={() => activeItem && place()}
  onkeydown={event => {
    if (event.key !== 'Escape' || !activeItem) return;
    event.stopImmediatePropagation();
    const previousAnchor = anchor;
    close();
    previousAnchor?.focus();
  }}
/>

{#if items.length > 0}
  <div class="artifact-strip flex min-h-0 w-full flex-col items-stretch gap-1.5 overflow-x-hidden overflow-y-auto" role="list" aria-label="Army artifacts" onscroll={close}>
    <p class="w-full text-center font-mono text-[8px] font-bold uppercase tracking-wider text-slate-500">Army artifacts</p>
    {#each items as id (id)}
      {@const item = ITEMS[id]}
      <div class="min-w-0 px-0.5" role="listitem">
        <button
          type="button"
          aria-label="Army artifact: {item.name}"
          aria-describedby={activeId === id ? 'artifact-hover-card' : undefined}
          class="flex min-h-8 w-full min-w-0 items-center justify-center rounded-lg bg-slate-900/85 px-1 py-1 text-center text-[10px]
            whitespace-normal [overflow-wrap:anywhere]
            font-semibold leading-tight shadow ring-1 {RING[item.rarity]} {NAME[item.rarity]}
            {activeId === id ? 'outline outline-2 outline-amber-300' : 'hover:bg-slate-800'}"
          onmouseenter={event => !pinned && open(id, event.currentTarget)}
          onmouseleave={scheduleClose}
          onfocus={event => open(id, event.currentTarget)}
          onblur={scheduleClose}
          onclick={event => toggle(id, event.currentTarget)}
        >
          {item.name}
        </button>
      </div>
    {/each}
  </div>
{/if}

<div
  bind:this={card}
  id="artifact-hover-card"
  popover="manual"
  role="tooltip"
  class="artifact-card"
  onmouseenter={cancelClose}
  onmouseleave={scheduleClose}
>
  {#if activeItem}
    <p class="kind">Army artifact · {activeItem.rarity}</p>
    <p class="name rarity-{activeItem.rarity}">{activeItem.name}</p>
    <p class="effect">{stripKeywords(itemEffectText(activeItem))}</p>
  {/if}
</div>

<style>
  /* The popover top layer is deliberately outside the strip's scroll and
     clipping context. It can sit beside the artifact exactly like other hover
     cards without creating either scrollbar. */
  .artifact-card {
    position: fixed;
    inset: auto;
    width: min(19rem, calc(100vw - 1rem));
    margin: 0;
    overflow: visible;
    border: 1px solid rgb(71 85 105);
    border-radius: 0.5rem;
    background: rgb(15 23 42 / 0.98);
    padding: 0.65rem 0.8rem 0.75rem;
    color: #e2e8f0;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
  }

  .artifact-card:not(:popover-open) { display: none; }
  .artifact-card p { margin: 0; }
  .kind { font: 800 0.6rem/1 ui-monospace, monospace; letter-spacing: 0.11em; text-transform: uppercase; color: #94a3b8; }
  .name { margin-top: 0.22rem !important; font-size: 0.95rem; font-weight: 750; color: #e2e8f0; }
  .name.rarity-rare { color: #7dd3fc; }
  .name.rarity-epic { color: #d8b4fe; }
  .effect { margin-top: 0.4rem !important; font: 700 0.76rem/1.4 ui-monospace, monospace; color: #fde68a; }
</style>
