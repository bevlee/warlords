<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import Sprite from './Sprite.svelte';
  import { controllerOf, CONTROLLER_STYLE } from './controllers';
  import { statusIconFor } from './statusIcons';

  interface Props {
    unit: UnitStack;
    /** It's this unit's turn — run its idle animation. */
    active?: boolean;
    /** Stack is being wiped out — play the death pose (falls over, holds
        the last frame) while the standee's fade runs in BattleGrid. */
    dying?: boolean;
    small?: boolean;
  }

  let { unit, active = false, dying = false, small = false }: Props = $props();
</script>

<!-- Transparent standee: sprite + count plate, LordsWM-style (no card chrome). -->
<div
  class="relative flex h-full w-full items-end justify-center"
  title="{unit.definition.name} ×{unit.count}"
>
  <Sprite
    name={unit.definition.name}
    pose={dying ? 'death' : 'idle'}
    animate={active}
    class="h-full w-auto {unit.side === 'enemy' ? '-scale-x-100' : ''}"
  />

  <span
    class="absolute bottom-0 right-0 rounded-sm border px-1 font-mono font-bold leading-tight text-white
      {small ? 'text-[11px]' : 'text-[13px]'}
      {CONTROLLER_STYLE[controllerOf(unit)].badge}"
  >
    {unit.count}
  </span>

  {#if unit.attackBuff || unit.defenseBuff}
    <span
      class="absolute bottom-0 left-0 flex items-center {small ? 'gap-px' : 'gap-0.5'}"
      title="{unit.attackBuff ? `+${unit.attackBuff} attack ` : ''}{unit.defenseBuff ? `+${unit.defenseBuff} defense` : ''}"
    >
      {#if unit.attackBuff}
        <img src={statusIconFor('bloodlust')} alt="" class="{small ? 'h-[18px] w-[18px]' : 'h-6 w-6'} object-contain [image-rendering:pixelated]" />
      {/if}
      {#if unit.defenseBuff}
        <img src={statusIconFor('stoneskin')} alt="" class="{small ? 'h-[18px] w-[18px]' : 'h-6 w-6'} object-contain [image-rendering:pixelated]" />
      {/if}
    </span>
  {/if}

  {#if unit.isDefending}
    <img
      src={statusIconFor('defending')}
      alt=""
      class="absolute left-0 top-0 object-contain [image-rendering:pixelated] {small ? 'h-[18px] w-[18px]' : 'h-6 w-6'}"
      title="defending"
    />
  {/if}
</div>
