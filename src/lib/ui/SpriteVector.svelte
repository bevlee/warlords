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
    {:else if name === 'Skeleton'}
      <path d="M26 58 l0 18 M38 58 l0 18" stroke="#e7e5e4" stroke-width="3" />
      <path d="M22 40 q10 -8 20 0 l0 20 h-20 z" fill="none" />
      <path d="M24 42 h16 M24 47 h16 M24 52 h16" stroke="#e7e5e4" stroke-width="2" />
      <path d="M16 44 l6 -2 M48 44 l-6 -2" stroke="#e7e5e4" stroke-width="2" />
      <circle cx="32" cy="26" r="10" fill="#f5f5f4" />
      <path d="M27 24 q5 4 10 0" stroke="#1c1917" fill="none" />
      <circle cx="27" cy="23" r="2.2" fill="#1c1917" stroke="none" />
      <circle cx="37" cy="23" r="2.2" fill="#1c1917" stroke="none" />
      <path d="M30 30 l1 3 h2 l1 -3z" fill="#1c1917" stroke="none" />
    {:else if name === 'Zombie'}
      <path d="M24 60 l-4 16 h9 l1 -13" fill="#3f6212" />
      <path d="M39 60 l4 16 h-9 l-1 -13" fill="#3f6212" />
      <path d="M20 40 q12 -8 24 2 l1 20 h-27 z" fill="#65805c" />
      <path d="M18 42 q-8 8 -3 18 l6 -1" fill="#65805c" />
      <path d="M45 44 q7 6 4 16 l-6 -1" fill="#65805c" />
      <circle cx="31" cy="26" r="10" fill="#84936f" />
      <path d="M24 24 q9 -10 16 -2" stroke="#3f6212" fill="none" />
      <circle cx="27" cy="26" r="1.8" fill="#1c1917" stroke="none" />
      <circle cx="35" cy="24" r="1.4" fill="#1c1917" stroke="none" />
      <path d="M28 32 q4 1 7 -1" fill="none" />
    {:else if name === 'Ghost'}
      <path d="M18 40 q14 -18 28 0 l2 30 q-4 4 -6 0 q-3 5 -6 0 q-3 5 -6 0 q-3 5 -6 0 q-3 5 -6 0 z" fill="#e0e7ff" fill-opacity="0.85" />
      <circle cx="32" cy="30" r="9" fill="#f8fafc" fill-opacity="0.9" />
      <circle cx="28" cy="29" r="2" fill="#4338ca" stroke="none" />
      <circle cx="36" cy="29" r="2" fill="#4338ca" stroke="none" />
      <path d="M28 36 q4 -3 8 0" fill="none" stroke="#4338ca" />
    {:else if name === 'Vampire'}
      <path d="M16 34 q16 -6 16 10 l0 8 q-10 6 -16 -2 z" fill="#1e1b1b" />
      <path d="M48 34 q-16 -6 -16 10 l0 8 q10 6 16 -2 z" fill="#1e1b1b" />
      <path d="M23 40 q9 -8 18 0 l2 24 h-22 z" fill="#27272a" />
      <path d="M23 60 l-2 16 h8 M39 60 l2 16 h-8" stroke="#18181b" />
      <circle cx="32" cy="27" r="9" fill="#e4d4c8" />
      <path d="M23 25 q9 -11 18 0 l0 -3 q-9 -7 -18 0z" fill="#18181b" />
      <circle cx="28" cy="27" r="1.8" fill="#dc2626" stroke="none" />
      <circle cx="36" cy="27" r="1.8" fill="#dc2626" stroke="none" />
      <path d="M29 32 l1 3 M35 32 l-1 3" stroke="#f8fafc" stroke-width="1.5" />
    {:else if name === 'Lich'}
      <path d="M20 38 q12 -10 24 0 l3 32 h-30 z" fill="#3730a3" />
      <path d="M17 42 q-8 8 -3 18 l6 -1" fill="#3730a3" />
      <path d="M46 42 q7 6 4 16 l-6 -1" fill="#3730a3" />
      <path d="M50 18 l0 36" stroke="#78716c" stroke-width="3" />
      <circle cx="50" cy="16" r="4" fill="#a855f7" />
      <path d="M22 24 q10 -12 20 0 l-2 6 q-8 -6 -16 0z" fill="#4c1d95" />
      <circle cx="27" cy="26" r="2.2" fill="#a855f7" stroke="none" />
      <circle cx="37" cy="26" r="2.2" fill="#a855f7" stroke="none" />
    {:else if name === 'Black Knight'}
      <path d="M22 60 l-3 16 h9 l2 -13" fill="#1e1b1b" />
      <path d="M40 60 l3 16 h-9 l-2 -13" fill="#1e1b1b" />
      <path d="M19 38 q13 -10 26 0 l2 24 h-30 z" fill="#27272a" />
      <rect x="22" y="52" width="20" height="5" fill="#4c1d95" />
      <path d="M48 18 l0 32" stroke="#3f3f46" stroke-width="4" />
      <path d="M44 16 l4 -7 l4 7z" fill="#71717a" />
      <path d="M16 40 q-9 5 -6 18 l7 -1z" fill="#27272a" />
      <circle cx="32" cy="25" r="10" fill="#18181b" />
      <path d="M22 25 q10 -14 20 0 l0 -6 q-10 -8 -20 0z" fill="#3f3f46" />
      <circle cx="28" cy="25" r="1.6" fill="#a855f7" stroke="none" />
      <circle cx="36" cy="25" r="1.6" fill="#a855f7" stroke="none" />
    {:else if name === 'Bone Dragon'}
      <path d="M32 44 q-18 -16 -30 -10 q5 11 17 14 q-8 3 -13 9 q11 5 20 0z" fill="#e7e5e4" />
      <path d="M32 44 q18 -16 30 -10 q-5 11 -17 14 q8 3 13 9 q-11 5 -20 0z" fill="#e7e5e4" />
      <path d="M25 38 q7 -8 14 0 l0 24 q-7 4 -14 0z" fill="#f5f5f4" />
      <path d="M27 38 l3 22 M35 38 l-3 22" stroke="#a8a29e" />
      <circle cx="32" cy="28" r="9" fill="#f5f5f4" />
      <path d="M25 22 l-3 -8 M39 22 l3 -8" stroke="#a8a29e" stroke-width="2" />
      <circle cx="28" cy="27" r="1.8" fill="#dc2626" stroke="none" />
      <circle cx="36" cy="27" r="1.8" fill="#dc2626" stroke="none" />
      <path d="M28 33 q4 3 8 0" fill="none" />
    {:else if name === 'Sprite'}
      <path d="M32 40 q-10 -14 -20 -8 q3 9 12 11 q-6 3 -9 8 q8 3 15 -2z" fill="#facc15" fill-opacity="0.8" />
      <path d="M32 40 q10 -14 20 -8 q-3 9 -12 11 q6 3 9 8 q-8 3 -15 -2z" fill="#facc15" fill-opacity="0.8" />
      <circle cx="32" cy="34" r="8" fill="#4ade80" />
      <circle cx="29" cy="33" r="1.4" fill="#14532d" stroke="none" />
      <circle cx="35" cy="33" r="1.4" fill="#14532d" stroke="none" />
      <path d="M28 46 q4 6 0 14 M36 46 q-4 6 0 14" stroke="#22c55e" stroke-width="2" fill="none" />
    {:else if name === 'Wood Elf'}
      <path d="M25 58 l-2 18 h8 l1 -15" fill="#365314" />
      <path d="M38 58 l2 18 h-8 l-1 -15" fill="#365314" />
      <path d="M22 38 q10 -8 20 0 l2 22 h-24 z" fill="#4d7c0f" />
      <path d="M44 20 q6 18 -2 34" fill="none" stroke="#8b5a2b" stroke-width="2.5" />
      <path d="M44 20 l-6 5 M44 54 l-6 -4" stroke="#bef264" stroke-width="1.2" />
      <path d="M20 40 q-8 8 -4 18 l5 1" fill="#4d7c0f" />
      <circle cx="32" cy="26" r="9" fill="#d8ab72" />
      <path d="M23 24 q9 -9 18 0 l-1 -4 q-8 -6 -16 0z" fill="#166534" />
      <circle cx="29" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
      <circle cx="35" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
    {:else if name === 'Dendroid'}
      <path d="M18 64 l-4 14 h10 M42 64 l4 14 h-10" fill="none" stroke="#4d3319" stroke-width="2" />
      <path d="M16 34 q16 -14 32 0 l2 30 h-36 z" fill="#6b4423" />
      <path d="M20 40 l-8 -6 M44 40 l8 -6 M18 50 l-9 2 M46 50 l9 2" stroke="#4d3319" stroke-width="2.5" />
      <circle cx="32" cy="20" r="12" fill="#3f6212" />
      <path d="M22 16 q10 -10 20 0 M24 26 q8 6 16 0" stroke="#1a2e05" fill="none" />
      <circle cx="27" cy="19" r="1.8" fill="#1a2e05" stroke="none" />
      <circle cx="37" cy="19" r="1.8" fill="#1a2e05" stroke="none" />
    {:else if name === 'Pegasus'}
      <path d="M10 56 q4 -14 26 -13 q18 1 24 9 q5 7 -3 10 q-22 5 -42 0 q-7 -2 -5 -6z" fill="#f8fafc" />
      <path d="M50 46 q13 -6 16 4 l-8 1 l6 6 q-10 4 -14 -4z" fill="#f1f5f9" />
      <path d="M52 42 l-2 -8 l7 6z" fill="#e2e8f0" />
      <circle cx="58" cy="52" r="1.8" fill="#1e293b" stroke="none" />
      <path d="M8 56 l-6 6 l8 1z" fill="#f1f5f9" />
      <path d="M6 58 l-2 14 h7 l2 -11 M44 62 l2 14 h-7 l-1 -11" fill="#cbd5e1" />
      <circle cx="30" cy="30" r="9" fill="#f8fafc" />
      <path d="M22 27 l-8 -4 l7 8z M38 27 l8 -4 l-7 8z" fill="#fde68a" />
      <circle cx="27" cy="29" r="1.6" fill="#1e293b" stroke="none" />
      <circle cx="33" cy="29" r="1.6" fill="#1e293b" stroke="none" />
    {:else if name === 'Grand Elf'}
      <path d="M25 58 l-2 18 h8 l1 -15" fill="#14532d" />
      <path d="M38 58 l2 18 h-8 l-1 -15" fill="#14532d" />
      <path d="M22 38 q10 -8 20 0 l2 22 h-24 z" fill="#15803d" />
      <path d="M46 18 q7 20 -2 36" fill="none" stroke="#8b5a2b" stroke-width="2.5" />
      <path d="M46 18 l-6 5 M44 54 l-6 -4" stroke="#fde68a" stroke-width="1.2" />
      <path d="M20 40 q-8 8 -4 18 l5 1" fill="#15803d" />
      <circle cx="32" cy="26" r="9" fill="#e2c9a8" />
      <path d="M22 22 q10 -12 20 0 l-1 -5 q-9 -7 -18 0z" fill="#166534" />
      <path d="M22 20 l-3 -3 M42 20 l3 -3" stroke="#166534" stroke-width="1.5" />
      <circle cx="29" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
      <circle cx="35" cy="26" r="1.5" fill="#3f2d20" stroke="none" />
    {:else if name === 'Battle Dwarf'}
      <path d="M22 62 l-3 14 h9 l2 -11" fill="#78350f" />
      <path d="M40 62 l3 14 h-9 l-2 -11" fill="#78350f" />
      <path d="M17 36 q15 -12 30 0 l3 28 h-36 z" fill="#b45309" />
      <path d="M13 40 q-8 8 -3 18 l6 -1" fill="#b45309" />
      <path d="M48 40 q7 6 4 16 l-6 -1" fill="#b45309" />
      <path d="M8 44 l10 -6 l3 5 l-10 6z" fill="#94a3b8" />
      <circle cx="32" cy="22" r="10" fill="#e2c9a8" />
      <path d="M23 30 q9 6 18 0 l1 -10 q-10 5 -20 0z" fill="#78350f" />
      <circle cx="27" cy="21" r="1.8" fill="#1c1917" stroke="none" />
      <circle cx="37" cy="21" r="1.8" fill="#1c1917" stroke="none" />
    {:else if name === 'Unicorn'}
      <path d="M8 58 q4 -14 26 -13 q18 1 24 9 q5 7 -3 10 q-22 5 -42 0 q-7 -2 -5 -6z" fill="#fafaf9" />
      <path d="M48 48 q13 -6 16 4 l-8 1 l6 6 q-10 4 -14 -4z" fill="#f5f5f4" />
      <path d="M6 58 l-6 6 l8 1z" fill="#f5f5f4" />
      <path d="M4 60 l-2 14 h7 l2 -11 M42 64 l2 14 h-7 l-1 -11" fill="#e7e5e4" />
      <circle cx="28" cy="30" r="9" fill="#fafaf9" />
      <path d="M28 21 l3 -14 l3 14z" fill="#fde68a" />
      <path d="M20 27 l-8 -4 l7 8z" fill="#fef08a" />
      <circle cx="25" cy="29" r="1.6" fill="#1e293b" stroke="none" />
      <circle cx="31" cy="29" r="1.6" fill="#1e293b" stroke="none" />
    {:else if name === 'Imp'}
      <path d="M24 56 l-2 14 h7 l1 -11" fill="#7f1d1d" />
      <path d="M37 56 l2 14 h-7 l-1 -11" fill="#7f1d1d" />
      <path d="M22 42 q9 -8 18 0 l1 16 h-20 z" fill="#dc2626" />
      <path d="M40 46 q10 4 12 14 q-6 0 -8 -4z" fill="#dc2626" />
      <circle cx="32" cy="28" r="9" fill="#ef4444" />
      <path d="M22 24 l-6 -8 M42 24 l6 -8" stroke="#7f1d1d" stroke-width="2.5" />
      <circle cx="28" cy="28" r="1.8" fill="#fef08a" stroke="none" />
      <circle cx="36" cy="28" r="1.8" fill="#fef08a" stroke="none" />
      <path d="M28 34 q4 -2 8 0" fill="none" />
    {:else if name === 'Gog'}
      <path d="M23 58 l-2 16 h8 l1 -13" fill="#7c2d12" />
      <path d="M38 58 l2 16 h-8 l-1 -13" fill="#7c2d12" />
      <path d="M20 40 q10 -8 20 0 l2 20 h-24 z" fill="#c2410c" />
      <rect x="16" y="44" width="6" height="14" rx="2" fill="#57534e" />
      <path d="M18 40 q-8 8 -4 18 l5 1" fill="#c2410c" />
      <circle cx="32" cy="26" r="9" fill="#ea580c" />
      <path d="M23 22 l-6 -6 M41 22 l6 -6" stroke="#7c2d12" stroke-width="2" />
      <circle cx="28" cy="26" r="1.6" fill="#fef08a" stroke="none" />
      <circle cx="36" cy="26" r="1.6" fill="#fef08a" stroke="none" />
    {:else if name === 'Hell Hound'}
      <path d="M8 56 q4 -12 22 -12 q16 0 20 8 q4 6 -3 9 q-18 4 -34 0 q-6 -2 -5 -5z" fill="#292524" />
      <path d="M44 44 q10 -4 12 4 l-6 1 l4 5 q-8 3 -12 -3z" fill="#292524" />
      <path d="M6 56 l-4 5 l7 1z" fill="#292524" />
      <path d="M4 58 l-2 12 h6 l2 -10 M36 60 l2 12 h-6 l-2 -10" fill="#1c1917" />
      <circle cx="26" cy="28" r="9" fill="#3f3f46" />
      <path d="M18 25 l-6 -3 l5 7z M30 22 l0 -8 l4 7z" fill="#dc2626" />
      <circle cx="23" cy="28" r="1.6" fill="#f97316" stroke="none" />
      <circle cx="29" cy="28" r="1.6" fill="#f97316" stroke="none" />
    {:else if name === 'Demon'}
      <path d="M14 40 q-14 -16 -22 -8 q4 12 16 14 q-8 3 -12 9 q11 5 20 -1z" fill="#7f1d1d" />
      <path d="M50 40 q14 -16 22 -8 q-4 12 -16 14 q8 3 12 9 q-11 5 -20 -1z" fill="#7f1d1d" />
      <path d="M22 42 q10 -8 20 0 l2 22 h-24 z" fill="#b91c1c" />
      <path d="M24 62 l-3 14 h8 M38 62 l3 14 h-8" stroke="#7f1d1d" />
      <circle cx="32" cy="26" r="10" fill="#dc2626" />
      <path d="M23 20 l-4 -10 M41 20 l4 -10" stroke="#450a0a" stroke-width="2.5" />
      <circle cx="28" cy="26" r="1.8" fill="#fde047" stroke="none" />
      <circle cx="36" cy="26" r="1.8" fill="#fde047" stroke="none" />
      <path d="M28 32 q4 -2 8 0" fill="none" />
    {:else if name === 'Pit Fiend'}
      <path d="M12 38 q-16 -16 -24 -6 q5 12 17 13 q-8 4 -12 10 q12 4 21 -3z" fill="#581c1c" />
      <path d="M52 38 q16 -16 24 -6 q-5 12 -17 13 q8 4 12 10 q-12 4 -21 -3z" fill="#581c1c" />
      <path d="M20 40 q12 -9 24 0 l2 24 h-28 z" fill="#991b1b" />
      <path d="M50 18 l0 24" stroke="#292524" stroke-width="3" />
      <path d="M46 16 l4 -7 l4 7z" fill="#ef4444" />
      <circle cx="32" cy="24" r="10" fill="#b91c1c" />
      <path d="M22 18 l-5 -10 M42 18 l5 -10" stroke="#450a0a" stroke-width="2.5" />
      <circle cx="27" cy="24" r="1.9" fill="#fde047" stroke="none" />
      <circle cx="37" cy="24" r="1.9" fill="#fde047" stroke="none" />
    {:else if name === 'Efreet'}
      <path d="M32 46 q-16 -20 -28 -14 q4 12 16 16 q-7 3 -12 9 q10 5 20 0z" fill="#f97316" />
      <path d="M32 46 q16 -20 28 -14 q-4 12 -16 16 q7 3 12 9 q-10 5 -20 0z" fill="#f97316" />
      <path d="M24 40 q8 -8 16 0 l0 24 q-8 4 -16 0z" fill="#fb923c" />
      <path d="M22 66 q-2 10 4 12 M42 66 q2 10 -4 12" fill="none" stroke="#ea580c" stroke-width="3" />
      <circle cx="32" cy="26" r="10" fill="#fdba74" />
      <path d="M22 18 q10 -10 20 0" fill="none" stroke="#c2410c" stroke-width="2.5" />
      <circle cx="28" cy="26" r="2" fill="#7c2d12" stroke="none" />
      <circle cx="36" cy="26" r="2" fill="#7c2d12" stroke="none" />
      <path d="M28 33 q4 3 8 0" fill="none" />
    {:else if name === 'Devil'}
      <path d="M10 36 q-18 -18 -28 -6 q5 13 19 14 q-9 4 -14 11 q13 5 23 -3z" fill="#450a0a" />
      <path d="M54 36 q18 -18 28 -6 q-5 13 -19 14 q9 4 14 11 q-13 5 -23 -3z" fill="#450a0a" />
      <path d="M18 40 q14 -10 28 0 l3 28 h-34 z" fill="#7f1d1d" />
      <path d="M50 20 l4 30 l-6 2 l-4 -30z" fill="#292524" />
      <path d="M46 16 l6 -3 l0 6z M56 16 l-4 4 l6 2z" fill="#292524" />
      <circle cx="32" cy="24" r="11" fill="#991b1b" />
      <path d="M20 18 l-6 -12 M44 18 l6 -12" stroke="#1c1917" stroke-width="3" />
      <circle cx="27" cy="24" r="2.1" fill="#fde047" stroke="none" />
      <circle cx="37" cy="24" r="2.1" fill="#fde047" stroke="none" />
      <path d="M27 31 q5 -3 10 0" fill="none" />
    {:else if name === 'Blood Acolyte'}
      <path d="M22 40 q10 -10 20 0 l3 36 h-26 z" fill="#7f1d1d" />
      <path d="M25 76 h14" stroke="#450a0a" stroke-width="3" />
      <path d="M24 42 q-6 10 -4 20 l5 2" fill="#7f1d1d" />
      <path d="M40 42 q6 10 4 20 l-5 2" fill="#7f1d1d" />
      <path d="M22 34 q10 -14 20 0 q-4 6 -10 6 q-6 0 -10 -6z" fill="#991b1b" />
      <circle cx="32" cy="28" r="8" fill="#e7e5e4" />
      <circle cx="29" cy="27" r="1.6" fill="#dc2626" stroke="none" />
      <circle cx="35" cy="27" r="1.6" fill="#dc2626" stroke="none" />
      <path d="M46 46 l6 -10 l3 3 l-6 10 z" fill="#cbd5e1" />
    {:else if name === 'Ram Rider'}
      <path d="M10 60 l-2 16 h7 l2 -13" fill="#a8a29e" />
      <path d="M44 60 l2 16 h7 l-1 -13" fill="#a8a29e" />
      <path d="M8 56 q6 -12 26 -11 q16 1 22 8 q4 6 -3 9 q-22 5 -40 0 q-7 -2 -5 -6z" fill="#d6d3d1" />
      <path d="M50 46 q10 -4 12 5 l-6 1 l4 4 q-7 4 -12 -3z" fill="#d6d3d1" />
      <path d="M56 42 q6 -6 2 -12 q-6 2 -6 9" fill="#78716c" />
      <circle cx="56" cy="50" r="1.6" fill="#1c1917" stroke="none" />
      <circle cx="30" cy="28" r="9" fill="#c9995f" />
      <path d="M23 34 q7 -6 14 0 l-2 12 q-5 3 -10 0 z" fill="#7c2d12" />
      <path d="M40 16 l2 26" stroke="#8b5a2b" stroke-width="3" />
      <path d="M42 16 l-3 -8 l8 3 z" fill="#cbd5e1" />
      <circle cx="27" cy="27" r="1.7" fill="#fbbf24" stroke="none" />
      <circle cx="33" cy="27" r="1.7" fill="#fbbf24" stroke="none" />
    {:else if name === 'Standard Bearer'}
      <path d="M26 58 l-3 18 h9 l1 -15" fill="#475569" />
      <path d="M38 58 l3 18 h-9 l-1 -15" fill="#475569" />
      <path d="M23 40 q9 -8 18 0 l-1 20 h-16 z" fill="#e2e8f0" />
      <path d="M27 46 h10 v8 h-10 z" fill="#dc2626" stroke="none" />
      <circle cx="32" cy="30" r="8" fill="#f1c27d" />
      <path d="M24 27 q8 -8 16 0 l-2 -8 h-12 z" fill="#94a3b8" />
      <path d="M48 10 l0 52" stroke="#78350f" stroke-width="3" />
      <path d="M50 13 h13 l-4 5 l4 5 h-13 z" fill="#f59e0b" />
      <circle cx="29" cy="29" r="1.6" fill="#1c1917" stroke="none" />
      <circle cx="35" cy="29" r="1.6" fill="#1c1917" stroke="none" />
    {:else if name === 'Outrider'}
      <path d="M12 62 l-2 14 h6 l2 -11" fill="#e7e5e4" />
      <path d="M46 62 l2 14 h6 l-1 -11" fill="#e7e5e4" />
      <path d="M10 58 q5 -13 27 -12 q17 1 22 9 q4 6 -4 9 q-21 4 -40 0 q-7 -2 -5 -6z" fill="#f5f5f4" />
      <path d="M52 48 q10 -3 12 6 l-7 1 l4 4 q-8 4 -12 -4z" fill="#f5f5f4" />
      <path d="M56 44 l-2 -7 l6 5z" fill="#d6d3d1" />
      <circle cx="58" cy="53" r="1.6" fill="#1c1917" stroke="none" />
      <circle cx="30" cy="26" r="8" fill="#f1c27d" />
      <path d="M23 22 l-4 -5 l6 2z" fill="#f1c27d" />
      <path d="M37 22 l4 -5 l-6 2z" fill="#f1c27d" />
      <path d="M23 32 q7 -5 14 0 l-2 12 q-5 3 -10 0 z" fill="#166534" />
      <path d="M42 18 q6 8 0 18" fill="none" stroke="#8b5a2b" />
      <circle cx="27" cy="25" r="1.6" fill="#1c1917" stroke="none" />
      <circle cx="33" cy="25" r="1.6" fill="#1c1917" stroke="none" />
    {:else if name === 'Siege Golem'}
      <path d="M20 62 l-3 14 h11 l1 -11" fill="#57534e" />
      <path d="M44 62 l3 14 h-11 l-1 -11" fill="#57534e" />
      <path d="M16 34 q16 -12 32 0 l3 28 h-38 z" fill="#78716c" />
      <path d="M20 40 h24 M20 48 h24 M20 56 h24" stroke="#57534e" fill="none" />
      <path d="M14 36 q-8 8 -4 18 q5 4 10 0 l-2 -14" fill="#a8a29e" />
      <path d="M50 36 q8 8 4 18 q-5 4 -10 0 l2 -14" fill="#a8a29e" />
      <path d="M24 22 q8 -8 16 0 l-2 12 h-12 z" fill="#a8a29e" />
      <circle cx="29" cy="27" r="2" fill="#f59e0b" stroke="none" />
      <circle cx="37" cy="27" r="2" fill="#f59e0b" stroke="none" />
    {:else if name === 'Blood Fiend'}
      <path d="M26 58 l-4 18 h8 l2 -15" fill="#7f1d1d" />
      <path d="M38 58 l4 18 h-8 l-2 -15" fill="#7f1d1d" />
      <path d="M24 36 q8 -8 16 0 l2 24 h-20 z" fill="#991b1b" />
      <path d="M22 38 l-10 -8 l2 12 l8 2z" fill="#7f1d1d" />
      <path d="M42 38 l10 -8 l-2 12 l-8 2z" fill="#7f1d1d" />
      <circle cx="32" cy="26" r="9" fill="#b91c1c" />
      <path d="M26 20 l-3 -7 l6 4z" fill="#b91c1c" />
      <path d="M38 20 l3 -7 l-6 4z" fill="#b91c1c" />
      <path d="M28 31 l2 4 l2 -4 M34 31 l2 4 l2 -4" fill="#f8fafc" stroke="#f8fafc" stroke-width="1" />
      <circle cx="28" cy="25" r="1.8" fill="#fde047" stroke="none" />
      <circle cx="36" cy="25" r="1.8" fill="#fde047" stroke="none" />
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
