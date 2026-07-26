<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import HubTopBar from '$lib/ui/HubTopBar.svelte';
  import EntryCard from '$lib/ui/compendium/EntryCard.svelte';
  import EntryDetail from '$lib/ui/compendium/EntryDetail.svelte';
  import {
    ENTRY_KINDS,
    KIND_LABEL,
    entriesOfKind,
    entryHrefFrom,
    kindOfTab,
    matchesFilters,
    tabHrefFrom,
    type CompendiumEntry,
    type EntryKind,
  } from '$lib/compendium/entries';
  import { loadDiscovery, newDiscovery, type DiscoveryState } from '$lib/compendium/discovery';
  import { FACTION_INFO } from '$lib/engine/factions';
  import type { FactionClass, Hero } from '$lib/engine/types';
  import { loadHero } from '$lib/storage';

  let hero = $state<Hero | null>(null);
  let discovery = $state<DiscoveryState>(newDiscovery());
  let search = $state('');

  onMount(async () => {
    // Both are cosmetic here: the hero only sharpens the Lightning damage
    // figure, and discovery only paints badges. Neither may block the page.
    const [h, d] = await Promise.allSettled([loadHero(), loadDiscovery()]);
    if (h.status === 'fulfilled') hero = h.value;
    if (d.status === 'fulfilled') discovery = d.value;
  });

  // Every bit of view state lives in the query string, so back/forward work and
  // any view can be linked to from elsewhere in the game.
  const kind = $derived(kindOfTab(page.url.searchParams.get('tab')));
  const selectedId = $derived(page.url.searchParams.get('entry'));
  const factionFilter = $derived(page.url.searchParams.get('faction') as FactionClass | null);
  const tierFilter = $derived(Number(page.url.searchParams.get('tier')) || null);

  const all = $derived(entriesOfKind(kind, hero?.level ?? 1));

  const shown = $derived(
    all.filter((e) => matchesFilters(e, { faction: factionFilter, tier: tierFilter, search })),
  );

  /** Entry links keep the active filters, so picking a Knight while filtered to
   *  Knight leaves the list filtered. Passed down so the detail panel's
   *  cross-links behave identically. */
  const hrefFor = $derived(
    (k: EntryKind, id: string) => entryHrefFrom(page.url.searchParams, k, id, hero?.level ?? 1),
  );

  const selected = $derived(shown.find((e) => e.id === selectedId) ?? all.find((e) => e.id === selectedId) ?? null);

  /** Whether this entry has been met — only units, items, and gauntlet skills
   *  are tracked; other kinds never show a badge. */
  function isMet(entry: CompendiumEntry): boolean {
    if (entry.kind === 'unit') return discovery.units.includes(entry.id);
    if (entry.kind === 'item') return discovery.items.includes(entry.id as never);
    if (entry.kind === 'unitSkill') return discovery.unitSkills.includes(entry.id as never);
    if (entry.kind === 'faction') return discovery.factions.includes(entry.faction);
    return false;
  }

  const metCount = $derived(all.filter(isMet).length);
  const tracksDiscovery = $derived(['unit', 'item', 'unitSkill', 'faction'].includes(kind));

  /** Filters carry across tabs and stay until cleared; the selection doesn't,
   *  since it belongs to the tab being left. */
  const tabHref = $derived((k: EntryKind) => tabHrefFrom(page.url.searchParams, k));

  function filterHref(params: Record<string, string | null>): string {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(params)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    url.searchParams.delete('entry');
    return url.pathname + url.search;
  }

  const showFactionFilter = $derived(kind === 'unit' || kind === 'factionSkill');
  const TIERS = [1, 2, 3, 4, 5, 6, 7];
</script>

<svelte:head><title>Compendium — Warlords</title></svelte:head>

