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
    {:else if name === 'Peasant'}
      <path d="M27 60 l-2 16 h8 l1 -13" fill="#78573a" />
      <path d="M37 60 l2 16 h-8 l-1 -13" fill="#78573a" />
      <path d="M24 42 q9 -8 17 0 l1 18 h-19 z" fill="#a8a29e" />
      <path d="M25 45 q-7 4 -5 12 l4 1" fill="#a8a29e" />
      <path d="M41 44 q6 3 6 9 l-3 2" fill="#a8a29e" />
      <path d="M46 20 l1 40" stroke="#8b5a2b" stroke-width="3" />
      <path d="M43 18 l3 -6 l3 6 M46 12 l0 8" stroke="#71717a" stroke-width="2" />
      <circle cx="32" cy="28" r="9" fill="#e2c9a8" />
      <path d="M24 24 q8 -8 16 0 l0 -3 q-8 -6 -16 0z" fill="#78716c" />
      <circle cx="29" cy="28" r="1.5" fill="#3f2d20" stroke="none" />
      <circle cx="35" cy="28" r="1.5" fill="#3f2d20" stroke="none" />
    {:else if name === 'Archer'}
      <path d="M25 58 l-2 18 h8 l1 -15" fill="#3f6212" />
      <path d="M38 58 l2 18 h-8 l-1 -15" fill="#3f6212" />
      <path d="M22 38 q10 -8 20 0 l2 22 h-24 z" fill="#4d7c0f" />
      <path d="M44 20 q6 18 -2 34" fill="none" stroke="#8b5a2b" stroke-width="2.5" />
      <path d="M44 20 l-6 5 M44 54 l-6 -4" stroke="#facc15" stroke-width="1.2" />
      <path d="M20 40 q-8 8 -4 18 l5 1" fill="#4d7c0f" />
      <rect x="16" y="46" width="6" height="14" rx="2" fill="#78716c" />
      <circle cx="32" cy="26" r="9" fill="#d8ab72" />
      <path d="M23 24 q9 -9 18 0 l-1 -4 q-8 -6 -16 0z" fill="#365314" />
      <circle cx="29" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
      <circle cx="35" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
    {:else if name === 'Griffin'}
      <path d="M32 46 q-18 -14 -30 -6 q5 10 16 12 q-7 4 -12 10 q10 4 20 -1z" fill="#b45309" />
      <path d="M32 46 q18 -14 30 -6 q-5 10 -16 12 q7 4 12 10 q-10 4 -20 -1z" fill="#b45309" />
      <path d="M24 40 q8 -8 16 0 l-1 22 q-7 4 -14 0 z" fill="#d97706" />
      <path d="M24 60 l-3 14 h8 M40 60 l3 14 h-8" stroke="#78350f" />
      <circle cx="32" cy="30" r="10" fill="#eab308" />
      <path d="M27 24 l-6 -8 l4 9z" fill="#f8fafc" />
      <path d="M37 24 l6 -8 l-4 9z" fill="#f8fafc" />
      <path d="M32 30 l5 4 l-5 3 l-5 -3z" fill="#f8fafc" />
      <circle cx="28" cy="28" r="1.6" fill="#78350f" stroke="none" />
      <circle cx="36" cy="28" r="1.6" fill="#78350f" stroke="none" />
    {:else if name === 'Swordsman'}
      <path d="M24 60 l-2 16 h9 l1 -13" fill="#64748b" />
      <path d="M39 60 l2 16 h-9 l-1 -13" fill="#64748b" />
      <path d="M21 38 q11 -9 22 0 l2 22 h-26 z" fill="#94a3b8" />
      <rect x="23" y="52" width="18" height="6" fill="#1d4ed8" />
      <path d="M46 20 l0 26" stroke="#cbd5e1" stroke-width="4" />
      <path d="M43 18 l3 -6 l3 6z" fill="#e2e8f0" />
      <path d="M18 40 q-9 4 -6 16 l6 -1 l0 -13 z" fill="#94a3b8" />
      <ellipse cx="18" cy="46" rx="6" ry="9" fill="#1d4ed8" stroke="#e2e8f0" />
      <circle cx="32" cy="27" r="10" fill="#9aa0b5" />
      <path d="M22 27 q10 -14 20 0 l0 -6 q-10 -8 -20 0z" fill="#cbd5e1" />
      <rect x="27" y="27" width="10" height="3" fill="#1e293b" stroke="none" />
    {:else if name === 'Monk'}
      <path d="M21 42 q11 -10 22 0 l3 26 h-28 z" fill="#f8fafc" />
      <path d="M21 42 q11 6 22 0" fill="none" stroke="#d4af37" stroke-width="1.5" />
      <path d="M50 18 l0 34" stroke="#8b5a2b" stroke-width="3" />
      <circle cx="50" cy="16" r="4" fill="#facc15" />
      <path d="M19 44 q-7 6 -4 16 l5 0" fill="#f8fafc" />
      <path d="M42 44 q7 4 6 12 l-5 2" fill="#f8fafc" />
      <ellipse cx="32" cy="16" rx="11" ry="3" fill="none" stroke="#facc15" stroke-width="1.5" />
      <circle cx="32" cy="26" r="9" fill="#e2c9a8" />
      <circle cx="29" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
      <circle cx="35" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
    {:else if name === 'Cavalier'}
      <path d="M6 62 q-2 -20 16 -22 q4 -10 14 -8 q10 2 8 12 q10 -2 14 8 q3 8 -4 12 q-20 6 -38 2 q-8 -1 -10 -4z" fill="#57534e" />
      <path d="M10 64 l-3 12 h7 l2 -10 M46 64 l3 12 h-7 l-2 -10" fill="#3f3d3a" />
      <path d="M44 34 l8 -14 l4 3 l-7 13z" fill="#e7e5e4" />
      <circle cx="16" cy="42" r="2" fill="#f8fafc" stroke="none" />
      <path d="M20 34 q8 -8 18 -2 l-2 20 q-8 4 -14 0z" fill="#94a3b8" />
      <path d="M56 20 l-4 26" stroke="#cbd5e1" stroke-width="3" />
      <circle cx="29" cy="27" r="7" fill="#9aa0b5" />
      <path d="M23 26 q6 -8 12 0 l0 -4 q-6 -5 -12 0z" fill="#cbd5e1" />
    {:else if name === 'Champion'}
      <path d="M23 60 l-2 16 h9 l1 -13" fill="#78350f" />
      <path d="M40 60 l2 16 h-9 l-1 -13" fill="#78350f" />
      <path d="M20 36 q12 -10 24 0 l2 24 h-28 z" fill="#eab308" />
      <rect x="22" y="52" width="20" height="6" fill="#7f1d1d" />
      <path d="M48 16 l0 32" stroke="#e2e8f0" stroke-width="4" />
      <path d="M44 14 l4 -8 l4 8z" fill="#fde68a" />
      <path d="M16 38 q-9 5 -6 18 l7 -1 l-1 -15z" fill="#eab308" />
      <circle cx="32" cy="25" r="10" fill="#fbbf24" />
      <path d="M21 25 q11 -15 22 0 l0 -6 q-11 -9 -22 0z" fill="#fde68a" />
      <path d="M28 12 q4 -8 8 0 q-4 4 -8 0z" fill="#dc2626" />
      <rect x="27" y="25" width="10" height="3" fill="#7c2d12" stroke="none" />
    {:else if name === 'Gremlin'}
      <path d="M26 58 l-2 14 h7 l1 -11" fill="#166534" />
      <path d="M37 58 l2 14 h-7 l-1 -11" fill="#166534" />
      <path d="M23 42 q9 -8 18 0 l1 18 h-20 z" fill="#22c55e" />
      <path d="M22 44 q-7 5 -4 14 l5 0" fill="#22c55e" />
      <path d="M42 44 q6 4 5 11 l-4 1" fill="#22c55e" />
      <rect x="42" y="46" width="10" height="3" rx="1.5" fill="#78716c" transform="rotate(30 42 46)" />
      <circle cx="32" cy="28" r="10" fill="#4ade80" />
      <path d="M20 22 l-8 -6 l7 11z" fill="#22c55e" />
      <path d="M44 22 l8 -6 l-7 11z" fill="#22c55e" />
      <circle cx="28" cy="28" r="2" fill="#facc15" stroke="none" />
      <circle cx="36" cy="28" r="2" fill="#facc15" stroke="none" />
      <path d="M28 34 q4 2 8 0" fill="none" />
    {:else if name === 'Stone Golem'}
      <path d="M22 60 l-3 15 h9 l2 -12" fill="#57534e" />
      <path d="M40 60 l3 15 h-9 l-2 -12" fill="#57534e" />
      <path d="M18 34 q14 -12 28 0 l2 26 h-32 z" fill="#a8a29e" />
      <path d="M22 40 l6 6 M36 38 l6 8 M28 52 l8 -4" stroke="#57534e" stroke-width="1.5" />
      <path d="M15 38 q-8 8 -4 18 l6 0" fill="#a8a29e" />
      <path d="M47 38 q7 6 5 16 l-6 1" fill="#a8a29e" />
      <circle cx="32" cy="20" r="11" fill="#8a8580" />
      <path d="M24 18 l4 5 M40 18 l-4 5" stroke="#57534e" stroke-width="1.5" />
      <circle cx="27" cy="19" r="1.8" fill="#facc15" stroke="none" />
      <circle cx="37" cy="19" r="1.8" fill="#facc15" stroke="none" />
    {:else if name === 'Mage'}
      <path d="M22 40 q10 -8 20 0 l2 24 h-24 z" fill="#312e81" />
      <path d="M20 42 q-7 6 -4 16 l5 0" fill="#312e81" />
      <path d="M43 42 q6 4 5 12 l-4 2" fill="#312e81" />
      <path d="M50 20 l0 32" stroke="#8b5a2b" stroke-width="2.5" />
      <circle cx="50" cy="18" r="3.5" fill="#38bdf8" />
      <circle cx="32" cy="26" r="8" fill="#e2c9a8" />
      <path d="M22 24 l10 -20 l10 20 q-10 -4 -20 0z" fill="#4338ca" />
      <circle cx="35" cy="16" r="2" fill="#facc15" stroke="none" />
      <circle cx="29" cy="26" r="1.4" fill="#3f2d20" stroke="none" />
      <circle cx="35" cy="26" r="1.4" fill="#3f2d20" stroke="none" />
    {:else if name === 'Gorgon'}
      <path d="M18 62 l-3 14 h9 M44 62 l3 14 h-9" fill="none" stroke="#166534" stroke-width="2" />
      <path d="M16 36 q16 -12 30 0 l3 26 h-36 z" fill="#4d7c0f" />
      <path d="M14 40 q-8 8 -3 18 l6 -1" fill="#4d7c0f" />
      <path d="M47 40 q7 6 4 16 l-6 0" fill="#4d7c0f" />
      <circle cx="32" cy="22" r="11" fill="#65a30d" />
      <path d="M22 16 q3 -8 -2 -12 M27 12 q2 -9 -3 -12 M37 12 q-2 -9 3 -12 M42 16 q-3 -8 2 -12" stroke="#166534" stroke-width="2" fill="none" />
      <circle cx="27" cy="22" r="2" fill="#dc2626" stroke="none" />
      <circle cx="37" cy="22" r="2" fill="#dc2626" stroke="none" />
      <path d="M27 29 q5 3 10 0" fill="none" />
    {:else if name === 'Naga'}
      <path d="M12 66 q-6 -14 8 -20 q4 -3 8 2 q-6 6 -2 14 q6 -2 8 4 q-10 6 -22 0z" fill="#0d9488" />
      <path d="M22 36 q10 -9 20 0 l2 22 q-12 6 -24 0z" fill="#14b8a6" />
      <path d="M44 24 l6 -10 l4 3 l-6 9z" fill="#fbbf24" />
      <circle cx="32" cy="24" r="9" fill="#2dd4bf" />
      <path d="M24 20 q8 -10 16 0" fill="none" stroke="#0f766e" stroke-width="2" />
      <circle cx="28" cy="24" r="1.6" fill="#fef08a" stroke="none" />
      <circle cx="36" cy="24" r="1.6" fill="#fef08a" stroke="none" />
      <path d="M18 40 q-7 6 -3 16 l5 -1" fill="#14b8a6" />
    {:else if name === 'Giant'}
      <path d="M20 62 l-4 16 h10 l2 -13" fill="#4c1d95" />
      <path d="M42 62 l4 16 h-10 l-2 -13" fill="#4c1d95" />
      <path d="M16 32 q16 -14 32 0 l3 30 h-38 z" fill="#6d28d9" />
      <path d="M13 36 q-9 10 -4 22 l7 -1" fill="#6d28d9" />
      <path d="M50 36 q8 8 5 20 l-7 1" fill="#6d28d9" />
      <path d="M54 14 l6 30 l-8 4 l-4 -30z" fill="#78716c" />
      <circle cx="32" cy="18" r="12" fill="#8b5cf6" />
      <circle cx="27" cy="17" r="2" fill="#1e1b4b" stroke="none" />
      <circle cx="37" cy="17" r="2" fill="#1e1b4b" stroke="none" />
      <path d="M27 25 q5 3 10 0" fill="none" />
    {:else if name === 'Titan'}
      <path d="M18 62 l-4 16 h10 l2 -13" fill="#78350f" />
      <path d="M44 62 l4 16 h-10 l-2 -13" fill="#78350f" />
      <path d="M14 32 q18 -16 36 0 l3 30 h-42 z" fill="#b45309" />
      <path d="M11 36 q-9 10 -4 22 l7 -1" fill="#b45309" />
      <path d="M53 36 q8 8 5 20 l-7 1" fill="#b45309" />
      <path d="M58 12 l4 34" stroke="#fde68a" stroke-width="3" />
      <path d="M55 20 l6 3 l-6 3 l-3 -3z" fill="#38bdf8" />
      <circle cx="32" cy="16" r="13" fill="#f59e0b" />
      <path d="M20 14 q12 -16 24 0 l0 -6 q-12 -10 -24 0z" fill="#78350f" />
      <circle cx="26" cy="16" r="2.2" fill="#1e1b4b" stroke="none" />
      <circle cx="38" cy="16" r="2.2" fill="#1e1b4b" stroke="none" />
      <path d="M26 24 q6 4 12 0" fill="none" />
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
