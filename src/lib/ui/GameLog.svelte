<script lang="ts">
  import type { LogLine, DamageTier } from './logLines';
  import { CONTROLLER_STYLE } from './controllers';

  // Permanent, scrollable battle history, grouped under sticky round headers.
  interface Props {
    lines: LogLine[];
    /** Battle-screen dock panel: scaled off --fx and short by design. */
    dense?: boolean;
    /** Renders an Expand button in the header when provided. */
    onexpand?: (() => void) | null;
  }

  let { lines, dense = false, onexpand = null }: Props = $props();

  // Log body is 11px; damage grows with the hit. Literal classes for Tailwind.
  const DAMAGE_CLS: Record<DamageTier, string> = {
    0: 'text-[13px]',
    1: 'text-[15px]',
    2: 'text-[17px]',
    3: 'text-[20px]',
  };

  // Group the flat line list into rounds so each round gets a sticky header
  // and its own block. Lines before the first round marker (rare) go into an
  // unlabelled leading group.
  const groups = $derived.by(() => {
    const out: { round: number | null; lines: Extract<LogLine, { kind: 'event' }>[] }[] = [];
    let current: (typeof out)[number] | null = null;
    for (const line of lines) {
      if (line.kind === 'round') {
        current = { round: line.round, lines: [] };
        out.push(current);
        continue;
      }
      if (!current) {
        current = { round: null, lines: [] };
        out.push(current);
      }
      current.lines.push(line);
    }
    return out;
  });

  let scroller = $state<HTMLDivElement>();
  // Stick to the bottom until the user scrolls up to read history; resume once
  // they scroll back down near the end.
  let stick = $state(true);

  function onScroll() {
    const el = scroller;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stick = nearBottom;
  }

  // Re-run whenever the line count changes; scroll only if we're sticking.
  $effect(() => {
    void lines.length;
    if (stick && scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
</script>

<div
  class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-600/60
    bg-slate-900/85 shadow-lg"
  class:dense
>
  <div class="log-header flex shrink-0 items-center justify-between border-b border-slate-600/50 px-3 py-1.5">
    <h2 class="log-title text-xs font-semibold uppercase tracking-wide text-slate-300">Battle Log</h2>
    {#if onexpand}
      <button type="button" class="expand-button" title="Expand the full battle log" onclick={() => onexpand?.()}>
        <span aria-hidden="true">▲</span> Expand
      </button>
    {/if}
  </div>
  <div
    bind:this={scroller}
    onscroll={onScroll}
    class="log-body min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-snug"
  >
    {#each groups as group (group.round ?? -1)}
      <div class="mb-1.5">
        {#if group.round !== null}
          <p
            class="round-header sticky top-0 -mx-3 mb-0.5 bg-slate-900/95 px-3 py-0.5 text-[10px] font-semibold
              uppercase tracking-wide text-amber-300/90"
          >
            Round {group.round}
          </p>
        {/if}
        {#each group.lines as line, i (i)}
          <p class="text-slate-400">
            {#each line.segments as seg, j (j)}
              {#if seg.controller}<span class="font-semibold {CONTROLLER_STYLE[seg.controller].log}">{seg.text}</span
              >{:else if seg.damage !== undefined}<span class="font-bold text-red-400 {DAMAGE_CLS[seg.damage]}">{seg.text}</span
              >{:else if seg.kills}<span class="font-bold text-slate-200">{seg.text}</span
              >{:else if seg.emph}<span class="font-bold text-slate-200">{seg.text}</span
              >{:else}{seg.text}{/if}
            {/each}
          </p>
        {/each}
      </div>
    {/each}
    {#if lines.length === 0}
      <p class="text-slate-500 italic">No events yet.</p>
    {/if}
  </div>
</div>

<style>
  /* The dense variant is the battle screen's bottom-right panel: same markup,
     sized off --fx so it keeps its proportions at any resolution — see
     "Fitting the screen" in Battle.svelte. */
  .expand-button {
    display: flex;
    align-items: center;
    gap: calc(4 * var(--fx));
    padding: calc(2 * var(--fx)) calc(7 * var(--fx));
    border-radius: calc(5 * var(--fx));
    border: 1px solid rgb(148 163 184 / 0.4);
    background: rgb(30 41 59 / 0.9);
    font-family: ui-monospace, monospace;
    font-size: calc(9 * var(--fx));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #cbd5e1;
  }

  .expand-button:hover {
    background: rgb(51 65 85 / 0.95);
    border-color: #cbd5e1;
  }

  .dense .log-header {
    padding: calc(5 * var(--fx)) calc(9 * var(--fx));
  }

  .dense .log-title {
    font-size: calc(10 * var(--fx));
    letter-spacing: 0.18em;
  }

  .dense .log-body {
    padding: calc(5 * var(--fx)) calc(9 * var(--fx));
    font-size: calc(11 * var(--fx));
    line-height: 1.45;
  }

  .dense .round-header {
    margin-inline: calc(-9 * var(--fx));
    padding-inline: calc(9 * var(--fx));
    font-size: calc(10 * var(--fx));
  }

  .log-body::-webkit-scrollbar {
    width: calc(7 * var(--fx));
  }

  .log-body::-webkit-scrollbar-track {
    background: rgb(30 41 59 / 0.8);
    border-radius: 4px;
  }

  .log-body::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }
</style>
