<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import { abilityLevel } from '$lib/engine/abilityCatalog';
  import { abilityInfo } from './abilities';
  import { skillIconFor, skillGlyph } from './skillIcons';
  import { statusIconFor } from './statusIcons';
  import { attributeIconFor } from './attributeIcons';
  import { entryHref } from '$lib/compendium/entries';
  import Sprite from './Sprite.svelte';

  interface Props {
    /** The stack whose turn it is — the dock always describes this unit. */
    unit: UnitStack | null;
    disabled: boolean;
    isHeroTurn: boolean;
    spellbookOpen: boolean;
    onwait: () => void;
    ondefend: () => void;
    onspellbook: () => void;
  }

  let { unit, disabled, isHeroTurn, spellbookOpen, onwait, ondefend, onspellbook }: Props = $props();

  // Top-creature HP, the same figure UnitInfo shows.
  const hpFraction = $derived(
    unit && unit.definition.hp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.definition.hp)) : 0
  );

  const passives = $derived(
    (unit?.definition.abilities ?? []).map(id => ({
      id,
      taught: unit?.definition.grantedAbilities?.includes(id) ?? false,
      ...abilityInfo(id, unit ? abilityLevel(unit.definition, id) : undefined),
    }))
  );

  // The engine has no per-unit active abilities yet. The slots are reserved so
  // the dock's width never jumps between stacks; the hero's spellbook takes the
  // first one on its turn.
  const EMPTY_SLOTS = [0, 1, 2];
</script>

