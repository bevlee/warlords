<script lang="ts">
  interface Props {
    id: string;
    class?: string;
  }

  let { id, class: cls = '' }: Props = $props();
</script>

<!-- Flat-vector artifact icons, 64×64 — same language as SpriteVector standees. -->
<svg viewBox="0 0 64 64" class={cls} aria-hidden="true">
  <g stroke="#0f172a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    {#if id === 'blade_of_the_vanguard'}
      <path d="M32 6 l5 8 l-1 28 h-8 l-1 -28 z" fill="#cbd5e1" />
      <path d="M30 14 l4 0 l-1 24 h-2 z" fill="#f1f5f9" stroke="none" />
      <path d="M20 42 h24 l-2 6 h-20 z" fill="#f59e0b" />
      <path d="M29 48 h6 v8 l-3 3 l-3 -3 z" fill="#92400e" />
    {:else if id === 'aegis_charm'}
      <path d="M32 8 q12 5 20 6 q0 22 -20 42 q-20 -20 -20 -42 q12 -1 20 -6z" fill="#60a5fa" />
      <path d="M32 12 q9 4 16 5 q-1 17 -16 33 z" fill="#3b82f6" stroke="none" />
      <circle cx="32" cy="30" r="6" fill="#fbbf24" />
      <circle cx="32" cy="30" r="2.5" fill="#fde68a" stroke="none" />
    {:else if id === 'warhorn_of_haste'}
      <path d="M12 40 q2 -22 34 -26 q8 -1 8 8 q0 6 -8 6 q-18 2 -22 14 q-2 6 -12 -2z" fill="#d6b98c" />
      <path d="M10 38 q-4 2 -2 8 q4 6 12 0 l-4 -8 z" fill="#a16207" />
      <path d="M46 12 q6 0 6 8" fill="none" stroke="#78350f" />
      <path d="M50 34 l8 -4 M50 42 l10 0 M48 50 l8 4" fill="none" stroke="#38bdf8" />
    {:else if id === 'rabbits_foot'}
      <path d="M32 14 q-3 -8 3 -9 q5 0 3 9 l-2 6 z" fill="#e5e7eb" />
      <path d="M28 22 q8 -6 12 2 q4 10 -2 24 q-3 8 -10 6 q-7 -3 -4 -12 q3 -10 4 -20z" fill="#f8fafc" />
      <path d="M26 50 q-2 6 3 8 M34 52 q0 6 -4 6 M40 46 q3 5 -1 8" fill="none" />
      <circle cx="34" cy="10" r="3" fill="#f59e0b" />
    {:else if id === 'banner_of_courage'}
      <path d="M20 6 l0 52" stroke="#78350f" stroke-width="3" />
      <path d="M22 10 h30 l-8 9 l8 9 h-30 z" fill="#f59e0b" />
      <path d="M22 12 h14 v14 h-14 z" fill="#fbbf24" stroke="none" />
      <circle cx="20" cy="7" r="3" fill="#fde68a" />
    {:else if id === 'greatsword_of_ruin'}
      <path d="M32 4 l7 10 l-2 30 h-10 l-2 -30 z" fill="#e2e8f0" />
      <path d="M32 8 l3 6 l-1 26 h-4 l-1 -26 z" fill="#ef4444" stroke="none" opacity="0.55" />
      <path d="M16 44 h32 l-3 7 h-26 z" fill="#7f1d1d" />
      <path d="M28 51 h8 v7 l-4 4 l-4 -4 z" fill="#450a0a" />
    {:else if id === 'tower_shield_sigil'}
      <path d="M18 8 h28 q2 0 2 3 v34 q0 6 -16 13 q-16 -7 -16 -13 v-34 q0 -3 2 -3z" fill="#94a3b8" />
      <path d="M20 12 h24 v30 q0 4 -12 9 q-12 -5 -12 -9 z" fill="#64748b" stroke="none" />
      <path d="M32 16 l8 8 l-8 22 l-8 -22 z" fill="#fbbf24" />
    {:else if id === 'drums_of_war'}
      <ellipse cx="32" cy="26" rx="18" ry="7" fill="#f1f5f9" />
      <path d="M14 26 v18 q0 7 18 7 q18 0 18 -7 v-18 q-18 8 -36 0z" fill="#b45309" />
      <path d="M18 30 l8 14 M46 30 l-8 14 M32 32 v15" stroke="#fde68a" fill="none" />
      <path d="M10 12 l16 10 M54 12 l-16 10" stroke="#78350f" stroke-width="3" />
      <circle cx="10" cy="11" r="4" fill="#e5e7eb" />
      <circle cx="54" cy="11" r="4" fill="#e5e7eb" />
    {:else if id === 'horseshoe_of_fortune'}
      <path d="M18 50 q-8 -26 14 -30 q22 4 14 30 l-7 -2 q7 -20 -7 -22 q-14 2 -7 22 z" fill="#fbbf24" />
      <circle cx="20" cy="44" r="1.8" fill="#78350f" stroke="none" />
      <circle cx="17" cy="34" r="1.8" fill="#78350f" stroke="none" />
      <circle cx="21" cy="25" r="1.8" fill="#78350f" stroke="none" />
      <circle cx="44" cy="44" r="1.8" fill="#78350f" stroke="none" />
      <circle cx="47" cy="34" r="1.8" fill="#78350f" stroke="none" />
      <circle cx="43" cy="25" r="1.8" fill="#78350f" stroke="none" />
    {:else if id === 'standard_of_heroes'}
      <path d="M18 6 l0 52" stroke="#94a3b8" stroke-width="3" />
      <path d="M20 9 h32 v18 h-32 z" fill="#7c3aed" />
      <path d="M20 27 h12 l-4 8 l-8 -3 z M40 27 h12 l0 5 l-8 3 z" fill="#7c3aed" />
      <path d="M30 13 l4 8 M34 13 l-4 8" stroke="#fbbf24" />
      <circle cx="18" cy="6" r="3" fill="#fbbf24" />
    {:else if id === 'berserkers_brew'}
      <path d="M20 22 h22 v30 q0 4 -11 4 q-11 0 -11 -4 z" fill="#a16207" />
      <path d="M42 28 q8 0 8 8 q0 8 -8 8" fill="none" stroke-width="3" />
      <path d="M22 26 h18 v24 q0 3 -9 3 q-9 0 -9 -3 z" fill="#dc2626" stroke="none" />
      <path d="M18 20 q6 -8 12 -2 q4 -6 10 -2 q6 -4 8 4 l-4 4 h-24 z" fill="#fef3c7" />
    {:else if id === 'stalwart_doctrine'}
      <path d="M10 16 q11 -5 22 0 v34 q-11 -5 -22 0 z" fill="#e7e5e4" />
      <path d="M54 16 q-11 -5 -22 0 v34 q11 -5 22 0 z" fill="#f5f5f4" />
      <path d="M32 16 v34" stroke="#78716c" />
      <path d="M43 22 q5 2 8 2 q0 9 -8 16 q-8 -7 -8 -16 q3 0 8 -2z" fill="#3b82f6" />
    {:else if id === 'reckless_standard'}
      <path d="M22 6 l0 52" stroke="#57534e" stroke-width="3" />
      <path d="M24 10 h28 l-4 6 l4 6 l-6 5 l2 6 h-24 z" fill="#1c1917" />
      <path d="M30 15 l8 12 M38 15 l-8 12" stroke="#dc2626" />
      <path d="M24 33 l6 -4 l4 6 z" fill="#1c1917" />
    {:else if id === 'crown_of_the_warlord'}
      <path d="M12 46 l-2 -26 l12 10 l10 -18 l10 18 l12 -10 l-2 26 z" fill="#fbbf24" />
      <path d="M12 46 h40 v8 h-40 z" fill="#f59e0b" />
      <circle cx="32" cy="38" r="4" fill="#dc2626" />
      <circle cx="18" cy="50" r="2.5" fill="#dc2626" stroke="none" />
      <circle cx="46" cy="50" r="2.5" fill="#dc2626" stroke="none" />
    {:else if id === 'relic_of_the_ancients'}
      <path d="M32 6 l14 10 l-4 34 h-20 l-4 -34 z" fill="#6d28d9" />
      <path d="M32 12 l9 7 l-3 26 h-12 l-3 -26 z" fill="#8b5cf6" stroke="none" />
      <path d="M32 20 l6 8 l-6 14 l-6 -14 z" fill="#f0abfc" />
      <path d="M12 16 l6 4 M52 16 l-6 4 M32 58 v-6" stroke="#c4b5fd" fill="none" />
    {:else}
      <!-- Fallback: coin pouch, so an un-iconed future item is still visible. -->
      <path d="M32 16 q-16 4 -16 24 q0 14 16 14 q16 0 16 -14 q0 -20 -16 -24z" fill="#a16207" />
      <path d="M24 16 q8 -6 16 0 l-4 6 h-8 z" fill="#78350f" />
      <circle cx="32" cy="38" r="6" fill="#fbbf24" />
    {/if}
  </g>
</svg>
