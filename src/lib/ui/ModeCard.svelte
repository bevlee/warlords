<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    accent: 'frost' | 'amber' | 'sky' | 'emerald';
    kicker: string;
    title: string;
    desc: string;
    href: string;
    cta: string;
    badge?: string;
    live?: boolean;
    tall?: boolean;
    extra?: Snippet;
    secondary?: Snippet;
  }

  let { accent, kicker, title, desc, href, cta, badge, live = false, tall = false, extra, secondary }: Props =
    $props();

  const rail: Record<Props['accent'], string> = {
    frost: 'from-sky-300 to-violet-400',
    amber: 'from-amber-300 to-amber-500',
    sky: 'from-sky-300 to-cyan-500',
    emerald: 'from-emerald-300 to-teal-500',
  };
  const kick: Record<Props['accent'], string> = {
    frost: 'text-sky-300',
    amber: 'text-amber-300',
    sky: 'text-sky-400',
    emerald: 'text-emerald-300',
  };
  const button: Record<Props['accent'], string> = {
    frost: 'bg-gradient-to-r from-sky-300 to-indigo-400 text-slate-900 hover:brightness-110',
    amber: 'bg-gradient-to-r from-amber-300 to-amber-500 text-amber-950 hover:brightness-110',
    sky: 'border border-slate-600 bg-slate-700/60 text-slate-100 hover:bg-slate-700',
    emerald: 'bg-gradient-to-r from-emerald-300 to-teal-400 text-emerald-950 hover:brightness-110',
  };
</script>

<section
  class="relative flex flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800/40 p-5 {tall
    ? 'sm:row-span-2'
    : ''}"
>
  <span class="absolute inset-y-0 left-0 w-1 bg-gradient-to-b {rail[accent]}"></span>

  <div class="flex items-start justify-between gap-3">
    <div class="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest {kick[accent]}">
      {#if live}
        <span class="inline-block h-2 w-2 rounded-full bg-current motion-safe:animate-pulse"></span>
      {/if}
      {kicker}
    </div>
    {#if badge}
      <span class="whitespace-nowrap rounded-full border border-slate-600 bg-slate-700/50 px-2.5 py-0.5 text-[11px] font-bold text-slate-200">
        {badge}
      </span>
    {/if}
  </div>

  <h2 class="mt-2 text-xl font-extrabold tracking-tight text-slate-50 {tall ? 'sm:text-2xl' : ''}">{title}</h2>
  <p class="mt-1 text-sm text-slate-400">{desc}</p>

  {#if extra}
    <div class="mt-4">{@render extra()}</div>
  {/if}

  <div class="mt-auto flex gap-2 pt-5">
    <a href={href} class="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-extrabold {button[accent]}">{cta}</a>
    {#if secondary}{@render secondary()}{/if}
  </div>
</section>
