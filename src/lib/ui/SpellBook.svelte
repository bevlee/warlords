<script lang="ts">
  import type { Hero, SpellId } from '$lib/engine/types';
  import { SPELLS, lightningDamage } from '$lib/engine/battle';
  import { maxMana } from '$lib/engine/factionSkills';

  interface Props {
    hero: Hero;
    onpick: (spell: SpellId) => void;
    onclose: () => void;
  }

  let { hero, onpick, onclose }: Props = $props();

  const mana = $derived(hero.mana ?? 0);

  interface SpellEntry {
    id: SpellId;
    glyph: string;
    label: string;
    target: string;
    effect: string;
    tooltip: string;
    ring: string;
  }

  const entries: SpellEntry[] = $derived([
    {
      id: 'lightning' as SpellId,
      glyph: '⚡',
      label: 'Lightning',
      target: 'Enemy stack',
      effect: `${lightningDamage(hero.level)} true damage`,
      tooltip:
        `A bolt of raw lightning strikes one enemy stack for ${lightningDamage(hero.level)} damage ` +
        `(12 + 8 × hero level). True damage: ignores attack, defense, and buffs. No retaliation.`,
      ring: 'ring-sky-400 bg-sky-100',
    },
    {
      id: 'bloodlust' as SpellId,
      glyph: '💪',
      label: 'Bloodlust',
      target: 'Friendly stack',
      effect: '+4 attack',
      tooltip:
        'Fills a friendly stack with battle fury: +4 attack for the rest of the battle. ' +
        'Casting it again on the same stack adds another +4.',
      ring: 'ring-red-400 bg-red-100',
    },
    {
      id: 'stoneskin' as SpellId,
      glyph: '🗿',
      label: 'Stoneskin',
      target: 'Friendly stack',
      effect: '+4 defense',
      tooltip:
        'Turns a friendly stack’s skin to granite: +4 defense for the rest of the battle. ' +
        'Casting it again on the same stack adds another +4.',
      ring: 'ring-stone-400 bg-stone-200',
    },
  ]);
</script>

<!-- Backdrop: click anywhere outside the book to close. -->
<div
  class="absolute inset-0 z-30 flex items-center justify-center bg-black/50"
  role="presentation"
  onclick={e => {
    if (e.target === e.currentTarget) onclose();
  }}
>
  <div
    class="relative w-[min(90%,640px)] rounded-2xl border-4 border-indigo-950 bg-indigo-900 p-3 shadow-2xl"
    role="dialog"
    aria-label="Spellbook"
  >
    <!-- Open pages -->
    <div class="book-pages relative grid grid-cols-2 rounded-lg">
      {#each entries as s, i (s.id)}
        {@const affordable = mana >= SPELLS[s.id].cost}
        <div class="group relative flex flex-col items-center px-6 py-5 {i % 2 === 0 ? 'page-left' : 'page-right'}">
          <button
            type="button"
            class="relative flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-md ring-4
              transition {s.ring}
              {affordable ? 'hover:scale-110 hover:shadow-lg' : 'cursor-not-allowed opacity-40 grayscale'}"
            aria-label="Cast {s.label}"
            disabled={!affordable}
            onclick={() => onpick(s.id)}
          >
            {s.glyph}
          </button>
          <p class="mt-2 text-sm font-bold text-stone-800">{s.label}</p>
          <p class="font-mono text-[11px] leading-tight text-stone-600">Mana: {SPELLS[s.id].cost}</p>
          <p class="font-mono text-[11px] leading-tight text-stone-600">{s.effect}</p>
          <p class="text-[10px] italic leading-tight text-stone-500">{s.target}</p>

          <!-- Tooltip -->
          <div
            class="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 w-60 -translate-x-1/2 rounded-lg
              border border-slate-600 bg-slate-900/95 p-2.5 text-left text-xs leading-snug text-slate-100
              opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
            role="tooltip"
          >
            <p class="mb-1 font-bold text-amber-300">{s.label} — {SPELLS[s.id].cost} mana</p>
            {s.tooltip}
            {#if !affordable}
              <p class="mt-1 font-semibold text-red-400">Not enough mana.</p>
            {/if}
          </div>
        </div>
      {/each}
      <!-- pad the last page cell so both pages have equal height -->
      {#if entries.length % 2 === 1}
        <div class="page-right"></div>
      {/if}
    </div>

    <!-- Mana ribbon -->
    <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-b-lg border border-amber-200 bg-amber-50 px-5 py-1 text-center shadow-lg">
      <p class="text-sm font-bold leading-tight text-indigo-800">mana</p>
      <p class="font-mono text-xs leading-tight text-stone-700">{mana} / {maxMana(hero)}</p>
    </div>

    <!-- Close -->
    <button
      type="button"
      class="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border-2
        border-amber-200 bg-amber-400 font-bold text-amber-900 shadow-lg hover:bg-amber-300"
      aria-label="Close spellbook"
      onclick={onclose}
    >
      ✕
    </button>
  </div>
</div>

<style>
  .book-pages {
    background: linear-gradient(90deg, #f3e5c3 0%, #efe0ba 48%, #d9c79a 50%, #f5e8c8 52%, #f8ecce 100%);
    min-height: 240px;
  }

  .page-left {
    box-shadow: inset -14px 0 18px -14px rgb(0 0 0 / 0.45);
    border-radius: 8px 0 0 8px;
  }

  .page-right {
    box-shadow: inset 14px 0 18px -14px rgb(0 0 0 / 0.45);
    border-radius: 0 8px 8px 0;
  }
</style>
