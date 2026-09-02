<script lang="ts">
  import { ITEMS, itemEffectText, type ItemId } from '$lib/gauntlet/items';
  import ItemIcon from './ItemIcon.svelte';
  interface Props { id: ItemId; onclose?: () => void; }
  let { id, onclose }: Props = $props();
  const item = $derived(ITEMS[id]);
</script>

<section class="artifact-detail" aria-label="Artifact details">
  <header><ItemIcon {id} class="artifact-icon" /><div><p>Army artifact · {item.rarity}</p><h2>{item.name}</h2></div>{#if onclose}<button type="button" aria-label="Close artifact details" onclick={onclose}>×</button>{/if}</header>
  <p class="effect">{itemEffectText(item)}</p>
  <div class="ownership"><strong>Ownership</strong><p>This artifact belongs to the army. It is not equipped by an individual unit.</p></div>
  {#if item.requiresUnit?.length}
    <div class="connections"><strong>Relevant units and abilities</strong><p>{item.requiresUnit.join(' or ')} enables this artifact’s draft or supplies the ability it modifies.</p></div>
  {:else}
    <div class="connections"><strong>Scope</strong><p>Army-wide or triggered by the battle condition described above.</p></div>
  {/if}
</section>

<style>
  .artifact-detail { height: 100%; overflow-y: auto; border-radius: calc(8 * var(--fx)); border: 1px solid rgb(100 116 139 / .55); background: rgb(15 23 42 / .94); padding: calc(11 * var(--fx)); color: #e2e8f0; }
  header { display: flex; align-items: center; gap: calc(8 * var(--fx)); border-bottom: 1px solid #334155; padding-bottom: calc(9 * var(--fx)); }
  header :global(.artifact-icon) { width: calc(42 * var(--fx)); height: calc(42 * var(--fx)); object-fit: contain; image-rendering: pixelated; }
  header div { min-width: 0; flex: 1; }
  header p, h2, .effect, div p { margin: 0; }
  header p { font: 700 calc(8.5 * var(--fx))/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; }
  h2 { margin-top: calc(3 * var(--fx)); font-size: calc(17 * var(--fx)); color: #fde68a; }
  header button { align-self: flex-start; font-size: calc(18 * var(--fx)); color: #94a3b8; }
  .effect { margin-top: calc(11 * var(--fx)); font: 700 calc(11 * var(--fx))/1.45 ui-monospace, monospace; color: #fcd34d; }
  .ownership, .connections { margin-top: calc(10 * var(--fx)); border-left: 2px solid #475569; padding-left: calc(8 * var(--fx)); }
  strong { font-size: calc(9 * var(--fx)); letter-spacing: .09em; text-transform: uppercase; color: #94a3b8; }
  div p { margin-top: calc(4 * var(--fx)); font-size: calc(10.5 * var(--fx)); line-height: 1.4; color: #cbd5e1; }
</style>
