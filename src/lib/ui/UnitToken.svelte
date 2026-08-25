<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import Sprite from './Sprite.svelte';
  import { controllerOf, CONTROLLER_STYLE } from './controllers';

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
</div>
