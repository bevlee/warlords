<script lang="ts">
  import { onMount } from 'svelte';

  let { endsAt, accent = 'frost' }: { endsAt: number; accent?: 'frost' } = $props();

  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const remaining = $derived(Math.max(0, endsAt - now));
  const days = $derived(Math.floor(remaining / 86_400_000));
  const hrs = $derived(Math.floor((remaining % 86_400_000) / 3_600_000));
  const mins = $derived(Math.floor((remaining % 3_600_000) / 60_000));
  const parts = $derived([
    { v: days, l: 'Days' },
    { v: hrs, l: 'Hrs' },
    { v: mins, l: 'Min' },
  ]);
</script>

<div class="flex gap-2" aria-label="Time remaining">
  {#each parts as p (p.l)}
    <div class="min-w-[3.25rem] rounded-lg border border-sky-400/20 bg-sky-400/5 py-2 text-center">
      <b class="block text-xl font-extrabold leading-none tabular-nums text-sky-100">{String(p.v).padStart(2, '0')}</b>
      <span class="text-[9px] uppercase tracking-widest text-sky-300">{p.l}</span>
    </div>
  {/each}
</div>
