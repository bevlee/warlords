<script lang="ts">
  import { itemIconFor } from './itemIcons';

  interface Props {
    id: string;
    class?: string;
  }

  let { id, class: cls = '' }: Props = $props();
  const icon = $derived(itemIconFor(id));
</script>

{#if icon}
  <img
    src={icon}
    alt=""
    class="object-contain [image-rendering:pixelated] {cls}"
  />
{:else}
  <!-- A compact pouch fallback keeps future items visible until their art lands. -->
  <svg viewBox="0 0 64 64" class={cls} aria-hidden="true">
    <g stroke="#0f172a" stroke-width="2" stroke-linejoin="round">
      <path d="M32 16 q-16 4 -16 24 q0 14 16 14 q16 0 16 -14 q0 -20 -16 -24z" fill="#a16207" />
      <path d="M24 16 q8 -6 16 0 l-4 6 h-8 z" fill="#78350f" />
      <circle cx="32" cy="38" r="6" fill="#fbbf24" />
    </g>
  </svg>
{/if}
