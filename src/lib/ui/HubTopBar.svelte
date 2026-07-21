<script lang="ts">
  let { gold = 0 }: { gold?: number } = $props();
</script>

<header class="flex items-center justify-between gap-3">
  <a href="/" class="text-xl font-black tracking-tight text-slate-50">WAR<span class="text-amber-400">L</span>ORDS</a>
  <div class="flex items-center gap-3">
    <span class="inline-flex items-center gap-1.5 font-extrabold tabular-nums text-amber-300" aria-label="{gold} gold">
      <span class="h-4 w-4 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 shadow-inner"></span>
      {gold.toLocaleString()}
    </span>
    <a
      href="/settings"
      class="flex items-center gap-2 rounded-full border border-slate-600/60 bg-slate-700/40 py-1 pl-1 pr-3 hover:bg-slate-700/70"
    >
      <span class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-sm">👤</span>
      <span class="hidden text-left leading-tight sm:block">
        <b class="block text-xs font-bold text-slate-100">Profile</b>
        <span class="text-[10px] text-slate-400">Settings</span>
      </span>
    </a>
  </div>
</header>
