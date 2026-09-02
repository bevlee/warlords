<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { heroSpriteName } from '$lib/ui/sprites';
  import { heroActionsFor } from '$lib/ui/heroActionDisplay';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { maxMana } from '$lib/engine/factionSkills';
  import { SPELLS, lightningDamage } from '$lib/engine/battle';
  import type { Hero } from '$lib/engine/types';
  import type { ItemId } from '$lib/gauntlet/items';

  interface Props {
    hero: Hero;
    /** Owned artifacts, so upgraded actions read at their real values here
     *  rather than only once the battle has started. */
    items?: ItemId[];
    /** Battles won + 1: what the wizard's mana ceiling scales with. */
    runDepth?: number;
  }

  let { hero, items = [], runDepth }: Props = $props();

  const actions = $derived(heroActionsFor(hero, items));
  const mana = $derived(maxMana(hero, runDepth));
</script>

<section aria-label="Hero">
  <h2 class="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
    Hero — <span class="text-amber-200">{FACTION_INFO[hero.class].name}</span>
  </h2>

  <div class="flex gap-4 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
    <Sprite name={heroSpriteName(hero.class)} animate class="h-24 w-20 shrink-0 self-start" />

    <div class="min-w-0 flex-1">
      {#if actions.length > 0}
        <!-- Named outright: the cards below are what the hero itself can do in
             a battle, not the army's or a unit's. -->
        <h3 class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Abilities <span class="font-normal normal-case tracking-normal text-slate-600">— your hero's own actions in battle</span>
        </h3>
        <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each actions as action (action.id)}
            <li class="rounded border border-slate-700 bg-slate-900/50 p-2.5">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-semibold text-amber-200">{action.label}</span>
                <span class="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {action.kind}
                </span>
              </div>
              <p class="mt-1 text-[13px] leading-snug text-slate-300">
                <KeywordText text={action.description} />
              </p>
              <p class="mt-1.5 text-[11px] text-slate-500">{action.targetingLabel} · {action.duration}</p>
              {#each action.artifactNotes as note (note)}
                <p class="mt-1 text-[11px] text-emerald-300"><KeywordText text={note} /></p>
              {/each}
            </li>
          {/each}
        </ul>
      {/if}

      {#if mana > 0}
        <!-- The wizard has no hero actions; spells are its whole kit. -->
        <h3 class="{actions.length > 0 ? 'mt-3 ' : ''}mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Spells <span class="font-normal normal-case tracking-normal text-slate-600">— cast with mana during a battle</span>
        </h3>
        <div class="rounded border border-sky-900 bg-sky-950/40 p-2.5">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold text-sky-200">Lightning</span>
            <span class="shrink-0 rounded bg-sky-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-200">
              {SPELLS.lightning.cost} mana
            </span>
          </div>
          <p class="mt-1 text-[13px] leading-snug text-slate-300">
            Strikes one enemy stack for {lightningDamage(hero.level)} true damage — it ignores attack,
            defence and buffs, and draws no retaliation.
          </p>
          <p class="mt-1.5 text-[11px] text-slate-500">
            {mana} mana this battle, rising as the run goes deeper.
          </p>
        </div>
      {/if}

      {#if actions.length === 0 && mana === 0}
        <p class="text-sm text-slate-500">This hero fights alongside its army and has no special actions.</p>
      {/if}
    </div>
  </div>
</section>
