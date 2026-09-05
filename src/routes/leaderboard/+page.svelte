<script lang="ts">
  import { onMount } from 'svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { heroSpriteName } from '$lib/ui/sprites';
  import { FACTION_INFO } from '$lib/engine/factions';
  import type { FactionClass } from '$lib/engine/types';
  import { ITEMS, type ItemId } from '$lib/gauntlet/items';
  import { UNIT_SKILLS, type SkillId } from '$lib/gauntlet/skills';
  import ArtifactCard from '$lib/ui/run/ArtifactCard.svelte';
  import { getLeaderboard, type LeaderboardEntry } from '$lib/net/api';

  const FACTIONS: FactionClass[] = ['barbarian', 'knight', 'wizard', 'necromancer', 'ranger', 'demon'];

  let entries = $state<LeaderboardEntry[]>([]);
  let loading = $state(true);
  let error = $state(false);
  let selectedFaction = $state<FactionClass | null>(null);
  let expandedId = $state<string | null>(null);

  async function load(faction: FactionClass | undefined) {
    loading = true;
    error = false;
    try {
      entries = await getLeaderboard(faction);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => load(undefined));

  function selectFaction(faction: FactionClass | null) {
    selectedFaction = faction;
    expandedId = null;
    void load(faction ?? undefined);
  }

  function toggle(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function scoreLabel(entry: LeaderboardEntry): string {
    if (entry.endlessDepth > 0) {
      return `Cleared + ${entry.endlessDepth} endless`;
    }
    return `${entry.battlesWon} / 10 won`;
  }

  function skillName(id: string): string {
    return UNIT_SKILLS[id as SkillId]?.name ?? id;
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <header class="mx-auto mb-6 flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1">
    <a href="/" class="text-xl font-black tracking-[0.2em] text-slate-200 hover:text-amber-400">
      WAR<span class="text-amber-400">L</span>ORDS
    </a>
    <p class="text-sm text-slate-500">Leaderboard</p>
  </header>

  <!-- Faction filter tabs -->
  <nav class="mx-auto mb-6 max-w-4xl" aria-label="Filter by faction">
    <div class="flex flex-wrap gap-1.5">
      <button
        type="button"
        class="rounded px-3 py-1.5 text-xs font-semibold transition
          {selectedFaction === null
            ? 'bg-amber-500 text-slate-900'
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}"
        onclick={() => selectFaction(null)}
      >
        All
      </button>
      {#each FACTIONS as faction (faction)}
        <button
          type="button"
          class="rounded px-3 py-1.5 text-xs font-semibold transition
            {selectedFaction === faction
              ? 'bg-amber-500 text-slate-900'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}"
          onclick={() => selectFaction(faction)}
        >
          {FACTION_INFO[faction].name}
        </button>
      {/each}
    </div>
  </nav>

  <div class="mx-auto max-w-4xl">
    {#if loading}
      <p class="text-slate-400">Loading…</p>
    {:else if error}
      <div class="rounded-lg border border-slate-700 bg-slate-800/60 p-6 text-center">
        <p class="text-red-300">Couldn't load the leaderboard.</p>
        <button
          type="button"
          class="mt-3 rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          onclick={() => load(selectedFaction ?? undefined)}
        >
          Retry
        </button>
      </div>
    {:else if entries.length === 0}
      <p class="text-center text-slate-500">No runs yet. Be the first!</p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each entries as entry, i (entry.id)}
          {@const rank = i + 1}
          <div class="rounded-lg border border-slate-700 bg-slate-800/80">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-700/50"
              onclick={() => toggle(entry.id)}
              aria-expanded={expandedId === entry.id}
            >
              <span class="w-8 shrink-0 text-right text-lg font-bold text-slate-500">{rank}</span>
              <span class="shrink-0">
                <Sprite name={heroSpriteName(entry.faction)} animate={false} class="h-10 w-8" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-amber-200">{entry.name}</p>
                <p class="text-xs text-slate-400">
                  {FACTION_INFO[entry.faction].name} · Lv {entry.heroLevel}
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-semibold {entry.endlessDepth > 0 ? 'text-amber-300' : 'text-slate-200'}">
                  {scoreLabel(entry)}
                </p>
              </div>
              <span class="shrink-0 text-slate-600 transition {expandedId === entry.id ? 'rotate-180' : ''}">
                ▾
              </span>
            </button>

            {#if expandedId === entry.id}
              <div class="border-t border-slate-700 px-4 py-4">
                <!-- Army -->
                <section class="mb-4">
                  <h3 class="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Army</h3>
                  <div class="flex flex-wrap gap-2">
                    {#each entry.army as unit (unit.name)}
                      <span class="rounded bg-slate-900 px-2.5 py-1 text-sm">
                        <span class="font-semibold text-slate-200">{unit.name}</span>
                        <span class="text-slate-500">×{unit.count}</span>
                      </span>
                    {/each}
                  </div>
                </section>

                <!-- Artifacts -->
                {#if entry.items.length > 0}
                  <section class="mb-4">
                    <h3 class="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                      Artifacts — {entry.items.length}
                    </h3>
                    <div class="grid gap-3 sm:grid-cols-2">
                      {#each entry.items as id (id)}
                        <ArtifactCard {id} armyUnits={entry.army.map(u => u.name)} />
                      {/each}
                    </div>
                  </section>
                {/if}

                <!-- Unit Skills -->
                {#if Object.keys(entry.unitSkills).length > 0}
                  <section>
                    <h3 class="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Unit Skills</h3>
                    <div class="flex flex-col gap-1">
                      {#each Object.entries(entry.unitSkills) as [unitName, skills] (unitName)}
                        <div class="flex flex-wrap items-center gap-1.5 text-sm">
                          <span class="font-semibold text-slate-200">{unitName}</span>
                          <span class="text-slate-600">—</span>
                          {#each Object.entries(skills) as [skillId, level] (skillId)}
                            <span class="rounded bg-slate-900 px-2 py-0.5 text-xs">
                              <span class="text-slate-300">{skillName(skillId)}</span>
                              {#if (level as number) > 1}
                                <span class="text-amber-400">×{level}</span>
                              {/if}
                            </span>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  </section>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</main>
