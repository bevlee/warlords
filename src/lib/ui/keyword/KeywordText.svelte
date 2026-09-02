<script lang="ts">
  import { parseKeywords } from '$lib/compendium/keywords';
  import Keyword from './Keyword.svelte';

  interface Props {
    text: string;
    /** Set inside the popup, where a term drills in place instead of opening
     *  a second card. */
    nested?: boolean;
  }

  let { text, nested = false }: Props = $props();

  const segments = $derived(parseKeywords(text));
</script>

<!-- prettier-ignore -->
{#each segments as segment, i (i)}{#if segment.kind === 'text'}{segment.text}{:else}<Keyword entryKind={segment.entryKind} id={segment.id} label={segment.label} {nested} />{/if}{/each}
