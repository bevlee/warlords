<script lang="ts">
  import type { HeroActionView } from './heroActionDisplay';
  import KeywordText from './keyword/KeywordText.svelte';

  interface Props {
    action: HeroActionView;
    canUse?: boolean;
    selected?: boolean;
    onactivate?: () => void;
    oncancel?: () => void;
  }

  let { action, canUse = false, selected = false, onactivate, oncancel }: Props = $props();
</script>

<section class="detail-panel" aria-label="Hero ability details">
  <header class="detail-header">
    <span class="detail-icon" aria-hidden="true">{action.icon}</span>
    <div class="min-w-0 flex-1">
      <p class="detail-kind">{action.kind}</p>
      <h2>{action.label}</h2>
    </div>
    {#if oncancel}
      <button type="button" class="close-button" aria-label="Close ability details" onclick={oncancel}>×</button>
    {/if}
  </header>

  <p class="summary"><KeywordText text={action.summary} /></p>
  <p class="description"><KeywordText text={action.description} /></p>

  <dl>
    <div><dt>Target</dt><dd>{action.targetingLabel}</dd></div>
    <div><dt>Duration</dt><dd>{action.duration}</dd></div>
    {#if action.usesLabel}<div><dt>Uses</dt><dd>{action.usesLabel}</dd></div>{/if}
  </dl>

  {#if action.artifactNotes.length > 0}
    <section class="artifact-notes" aria-label="Artifact modifications">
      <h3>Artifact modifications</h3>
      {#each action.artifactNotes as note (note)}<p><KeywordText text={note} /></p>{/each}
    </section>
  {/if}

  {#if selected && action.targeting !== 'none'}
    <p class="targeting-note">{action.targetingLabel}. The ability activates only after a valid choice.</p>
  {:else if action.targeting !== 'none' && !canUse}
    <p class="read-only-note">No valid target is currently available.</p>
  {:else if onactivate}
    <button type="button" class="activate-button" disabled={!canUse} onclick={onactivate}>
      {canUse ? `Activate ${action.label}` : 'Unavailable this turn'}
    </button>
  {:else}
    <p class="read-only-note">Available for inspection. Actions can only be activated during the hero’s turn.</p>
  {/if}
</section>

<style>
  .detail-panel { height: 100%; overflow-y: auto; border-radius: calc(8 * var(--fx, 1px)); border: 1px solid rgb(100 116 139 / .55); background: rgb(15 23 42 / .94); padding: calc(12 * var(--fx, 1px)); color: #e2e8f0; }
  .detail-header { display: flex; align-items: center; gap: calc(8 * var(--fx, 1px)); border-bottom: 1px solid rgb(100 116 139 / .45); padding-bottom: calc(9 * var(--fx, 1px)); }
  .detail-icon { font-size: calc(28 * var(--fx, 1px)); }
  .detail-kind, h2, h3, p { margin: 0; }
  .detail-kind { font: 700 calc(9 * var(--fx, 1px))/1 ui-monospace, monospace; letter-spacing: .15em; text-transform: uppercase; color: #94a3b8; }
  h2 { margin-top: calc(3 * var(--fx, 1px)); font-size: calc(18 * var(--fx, 1px)); color: #fde68a; }
  .close-button { align-self: flex-start; border-radius: .25rem; padding: 0 .35rem; font-size: calc(18 * var(--fx, 1px)); color: #94a3b8; }
  .close-button:hover { background: #334155; color: white; }
  .summary { margin-top: calc(10 * var(--fx, 1px)); font: 700 calc(12 * var(--fx, 1px))/1.3 ui-monospace, monospace; color: #6ee7b7; }
  .description { margin-top: calc(8 * var(--fx, 1px)); font-size: calc(11.5 * var(--fx, 1px)); line-height: 1.45; color: #cbd5e1; }
  dl { display: grid; gap: calc(7 * var(--fx, 1px)); margin: calc(11 * var(--fx, 1px)) 0 0; }
  dl div { border-left: 2px solid #475569; padding-left: calc(7 * var(--fx, 1px)); }
  dt { font-size: calc(8.5 * var(--fx, 1px)); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
  dd { margin: calc(2 * var(--fx, 1px)) 0 0; font-size: calc(10.5 * var(--fx, 1px)); color: #e2e8f0; }
  .artifact-notes { margin-top: calc(11 * var(--fx, 1px)); border-radius: .35rem; border: 1px solid rgb(245 158 11 / .32); background: rgb(120 53 15 / .16); padding: calc(8 * var(--fx, 1px)); }
  .artifact-notes h3 { font-size: calc(9 * var(--fx, 1px)); letter-spacing: .1em; text-transform: uppercase; color: #fbbf24; }
  .artifact-notes p { margin-top: calc(5 * var(--fx, 1px)); font-size: calc(10 * var(--fx, 1px)); line-height: 1.35; color: #fde68a; }
  .activate-button { width: 100%; margin-top: calc(12 * var(--fx, 1px)); border-radius: .4rem; background: #059669; padding: calc(8 * var(--fx, 1px)); font-size: calc(11 * var(--fx, 1px)); font-weight: 700; color: white; }
  .activate-button:hover:not(:disabled) { background: #10b981; }
  .activate-button:disabled { cursor: not-allowed; opacity: .45; }
  .targeting-note, .read-only-note { margin-top: calc(12 * var(--fx, 1px)); border-radius: .35rem; background: rgb(30 41 59 / .8); padding: calc(8 * var(--fx, 1px)); font-size: calc(10 * var(--fx, 1px)); line-height: 1.35; color: #cbd5e1; }
  .targeting-note { color: #fde68a; }
</style>