<main class="min-h-screen bg-slate-900 px-4 py-5 text-slate-100 sm:px-6 sm:py-6">
  <div class="mx-auto max-w-6xl">
    <HubTopBar gold={hero?.gold ?? 0} />

    <div class="mb-3 mt-6 flex flex-wrap items-baseline justify-between gap-2 px-0.5">
      <h1 class="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Compendium</h1>
      {#if tracksDiscovery}
        <p class="font-mono text-[11px] text-emerald-300">{metCount} / {all.length} met in battle</p>
      {/if}
    </div>

    <!-- Kind tabs -->
    <div class="mb-3 flex flex-wrap gap-1.5">
      {#each ENTRY_KINDS as k (k)}
        <a
          href={tabHref(k)}
          class="rounded-full border px-3 py-1 text-xs font-bold transition
            {kind === k
            ? 'border-amber-500 bg-amber-500/15 text-amber-300'
            : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/60'}"
        >
          {KIND_LABEL[k]}
        </a>
      {/each}
    </div>

    <!-- Filters -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        bind:value={search}
        placeholder="Search {KIND_LABEL[kind].toLowerCase()}…"
        aria-label="Search {KIND_LABEL[kind].toLowerCase()}"
        class="w-48 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
      />
      {#if showFactionFilter}
        <div class="flex flex-wrap gap-1">
          <a
            href={filterHref({ faction: null })}
            class="rounded border px-2 py-1 text-[11px] font-bold {factionFilter
              ? 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/60'
              : 'border-amber-500 bg-amber-500/15 text-amber-300'}">All</a
          >
          {#each Object.entries(FACTION_INFO) as [cls, info] (cls)}
            <a
              href={filterHref({ faction: cls })}
              class="rounded border px-2 py-1 text-[11px] font-bold {factionFilter === cls
                ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/60'}">{info.name}</a
            >
          {/each}
        </div>
      {/if}
      {#if kind === 'unit'}
        <div class="flex flex-wrap gap-1">
          <a
            href={filterHref({ tier: null })}
            class="rounded border px-2 py-1 text-[11px] font-bold {tierFilter
              ? 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/60'
              : 'border-amber-500 bg-amber-500/15 text-amber-300'}">All tiers</a
          >
          {#each TIERS as t (t)}
            <a
              href={filterHref({ tier: String(t) })}
              class="rounded border px-2 py-1 text-[11px] font-bold {tierFilter === t
                ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/60'}">T{t}</a
            >
          {/each}
        </div>
      {/if}
    </div>

    <!-- Master-detail on desktop; on mobile the detail replaces the grid. -->
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div class="{selected ? 'hidden lg:block' : ''}">
        {#if shown.length === 0}
          <p class="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center text-sm text-slate-500">
            Nothing matches that filter.
          </p>
        {:else}
          <div class="flex flex-col gap-1.5">
            {#each shown as entry (entry.id)}
              <EntryCard
                {entry}
                href={hrefFor(entry.kind, entry.id)}
                selected={entry.id === selectedId}
                seen={isMet(entry)}
              />
            {/each}
          </div>
        {/if}
      </div>

      <div class="{selected ? '' : 'hidden lg:block'}">
        {#if selected}
          <div class="rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 lg:sticky lg:top-4">
            <a
              href={tabHref(kind)}
              class="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-amber-300 lg:hidden"
            >
              ‹ Back to {KIND_LABEL[kind].toLowerCase()}
            </a>
            <EntryDetail entry={selected} {discovery} {hrefFor} />
          </div>
        {:else}
          <p class="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
            Pick an entry to read it.
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Mobile-only bottom nav in the thumb zone -->
  <nav class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-slate-700/60 bg-slate-900/90 py-2 backdrop-blur sm:hidden">
    <a href="/" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">🏰</span>Home
    </a>
    <a href="/campaign" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">🗺️</span>Campaign
    </a>
    <a href="/events" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">❄️</span>Events
    </a>
    <a href="/compendium" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-amber-300">
      <span class="text-lg">📖</span>Codex
    </a>
    <a href="/settings" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">👤</span>Profile
    </a>
  </nav>
  <div class="h-16 sm:hidden"></div>
</main>
