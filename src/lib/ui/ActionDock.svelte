<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import { abilityLevel } from '$lib/engine/abilityCatalog';
  import { abilityInfo } from './abilities';
  import { skillIconFor, skillGlyph } from './skillIcons';
  import { statusIconFor } from './statusIcons';
  import { attributeIconFor } from './attributeIcons';
  import { entryHref } from '$lib/compendium/entries';
  import Sprite from './Sprite.svelte';
  import type { HeroActionView } from './heroActionDisplay';

  // The battle screen's bottom band: everything the acting stack can do, in one
  // strip. Sized entirely off `--fx`, the scaled pixel published by
  // Battle.svelte — see "Fitting the screen" there for what it is and why.

  interface Props {
    /** The stack whose turn it is — the dock always describes this unit. */
    unit: UnitStack | null;
    disabled: boolean;
    isHeroTurn: boolean;
    spellbookOpen: boolean;
    /** Activated abilities the acting stack can use this turn, already gated by
     *  the engine's canActivate — `enabled` is the whole rule, not a hint. */
    abilities?: { id: string; info: { label: string; description: string }; enabled: boolean; view?: HeroActionView }[];
    selectedAbilityId?: string | null;
    onwait: () => void;
    ondefend: () => void;
    /** Hovering an action projects its effect onto the turns bar. Null on
     *  leave. Read-only — the projection never commits anything. */
    onpreview?: (action: 'wait' | 'defend' | null) => void;
    onspellbook: () => void;
    onability?: (abilityId: string) => void;
  }

  let {
    unit,
    disabled,
    isHeroTurn,
    spellbookOpen,
    abilities = [],
    selectedAbilityId = null,
    onwait,
    ondefend,
    onpreview,
    onspellbook,
    onability,
  }: Props = $props();

  // Top-creature HP, the same figure UnitInfo shows.
  const hpFraction = $derived(
    unit ? Math.max(0, Math.min(1, unit.hp / unit.definition.hp)) : 0
  );

  const passives = $derived(
    (unit?.definition.abilities ?? []).map(id => ({
      id,
      taught: unit?.definition.grantedAbilities?.includes(id) ?? false,
      ...abilityInfo(id, unit ? abilityLevel(unit.definition, id) : undefined),
    }))
  );

  // The spellbook takes the first slot on the hero's turn; a stack's activated
  // abilities fill from the left on its own turn. Padded out to a fixed count
  // with empty slots so the dock's width never jumps between stacks.
  const SLOT_COUNT = 3;
  const abilitySlots = $derived.by(() => {
    const filled: ({ kind: 'spell' } | { kind: 'ability'; ability: (typeof abilities)[number] })[] =
      isHeroTurn && abilities.length === 0
        ? [{ kind: 'spell' }]
        : abilities.map(ability => ({ kind: 'ability', ability }));
    return Array.from({ length: Math.max(SLOT_COUNT, filled.length) }, (_, i) => filled[i] ?? null);
  });
</script>