<div class="dock">
  <!-- Active creature -->
  <div class="segment active-creature">
    {#if unit}
      <div class="portrait-ring">
        <Sprite name={unit.definition.name} class="portrait-sprite" />
      </div>
      <div class="active-meta">
        <p class="active-name {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
          {unit.isHero ? 'Hero' : unit.definition.name}
        </p>
        {#if !unit.isHero}<p class="active-count">×{unit.count}</p>{/if}
        <div class="hp-track">
          <div class="hp-fill" style="width: {hpFraction * 100}%"></div>
        </div>
        <span class="hp-text">{unit.hp} / {unit.definition.hp} HP</span>
      </div>
    {:else}
      <p class="empty-note">No active stack.</p>
    {/if}
  </div>

  <div class="rule" aria-hidden="true"></div>

  <!-- Actions -->
  <div class="segment column">
    <div class="segment-body row">
      <button
        type="button"
        class="action-button"
        aria-label="Wait"
        title="Wait — act again in half a cycle"
        {disabled}
        onclick={onwait}
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
      >
        <img src={statusIconFor('defending')} alt="" class="action-icon" />
        <span class="action-label">Defend</span>
      </button>
    </div>
    <span class="segment-caption">Actions</span>
  </div>

  <div class="rule" aria-hidden="true"></div>

  <!-- Active abilities: the hero's spellbook lives in the first slot. -->
  <div class="segment column">
    <div class="segment-body row slots">
      {#each EMPTY_SLOTS as slot (slot)}
        {#if slot === 0 && isHeroTurn}
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
        {:else}
          <div class="slot-wrap">
            <span class="slot empty" title="Empty ability slot"></span>
            <span class="slot-label">—</span>
          </div>
        {/if}
      {/each}
    </div>
    <span class="segment-caption">Active abilities</span>
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
  .dock {
    display: flex;
    height: 100%;
    min-width: 0;
    align-items: stretch;
    gap: calc(12 * var(--fx, 1px));
    padding: calc(9 * var(--fx, 1px)) calc(14 * var(--fx, 1px));
    border-radius: calc(10 * var(--fx, 1px));
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
    gap: calc(6 * var(--fx, 1px));
    align-self: stretch;
  }

  .segment.grow {
    flex: 1;
  }

  .segment-body {
    flex: 1;
    min-height: 0;
  }

  .segment-body.row {
    display: flex;
    align-items: stretch;
    gap: calc(9 * var(--fx, 1px));
  }

  .segment-body.slots {
    align-items: center;
    gap: calc(11 * var(--fx, 1px));
  }

  .segment-caption {
    flex: none;
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx, 1px));
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
    gap: calc(10 * var(--fx, 1px));
  }

  .portrait-ring {
    position: relative;
    display: flex;
    flex: none;
    align-items: flex-end;
    justify-content: center;
    width: calc(84 * var(--fx, 1px));
    height: calc(84 * var(--fx, 1px));
    overflow: hidden;
    border-radius: 50%;
    border: 3px solid #4ade80;
    background: radial-gradient(circle at 50% 30%, #1e293b, #0b1220);
    box-shadow:
      0 0 18px rgb(74 222 128 / 0.4),
      inset 0 0 18px rgb(0 0 0 / 0.7);
  }

  .portrait-ring :global(.portrait-sprite) {
    width: calc(70 * var(--fx, 1px));
    height: auto;
  }

  .active-meta {
    display: flex;
    min-width: calc(104 * var(--fx, 1px));
    flex-direction: column;
    gap: calc(4 * var(--fx, 1px));
  }

  .active-name {
    margin: 0;
    font-size: calc(17 * var(--fx, 1px));
    font-weight: 700;
    line-height: 1.1;
  }

  .active-count {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: calc(12 * var(--fx, 1px));
    font-weight: 600;
    line-height: 1;
    color: #94a3b8;
  }

  .hp-track {
    height: calc(9 * var(--fx, 1px));
    overflow: hidden;
    border-radius: calc(5 * var(--fx, 1px));
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
    font-size: calc(11 * var(--fx, 1px));
    font-weight: 600;
    line-height: 1;
    color: #86efac;
  }

  .empty-note {
    margin: 0;
    align-self: center;
    font-size: calc(13 * var(--fx, 1px));
    color: #64748b;
  }

  /* ── actions ───────────────────────────────────────────────────── */

  .action-button {
    display: flex;
    width: calc(84 * var(--fx, 1px));
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(5 * var(--fx, 1px));
    border-radius: calc(14 * var(--fx, 1px));
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
    font-size: calc(28 * var(--fx, 1px));
    line-height: 1;
  }

  .action-icon {
    width: calc(32 * var(--fx, 1px));
    height: calc(32 * var(--fx, 1px));
    object-fit: contain;
    image-rendering: pixelated;
  }

  .action-label {
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx, 1px));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #cbd5e1;
  }

  /* ── active ability slots ──────────────────────────────────────── */

  .slot-wrap {
    display: flex;
    width: calc(82 * var(--fx, 1px));
    flex-direction: column;
    align-items: center;
    gap: calc(4 * var(--fx, 1px));
  }

  .slot {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: calc(72 * var(--fx, 1px));
    height: calc(72 * var(--fx, 1px));
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

  .slot-icon {
    width: calc(36 * var(--fx, 1px));
    height: calc(36 * var(--fx, 1px));
    object-fit: contain;
    image-rendering: pixelated;
  }

  .slot-label {
    font-family: ui-monospace, monospace;
    font-size: calc(11 * var(--fx, 1px));
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
    grid-template-columns: repeat(auto-fill, minmax(calc(210 * var(--fx, 1px)), 1fr));
    gap: calc(5 * var(--fx, 1px)) calc(20 * var(--fx, 1px));
    align-content: start;
    padding-right: calc(4 * var(--fx, 1px));
    overflow-y: auto;
  }

  .passive-label {
    display: flex;
    align-items: center;
    gap: calc(5 * var(--fx, 1px));
    margin: 0;
    font-size: calc(14 * var(--fx, 1px));
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
    width: calc(16 * var(--fx, 1px));
    height: calc(16 * var(--fx, 1px));
    flex: none;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .taught-tag {
    font-size: calc(9 * var(--fx, 1px));
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(167 139 250 / 0.8);
  }

  .passive-desc {
    margin: calc(1 * var(--fx, 1px)) 0 0;
    font-size: calc(12.5 * var(--fx, 1px));
    line-height: 1.35;
    color: #94a3b8;
    text-wrap: pretty;
  }

  .passive-desc.none {
    color: #64748b;
    font-style: italic;
  }

  .passive-list::-webkit-scrollbar {
    width: calc(7 * var(--fx, 1px));
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
