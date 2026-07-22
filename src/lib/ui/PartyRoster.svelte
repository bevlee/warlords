<script lang="ts">
  interface Seat {
    id: string;
    name: string;
    role: string;
    pfp: string;
    tone: 'a' | 'b' | 'c';
    leader: boolean;
    ready: boolean;
    open: boolean;
  }

  let {
    coopMax = 4,
    allReady = $bindable(false),
    filled = $bindable(0),
  }: { coopMax?: number; allReady?: boolean; filled?: number } = $props();

  // Stubbed teammates the "Invite" action drops into an open seat. Real
  // matchmaking is a backend track (see the events season stub).
  const BOTS = [
    { name: 'Sigrid', role: 'Cleric', pfp: '✨', tone: 'c' as const },
    { name: 'Kael', role: 'Sorcerer', pfp: '🔮', tone: 'b' as const },
  ];
  let botIdx = 0;

  function openSeat(id: string): Seat {
    return { id, name: '', role: '', pfp: '+', tone: 'a', leader: false, ready: false, open: true };
  }

  let seats = $state<Seat[]>([
    { id: 'you', name: 'You', role: 'Warlord', pfp: '⚔️', tone: 'a', leader: true, ready: false, open: false },
    { id: 'p2', name: 'Bjorn', role: 'Ranger', pfp: '🏹', tone: 'b', leader: false, ready: true, open: false },
    openSeat('s3'),
    openSeat('s4'),
  ]);

  const tone: Record<Seat['tone'], string> = {
    a: 'bg-gradient-to-br from-orange-800 to-amber-700',
    b: 'bg-gradient-to-br from-indigo-800 to-violet-700',
    c: 'bg-gradient-to-br from-cyan-800 to-cyan-600',
  };

  function invite(i: number) {
    const bot = BOTS[botIdx % BOTS.length];
    botIdx += 1;
    seats[i] = { id: 'inv-' + i, name: bot.name, role: bot.role, pfp: bot.pfp, tone: bot.tone, leader: false, ready: true, open: false };
  }

  function toggleReady() {
    const i = seats.findIndex((s) => s.leader);
    seats[i] = { ...seats[i], ready: !seats[i].ready };
  }

  const occupied = $derived(seats.filter((s) => !s.open));
  $effect(() => {
    filled = occupied.length;
    allReady = occupied.every((s) => s.ready);
  });
</script>

<ul class="flex flex-col gap-2">
  {#each seats as seat, i (seat.id)}
    <li
      class="flex items-center gap-3 rounded-xl border px-3 py-2.5 {seat.leader
        ? 'border-amber-500/30 bg-amber-500/5'
        : seat.open
          ? 'border-dashed border-slate-600/70 bg-slate-800/30'
          : 'border-slate-700/60 bg-slate-800/40'}"
    >
      <span class="grid h-8 w-8 flex-none place-items-center rounded-full text-sm {seat.open ? 'bg-slate-700/50 text-slate-500' : tone[seat.tone]}">
        {seat.pfp}
      </span>
      <span class="min-w-0 flex-1 leading-tight">
        <b class="block truncate text-sm font-bold text-slate-100">{seat.open ? 'Open seat' : seat.name}</b>
        <span class="text-[11px] text-slate-400">{seat.open ? 'Invite or match' : seat.role}</span>
      </span>

      {#if seat.leader}
        <button
          type="button"
          onclick={toggleReady}
          class="rounded-lg px-3 py-1 text-xs font-bold {seat.ready
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'border border-slate-600 bg-slate-700/50 text-slate-200 hover:bg-slate-700'}"
        >
          {seat.ready ? '● Ready' : 'Ready up'}
        </button>
      {:else if seat.open}
        <button
          type="button"
          onclick={() => invite(i)}
          class="text-xs font-bold text-sky-300 hover:text-sky-200"
        >
          Invite →
        </button>
      {:else}
        <span class="text-xs font-bold text-emerald-300">● Ready</span>
      {/if}
    </li>
  {/each}
</ul>