<div class="dock">
  <div class="segment active-creature">
    {#if unit}
      <div class="portrait-ring">
        <Sprite name={unit.definition.name} class="portrait-sprite" />
      </div>
      <div class="active-meta">
        <p class="active-name {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
          {unit.isHero ? 'Hero' : unit.definition.name}
        </p>
        {#if !unit.isHero}<p class="active-count">×{unit.count}</p>
          <div class="hp-track">
            <div class="hp-fill" style="width: {hpFraction * 100}%"></div>
          </div>
          <span class="hp-text">{unit.hp} / {unit.definition.hp} HP</span>
        {/if}
      </div>
    {:else}
      <p class="empty-note">No active stack.</p>
    {/if}
  </div>

  <div class="rule" aria-hidden="true"></div>

  <div class="segment column">
    <div class="segment-body row">
      <button
        type="button"
        class="action-button"
        aria-label="Wait"
        title="Wait — act again in half a cycle"
        {disabled}
        onclick={onwait}
        onmouseenter={() => !disabled && onpreview?.('wait')}
        onmouseleave={() => onpreview?.(null)}
        onfocus={() => !disabled && onpreview?.('wait')}
        onblur={() => onpreview?.(null)}
      >
        <span class="action-glyph">⏳</span>
        <span class="action-label">Wait</span>
      </button>
      <button
        type="button"
        class="action-button"
        aria-label="Defend"
        title="Defend — +30% defense until your next turn"
        {disabled}
        onclick={ondefend}
        onmouseenter={() => !disabled && onpreview?.('defend')}
        onmouseleave={() => onpreview?.(null)}
        onfocus={() => !disabled && onpreview?.('defend')}
        onblur={() => onpreview?.(null)}
      >
        <img src={statusIconFor('defending')} alt="" class="action-icon" />
        <span class="action-label">Defend</span>
      </button>
    </div>
    <span class="segment-caption">Actions</span>
  </div>

  <div class="rule" aria-hidden="true"></div>

  <!-- Active abilities: the hero's spellbook lives in the first slot. -->
  <div class="segment column {isHeroTurn && abilities.length > 0 ? 'hero-actions' : ''}">
    {#if isHeroTurn && abilities.length > 0}
      <div class="hero-card-list">
        {#each abilities as ability (ability.id)}
          <button
            type="button"
            class="hero-card {selectedAbilityId === ability.id ? 'selected' : ''} {!ability.enabled ? 'unavailable' : ''}"
            aria-pressed={selectedAbilityId === ability.id}
            aria-disabled={!ability.enabled}
            onclick={() => onability?.(ability.id)}
          >
            <span class="hero-card-icon" aria-hidden="true">{ability.view?.icon ?? '✦'}</span>
            <span class="hero-card-copy">
              <strong>{ability.info.label}</strong>
              <small>{ability.view?.summary ?? ability.info.description}</small>
              {#if ability.view?.usesLabel}<em>{ability.view.usesLabel}</em>{/if}
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="segment-body row slots">
        {#each abilitySlots as slot, i (i)}
        {#if slot?.kind === 'spell'}
          <div class="slot-wrap">
            <button
              type="button"
              class="slot spell-slot {spellbookOpen ? 'open' : ''}"
              aria-label="Spellbook"
              title="Spellbook — cast on the hero's turn"
              {disabled}
              onclick={onspellbook}
            >
              <img src={attributeIconFor('mana')} alt="" class="slot-icon" />
            </button>
            <span class="slot-label filled">Spells</span>
          </div>
        {:else if slot?.kind === 'ability'}
          <div class="slot-wrap">
            <button
              type="button"
              class="slot ability-slot"
              aria-label={slot.ability.info.label}
              title="{slot.ability.info.label} — {slot.ability.info.description}"
              disabled={!slot.ability.enabled}
              onclick={() => onability?.(slot.ability.id)}
            >
              <img src={statusIconFor('life_drain')} alt="" class="slot-icon" />
            </button>
            <span class="slot-label filled">{slot.ability.info.label}</span>
          </div>
        {:else}
          <div class="slot-wrap">
            <span class="slot empty" title="Empty ability slot"></span>
            <span class="slot-label">—</span>
          </div>
        {/if}
        {/each}
      </div>
    {/if}
    <span class="segment-caption">{isHeroTurn && abilities.length > 0 ? 'Hero abilities' : 'Active abilities'}</span>
  </div>

  <div class="rule" aria-hidden="true"></div>

  <!-- Passive abilities: the list scrolls, the caption stays pinned to the
       bottom of the dock however many entries there are. -->
  <div class="segment column grow">
    <div class="passive-list">
      {#each passives as ability (ability.id)}
        <div>
          <p class="passive-label {ability.taught ? 'taught' : ''}">
            {#if ability.taught}
              {#if skillIconFor(ability.id)}
                <img src={skillIconFor(ability.id)} alt="" class="passive-icon" />
              {:else}
                <span aria-hidden="true">{skillGlyph(ability.id)}</span>
              {/if}
            {/if}
            <a href={entryHref('ability', ability.id)} target="_blank" rel="noopener">{ability.label}</a>
            {#if ability.taught}<span class="taught-tag">taught</span>{/if}
          </p>
          <p class="passive-desc">{ability.description}</p>
        </div>
      {:else}
        <p class="passive-desc none">This stack has no passive abilities.</p>
      {/each}
    </div>
    <span class="segment-caption">Passive abilities</span>
  </div>
</div>

<style>
  /* Sizes track --fx (see Battle.svelte, "Fitting the screen"): each N in
     calc(N * var(--fx)) is the design's pixel value at reference size. */
  .dock {
    display: flex;
    height: 100%;
    min-width: 0;
    align-items: stretch;
    gap: calc(12 * var(--fx));
    padding: calc(9 * var(--fx)) calc(14 * var(--fx));
    border-radius: calc(10 * var(--fx));
    border: 1px solid rgb(203 168 92 / 0.28);
    background: linear-gradient(180deg, rgb(24 33 60 / 0.95), rgb(11 17 33 / 0.95));
    box-shadow:
      0 -2px 26px rgb(0 0 0 / 0.5),
      inset 0 1px 0 rgb(255 255 255 / 0.05);
  }

  .rule {
    flex: none;
    width: 1px;
    background: linear-gradient(180deg, transparent, rgb(203 168 92 / 0.35), transparent);
  }

  .segment {
    flex: none;
    min-width: 0;
  }

  .segment.column {
    display: flex;
    flex-direction: column;
    gap: calc(6 * var(--fx));
    align-self: stretch;
  }

  .segment.grow {
    flex: 1;
  }

  .segment.hero-actions {
    width: calc(480 * var(--fx));
  }

  .hero-card-list {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: calc(7 * var(--fx));
  }

  .hero-card {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: calc(6 * var(--fx));
    border-radius: calc(8 * var(--fx));
    border: 1px solid rgb(52 211 153 / .5);
    background: linear-gradient(180deg, rgb(6 78 59 / .42), rgb(15 23 42 / .85));
    padding: calc(7 * var(--fx));
    text-align: left;
  }

  .hero-card:hover:not(:disabled), .hero-card.selected {
    border-color: #fcd34d;
    background: linear-gradient(180deg, rgb(120 53 15 / .45), rgb(15 23 42 / .9));
  }

  .hero-card.unavailable { opacity: .58; }
  .hero-card-icon { flex: none; font-size: calc(20 * var(--fx)); line-height: 1; }
  .hero-card-copy { min-width: 0; }
  .hero-card-copy strong, .hero-card-copy small, .hero-card-copy em { display: block; }
  .hero-card-copy strong { font-size: calc(11 * var(--fx)); line-height: 1.15; color: #fde68a; }
  .hero-card-copy small { margin-top: calc(3 * var(--fx)); font-size: calc(8.5 * var(--fx)); line-height: 1.25; color: #cbd5e1; }
  .hero-card-copy em { margin-top: calc(3 * var(--fx)); font-size: calc(7.5 * var(--fx)); font-style: normal; color: #6ee7b7; }

  .segment-body {
    flex: 1;
    min-height: 0;
  }

  .segment-body.row {
    display: flex;
    align-items: stretch;
    gap: calc(9 * var(--fx));
  }

  .segment-body.slots {
    align-items: center;
    gap: calc(11 * var(--fx));
  }

  .segment-caption {
    flex: none;
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgb(148 163 184 / 0.65);
  }

  .segment.column:not(.grow) .segment-caption {
    text-align: center;
  }

  /* ── active creature ───────────────────────────────────────────── */

  .active-creature {
    display: flex;
    align-items: center;
    gap: calc(10 * var(--fx));
  }

  .portrait-ring {
    position: relative;
    display: flex;
    flex: none;
    align-items: flex-end;
    justify-content: center;
    width: calc(84 * var(--fx));
    height: calc(84 * var(--fx));
    overflow: hidden;
    border-radius: 50%;
    border: 3px solid #4ade80;
    background: radial-gradient(circle at 50% 30%, #1e293b, #0b1220);
    box-shadow:
      0 0 18px rgb(74 222 128 / 0.4),
      inset 0 0 18px rgb(0 0 0 / 0.7);
  }

  .portrait-ring :global(.portrait-sprite) {
    width: calc(70 * var(--fx));
    height: auto;
  }

  .active-meta {
    display: flex;
    min-width: calc(104 * var(--fx));
    flex-direction: column;
    gap: calc(4 * var(--fx));
  }

  .active-name {
    margin: 0;
    font-size: calc(17 * var(--fx));
    font-weight: 700;
    line-height: 1.1;
  }

  .active-count {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: calc(12 * var(--fx));
    font-weight: 600;
    line-height: 1;
    color: #94a3b8;
  }

  .hp-track {
    height: calc(9 * var(--fx));
    overflow: hidden;
    border-radius: calc(5 * var(--fx));
    border: 1px solid rgb(100 116 139 / 0.5);
    background: rgb(2 6 23 / 0.8);
  }

  .hp-fill {
    height: 100%;
    background: linear-gradient(90deg, #16a34a, #4ade80);
    transition: width 0.25s ease;
  }

  .hp-text {
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx));
    font-weight: 600;
    line-height: 1;
    color: #86efac;
  }

  .empty-note {
    margin: 0;
    align-self: center;
    font-size: calc(13 * var(--fx));
    color: #64748b;
  }

  /* ── actions ───────────────────────────────────────────────────── */

  .action-button {
    display: flex;
    width: calc(84 * var(--fx));
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(5 * var(--fx));
    border-radius: calc(14 * var(--fx));
    border: 2px solid rgb(148 163 184 / 0.65);
    background: rgb(30 41 59 / 0.95);
    cursor: pointer;
  }

  .action-button:hover:not(:disabled) {
    background: rgb(51 65 85 / 0.95);
    border-color: #cbd5e1;
  }

  .action-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .action-glyph {
    font-size: calc(28 * var(--fx));
    line-height: 1;
  }

  .action-icon {
    width: calc(32 * var(--fx));
    height: calc(32 * var(--fx));
    object-fit: contain;
    image-rendering: pixelated;
  }

  .action-label {
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #cbd5e1;
  }

  /* ── active ability slots ──────────────────────────────────────── */

  .slot-wrap {
    display: flex;
    width: calc(82 * var(--fx));
    flex-direction: column;
    align-items: center;
    gap: calc(4 * var(--fx));
  }

  .slot {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: calc(72 * var(--fx));
    height: calc(72 * var(--fx));
    border-radius: 50%;
    box-shadow: inset 0 0 14px rgb(0 0 0 / 0.65);
  }

  .slot.empty {
    border: 2px dashed rgb(100 116 139 / 0.35);
    background: rgb(15 23 42 / 0.6);
  }

  .spell-slot {
    border: 2px solid rgb(167 139 250 / 0.75);
    background: radial-gradient(circle at 50% 32%, #3b2a63, #140b26);
    cursor: pointer;
  }

  .spell-slot:hover:not(:disabled) {
    border-color: #fcd34d;
  }

  .spell-slot.open {
    border-color: #ddd6fe;
    background: radial-gradient(circle at 50% 32%, #6d28d9, #2e1065);
  }

  .spell-slot:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .ability-slot {
    border: 2px solid rgb(52 211 153 / 0.75);
    background: radial-gradient(circle at 50% 32%, #14503f, #062018);
    cursor: pointer;
  }

  .ability-slot:hover:not(:disabled) {
    border-color: #fcd34d;
  }

  .ability-slot:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .slot-icon {
    width: calc(36 * var(--fx));
    height: calc(36 * var(--fx));
    object-fit: contain;
    image-rendering: pixelated;
  }

  .slot-label {
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx));
    line-height: 1.15;
    text-align: center;
    color: rgb(100 116 139 / 0.7);
  }

  .slot-label.filled {
    color: #e2e8f0;
  }

  /* ── passive abilities ─────────────────────────────────────────── */

  .passive-list {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(210 * var(--fx)), 1fr));
    gap: calc(5 * var(--fx)) calc(20 * var(--fx));
    align-content: start;
    padding-right: calc(4 * var(--fx));
    overflow-y: auto;
  }

  .passive-label {
    display: flex;
    align-items: center;
    gap: calc(5 * var(--fx));
    margin: 0;
    font-size: calc(14 * var(--fx));
    font-weight: 700;
    line-height: 1.25;
    color: #fcd34d;
  }

  .passive-label.taught {
    color: #c4b5fd;
  }

  .passive-label a:hover {
    text-decoration: underline;
  }

  .passive-icon {
    width: calc(16 * var(--fx));
    height: calc(16 * var(--fx));
    flex: none;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .taught-tag {
    font-size: calc(9 * var(--fx));
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(167 139 250 / 0.8);
  }

  .passive-desc {
    margin: calc(1 * var(--fx)) 0 0;
    font-size: calc(12.5 * var(--fx));
    line-height: 1.35;
    color: #94a3b8;
    text-wrap: pretty;
  }

  .passive-desc.none {
    color: #64748b;
    font-style: italic;
  }

  .passive-list::-webkit-scrollbar {
    width: calc(7 * var(--fx));
  }

  .passive-list::-webkit-scrollbar-track {
    background: rgb(30 41 59 / 0.8);
    border-radius: 4px;
  }

  .passive-list::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }
</style>
