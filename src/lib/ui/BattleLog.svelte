<script lang="ts">
  interface Props {
    lines: string[];
  }

  let { lines }: Props = $props();

  let scroller: HTMLDivElement | undefined = $state();

  $effect(() => {
    void lines.length;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
</script>

<div
  bind:this={scroller}
  class="h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-xs leading-relaxed text-slate-300"
>
  {#each lines as line, i (i)}
    <p>{line}</p>
  {/each}
</div>
