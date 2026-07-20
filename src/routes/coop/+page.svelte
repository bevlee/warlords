<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ArmySetup from '$lib/ui/ArmySetup.svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import { getSession } from '$lib/net/api';
  import { MultiplayerClient, type ConnectionStatus } from '$lib/net/wsClient';
  import { battleStateHash, type CoopLoadout, type ServerMessage } from '$lib/net/protocol';
  import { budgetForLevel } from '$lib/engine/progression';
  import { updateFactionSkills } from '$lib/engine/factionSkills';
  import type { ArmySlot, BattleAction, BattleState, FactionClass, Hero } from '$lib/engine/types';

  const DEFAULT_HERO: Hero = updateFactionSkills({
    class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
  });

  let hero = $state({ ...DEFAULT_HERO });
  let screen: 'setup' | 'lobby' | 'battle' = $state('setup');
  let loadout: CoopLoadout | null = $state(null);
  let client: MultiplayerClient | null = null;
  let playerId = $state('');
  let roomCode = $state('');
  let joinCode = $state('');
  let controllerId: 'host' | 'guest' = $state('host');
  let battleState: BattleState | null = $state(null);
  let waiting = $state(false);
  let connectionStatus: ConnectionStatus = $state('idle');
  let outcome: 'player_wins' | 'enemy_wins' | 'abandoned' | null = $state(null);
  let error = $state('');
  let chatMessages: Array<{ byController: 'host' | 'guest'; text: string }> = $state([]);
  let controls: {
    applyRemote: (action: BattleAction) => Promise<BattleState>;
    resync: (state: BattleState) => void;
  } | null = null;
  const pending: Array<{ action: BattleAction; hash: string }> = [];
  let actionChain = Promise.resolve();

  onMount(async () => {
    const saved = await import('$lib/storage').then(module => module.loadHero());
    if (saved) hero = updateFactionSkills({ ...saved, factionSkills: saved.factionSkills ?? [] });
  });

  onDestroy(() => client?.stop());

  async function chooseArmy(army: ArmySlot[]) {
    loadout = { hero, army };
    screen = 'lobby';
    const session = await getSession();
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    client = new MultiplayerClient(`${scheme}//${location.host}/ws`, session.token);
    client.onMessage(handleMessage);
    client.onStatus(status => (connectionStatus = status));
    client.start();
  }

  function handleMessage(message: ServerMessage) {
    if (message.type === 'hello.ok') playerId = message.playerId;
    else if (message.type === 'room.state') {
      roomCode = message.code;
      const me = message.players.find(player => player.playerId === playerId);
      if (me) controllerId = me.controllerId;
    } else if (message.type === 'deploy.state') {
      battleState = message.state;
      screen = 'battle';
      controls?.resync(message.state);
    } else if (message.type === 'battle.start') {
      battleState = message.initialState;
      screen = 'battle';
      controls?.resync(message.initialState);
    } else if (message.type === 'battle.applied') {
      if (!controls) pending.push({ action: message.action, hash: message.stateHash });
      else queueAction(message.action, message.stateHash);
    } else if (message.type === 'battle.resync') {
      battleState = message.state;
      controls?.resync(message.state);
    } else if (message.type === 'room.waiting') waiting = message.waiting;
    else if (message.type === 'battle.end') outcome = message.result;
    else if (message.type === 'chat.message') {
      chatMessages = [...chatMessages, { byController: message.byController, text: message.text }];
    } else if (message.type === 'error') {
      error = message.msg;
      if (message.code === 'room_gone') returnToSetup(false);
    }
  }

  function queueAction(action: BattleAction, expectedHash: string) {
    actionChain = actionChain.then(async () => {
      if (!controls) return;
      const state = await controls.applyRemote(action);
      battleState = state;
      if (battleStateHash(state) !== expectedHash) client?.send({ type: 'resync.request' });
    });
  }

  function networkReady(next: NonNullable<typeof controls>) {
    controls = next;
    if (battleState) controls.resync(battleState);
    for (const item of pending.splice(0)) queueAction(item.action, item.hash);
  }

  function createRoom() {
    if (loadout && !client?.send({ type: 'room.create', loadout })) error = 'Still connecting…';
  }

  function joinRoom() {
    if (loadout && !client?.send({ type: 'room.join', code: joinCode.toUpperCase(), loadout })) error = 'Still connecting…';
  }

  function returnToSetup(clearError = true) {
    client?.stop();
    client = null;
    controls = null;
    pending.splice(0);
    loadout = null;
    roomCode = '';
    joinCode = '';
    battleState = null;
    chatMessages = [];
    waiting = false;
    outcome = null;
    connectionStatus = 'idle';
    screen = 'setup';
    if (clearError) error = '';
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <div class="mb-4 flex items-center gap-4">
    <h1 class="text-2xl font-bold">Warlords — Online co-op</h1>
    <a href="/" class="text-slate-400 hover:text-slate-200">← main game</a>
    <a href="/history" class="text-violet-400 hover:text-violet-300">Battle history</a>
  </div>

  {#if error}<p class="mx-auto mb-4 max-w-xl rounded border border-red-700 bg-red-950 p-3 text-red-200">{error}</p>{/if}
  {#if connectionStatus === 'lost'}
    <p class="mx-auto mb-4 max-w-xl rounded border border-amber-700 bg-amber-950 p-3 text-amber-200">
      Connection lost. Reconnecting automatically…
    </p>
  {/if}

  {#if screen === 'setup'}
    <ArmySetup
      {hero}
      budget={budgetForLevel(hero.level)}
      lastBattle={null}
      onstart={chooseArmy}
      onreset={() => (hero = { ...DEFAULT_HERO })}
      onclass={(cls: FactionClass) => (hero = updateFactionSkills({ ...hero, class: cls }))}
    />
  {:else if screen === 'lobby'}
    <div class="mx-auto mt-12 max-w-lg rounded-xl border border-slate-700 bg-slate-800 p-6 text-center">
      {#if roomCode}
        <p class="text-sm text-slate-400">Room code</p>
        <p class="my-4 font-mono text-5xl tracking-[0.25em] text-amber-300">{roomCode}</p>
        <p class="text-slate-300">Waiting for the second warlord…</p>
      {:else}
        <button class="w-full rounded bg-amber-600 px-5 py-3 font-semibold hover:bg-amber-500" onclick={createRoom}>Create room</button>
        <div class="my-5 flex items-center gap-3">
          <div class="h-px flex-1 bg-slate-700"></div><span class="text-slate-500">or join</span><div class="h-px flex-1 bg-slate-700"></div>
        </div>
        <div class="flex gap-2">
          <input bind:value={joinCode} maxlength="5" placeholder="ABCDE" class="min-w-0 flex-1 rounded bg-slate-900 px-4 py-3 text-center font-mono uppercase tracking-widest" />
          <button class="rounded bg-emerald-700 px-5 font-semibold hover:bg-emerald-600" onclick={joinRoom}>Join</button>
        </div>
      {/if}
    </div>
  {:else if battleState && loadout}
    <Battle
      playerArmy={loadout.army}
      enemyArmy={[]}
      {hero}
      initialState={battleState}
      localControllerId={controllerId}
      waitingForPeer={waiting}
      {chatMessages}
      allowRestart={false}
      onexit={returnToSetup}
      exitLabel="Return to co-op"
      online={{
        deployMove: (unitId, to) => void client?.send({ type: 'deploy.move', unitId, to }),
        deploySplit: (unitId, amount, to) => void client?.send({ type: 'deploy.split', unitId, amount, to }),
        confirmDeploy: () => void client?.send({ type: 'deploy.confirm' }),
        action: action => void client?.send({ type: 'battle.action', lastSeq: client?.latestSeq ?? 0, action }),
        chat: text => void client?.send({ type: 'chat.send', text }),
        ready: networkReady,
      }}
    />
    {#if outcome === 'abandoned'}
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
        <div class="rounded-lg border border-amber-600 bg-slate-900 p-6 text-center shadow-xl">
          <h2 class="text-2xl font-bold text-amber-300">Battle abandoned</h2>
          <p class="my-3 text-slate-300">The reconnect window expired. Your campaign save was not changed.</p>
          <button onclick={() => returnToSetup()} class="rounded bg-emerald-700 px-5 py-2 font-semibold hover:bg-emerald-600">Return to co-op</button>
        </div>
      </div>
    {/if}
  {/if}
</main>
