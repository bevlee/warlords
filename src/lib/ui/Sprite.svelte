<script lang="ts">
  interface Props {
    name: string;
    class?: string;
  }

  let { name, class: cls = '' }: Props = $props();
</script>

<!-- Stylized flat-vector standees, 64×80, feet on y≈78. -->
<svg viewBox="0 0 64 80" class={cls} aria-hidden="true">
  <g stroke="#0f172a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    {#if name === 'Goblin'}
      <path d="M25 60 l-3 16 h9 l1 -13" fill="#4d7c33" />
      <path d="M38 60 l3 16 h-9 l-1 -13" fill="#4d7c33" />
      <path d="M22 44 q11 -9 22 0 l-2 19 h-18 z" fill="#8b5a2b" />
      <path d="M23 47 q-9 5 -7 14 l5 1" fill="#6aa84f" />
      <path d="M43 46 q8 3 9 9 l-4 3" fill="#6aa84f" />
      <path d="M52 50 l7 -12 l4 4 l-9 10 z" fill="#cbd5e1" />
      <circle cx="33" cy="31" r="12" fill="#6aa84f" />
      <path d="M22 28 l-11 -5 l9 10 z" fill="#6aa84f" />
      <path d="M44 28 l11 -5 l-9 10 z" fill="#6aa84f" />
      <circle cx="28" cy="30" r="2.2" fill="#fbbf24" stroke="none" />
      <circle cx="38" cy="30" r="2.2" fill="#fbbf24" stroke="none" />
      <path d="M28 38 q5 4 10 0" fill="none" />
    {:else if name === 'Wolf Rider'}
      <path d="M8 62 l-2 14 h7 l2 -11" fill="#6b7280" />
      <path d="M44 62 l2 14 h7 l-1 -11" fill="#6b7280" />
      <path d="M6 58 q4 -14 26 -13 q18 1 24 9 q5 7 -3 10 q-22 5 -42 0 q-7 -2 -5 -6z" fill="#9ca3af" />
      <path d="M50 48 q12 -4 14 6 l-7 1 l5 5 q-9 5 -14 -3z" fill="#9ca3af" />
      <path d="M52 44 l-2 -8 l7 6z" fill="#6b7280" />
      <circle cx="57" cy="53" r="1.8" fill="#fbbf24" stroke="none" />
      <path d="M6 58 l-5 6 l7 1z" fill="#9ca3af" />
      <circle cx="30" cy="30" r="9" fill="#6aa84f" />
      <path d="M22 28 l-8 -4 l7 8z" fill="#6aa84f" />
      <path d="M38 28 l8 -4 l-7 8z" fill="#6aa84f" />
      <path d="M23 36 q7 -6 15 0 l-2 12 q-6 3 -12 0 z" fill="#7f1d1d" />
      <path d="M40 18 l2 30" stroke="#8b5a2b" stroke-width="3" />
      <path d="M42 18 l-4 -8 l8 2 z" fill="#cbd5e1" />
      <circle cx="27" cy="29" r="1.8" fill="#fbbf24" stroke="none" />
      <circle cx="33" cy="29" r="1.8" fill="#fbbf24" stroke="none" />
    {:else if name === 'Orc'}
      <path d="M24 58 l-2 18 h9 l1 -15" fill="#57534e" />
      <path d="M38 58 l2 18 h-9 l-1 -15" fill="#57534e" />
      <path d="M19 36 q14 -10 27 0 l3 23 h-32 z" fill="#7a9e5a" />
      <path d="M20 55 h26" stroke="#44403c" stroke-width="4" />
      <path d="M20 38 q-8 8 -5 16 l5 1" fill="#7a9e5a" />
      <path d="M46 38 q6 4 6 12 l-4 2" fill="#7a9e5a" />
      <path d="M50 16 l3 44" stroke="#8b5a2b" stroke-width="3" />
      <path d="M46 18 q14 -8 17 8 q-9 4 -17 0 z" fill="#cbd5e1" />
      <circle cx="32" cy="25" r="11" fill="#86a35f" />
      <path d="M26 31 l-2 -6 l4 4z" fill="#f8fafc" />
      <path d="M38 31 l2 -6 l-4 4z" fill="#f8fafc" />
      <circle cx="28" cy="23" r="2" fill="#dc2626" stroke="none" />
      <circle cx="37" cy="23" r="2" fill="#dc2626" stroke="none" />
    {:else if name === 'Ogre'}
      <path d="M22 62 l-3 15 h10 l1 -12" fill="#78573a" />
      <path d="M40 62 l3 15 h-10 l-1 -12" fill="#78573a" />
      <ellipse cx="32" cy="46" rx="18" ry="19" fill="#c9995f" />
      <path d="M22 55 q10 6 20 0" fill="none" stroke="#8b5a2b" />
      <path d="M16 38 q-9 8 -6 18 l6 1" fill="#c9995f" />
      <path d="M48 38 q7 6 6 14 l-5 2" fill="#c9995f" />
      <path d="M52 14 q8 4 6 16 l-8 26 l-5 -2 l6 -25 q-2 -9 1 -15z" fill="#8b5a2b" />
      <circle cx="55" cy="22" r="1.5" fill="#57534e" stroke="none" />
      <circle cx="32" cy="22" r="10" fill="#d8ab72" />
      <circle cx="28" cy="20" r="1.8" fill="#3f2d20" stroke="none" />
      <circle cx="36" cy="20" r="1.8" fill="#3f2d20" stroke="none" />
      <path d="M27 27 l3 -3 l3 3" fill="none" />
    {:else if name === 'Cyclops'}
      <path d="M24 60 l-3 17 h9 l2 -14" fill="#565b70" />
      <path d="M39 60 l3 17 h-9 l-2 -14" fill="#565b70" />
      <path d="M20 30 q12 -9 24 0 l4 32 h-32 z" fill="#8b8fa3" />
      <path d="M22 52 h20 l-2 8 h-16 z" fill="#7f1d1d" />
      <path d="M20 32 q-9 10 -6 22 l6 0" fill="#8b8fa3" />
      <path d="M44 32 q8 8 7 20 l-6 1" fill="#8b8fa3" />
      <circle cx="32" cy="18" r="11" fill="#9aa0b5" />
      <circle cx="32" cy="17" r="5" fill="#f8fafc" />
      <circle cx="32" cy="17" r="2.4" fill="#166534" stroke="none" />
      <path d="M28 27 q4 3 8 0" fill="none" />
    {:else if name === 'Thunderbird'}
      <path d="M32 44 q-16 -18 -30 -14 q6 12 18 16 q-8 2 -14 8 q10 6 20 2z" fill="#2563eb" />
      <path d="M32 44 q16 -18 30 -14 q-6 12 -18 16 q8 2 14 8 q-10 6 -20 2z" fill="#2563eb" />
      <path d="M26 36 q6 -8 12 0 l-1 20 q-5 5 -10 0 z" fill="#3b82f6" />
      <circle cx="32" cy="30" r="8" fill="#3b82f6" />
      <path d="M32 32 l8 3 l-8 3z" fill="#facc15" />
      <circle cx="29" cy="28" r="1.8" fill="#facc15" stroke="none" />
      <path d="M30 56 l6 6 l-5 1 l6 7" fill="none" stroke="#facc15" />
      <path d="M28 55 l-3 10 h4" fill="none" />
      <path d="M36 55 l3 10 h-4" fill="none" />
    {:else if name === 'Behemoth'}
      <path d="M14 62 l-3 14 h9 l2 -11" fill="#5c3317" />
      <path d="M44 62 l3 14 h-9 l-2 -11" fill="#5c3317" />
      <path d="M8 58 q0 -26 26 -28 q22 -2 24 20 q1 10 -8 12 q-22 5 -36 0 q-6 -1 -6 -4z" fill="#7c4a21" />
      <path d="M12 40 q8 -12 22 -10" fill="none" stroke="#5c3317" />
      <circle cx="46" cy="36" r="12" fill="#8a5527" />
      <path d="M38 26 l-6 -12 l10 7z" fill="#e7e5e4" />
      <path d="M54 26 l6 -12 l-10 7z" fill="#e7e5e4" />
      <circle cx="42" cy="34" r="2.2" fill="#f97316" stroke="none" />
      <circle cx="51" cy="34" r="2.2" fill="#f97316" stroke="none" />
      <path d="M42 42 q5 4 10 0" fill="none" />
      <path d="M20 56 l-4 6 M30 58 l-2 6" stroke="#5c3317" />
    {:else if name === 'Hero'}
      <path d="M20 40 q-8 20 -4 34 l10 -2 l-2 -22" fill="#b91c1c" />
      <path d="M26 60 l-2 16 h8 l1 -13" fill="#94a3b8" />
      <path d="M37 60 l2 16 h-8 l-1 -13" fill="#94a3b8" />
      <path d="M23 38 q10 -7 19 0 l1 22 h-21 z" fill="#cbd5e1" />
      <path d="M24 48 h18" stroke="#64748b" />
      <path d="M52 12 l2 34" stroke="#94a3b8" stroke-width="3" />
      <path d="M49 44 h10" stroke="#8b5a2b" stroke-width="3" />
      <path d="M44 40 q7 2 8 8 l-4 2" fill="#cbd5e1" />
      <path d="M16 42 q-6 2 -6 10 q0 8 8 10 q6 -2 6 -10 q0 -8 -8 -10z" fill="#dc2626" />
      <path d="M14 48 l8 0 M18 44 l0 12" stroke="#facc15" stroke-width="1.5" />
      <circle cx="33" cy="26" r="10" fill="#e2c9a8" />
      <path d="M23 24 q10 -12 20 0 l0 4 h-20 z" fill="#94a3b8" />
      <path d="M31 12 q4 -8 10 -6 q-2 6 -6 8z" fill="#dc2626" />
      <circle cx="29" cy="27" r="1.6" fill="#3f2d20" stroke="none" />
      <circle cx="37" cy="27" r="1.6" fill="#3f2d20" stroke="none" />
    {:else if name === 'Rock'}
      <path d="M10 70 q-4 -18 12 -26 q14 -8 26 2 q10 8 6 24 q-22 8 -44 0z" fill="#78716c" />
      <path d="M22 46 l6 24 M40 48 l-4 22" stroke="#57534e" stroke-width="1.5" />
      <path d="M14 58 q12 -6 36 0" fill="none" stroke="#57534e" stroke-width="1.5" />
    {:else}
      <circle cx="32" cy="40" r="20" fill="#64748b" />
      <text x="32" y="47" text-anchor="middle" font-size="20" fill="#f8fafc" stroke="none">?</text>
    {/if}
  </g>
</svg>
