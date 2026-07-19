# Battle Log Readability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Battle-log unit names are colored by the controller that owns them (you / allied AI / enemy, extensible to more players), damage numbers render as large red figures that grow with size tiers (>50, >100, >1000), stack kills display as "-x 💀" both in the log and floating over the battlefield, hero-less enemy stacks read as "wild Goblins", and the system is ready for boss battles with named enemy heroes ("Karth's Skeletons"). The token count badge on the battlefield also gets bigger and controller-colored.

**Architecture:** Log lines change from plain strings to structured segments. A new pure module `logLines.ts` ports `describe`/`unitLabel` out of Battle.svelte, returning `LogLine` values (`round` markers or `segments` arrays where segments carry a `controller` tag for color, a `damage` tier for red scaled numbers, a `kills` flag for skull segments, or `emph` for other numbers). A tiny `controllers.ts` module maps a unit to its controller id and each controller to its Tailwind classes. The battlefield floaters reuse the same `damageTier` helper: the `damage` AnimStep gains a `kills` count so BattleFx can float "-x 💀" under the red number.

**Tech Stack:** Svelte 5 (runes), TypeScript, Tailwind (classes must be literal strings — the scanner reads `.ts` files per `tailwind.config.js`), Vitest.

**⚠️ Interplay:** the projectiles plan (`2026-07-17-projectiles-and-spell-fx.md`) also edits `animSteps.ts` (shoot case) and `BattleFx.svelte`. Whichever plan executes second must merge, not clobber: this plan adds `kills` to damage steps and tier classes to the floater; that plan adds `projectile`/`spell_fx` kinds and `delayed`. They compose — both can be present.

---

## Current state (context for the implementer)

- `Battle.svelte:370-427` — `unitLabel` + `describe` build plain strings: `"enemy Goblins strike Ogres for 12 damage, killing 2."`; `logLines = battle.log.map(describe)`.
- `GameLog.svelte` receives `lines: string[]` and regex-parses `"— Round N —"` back out for sticky headers — structured lines make that regex unnecessary.
- `UnitToken.svelte:23-29` — count badge is `text-[11px]` (9px small variant), colored by a `side` ternary (sky vs red).
- `UnitStack` has `side: 'player' | 'enemy'`, `isAlly?`, `isHero?` ([types.ts](../../src/lib/engine/types.ts)). `Hero` has **no name field**. Enemy armies currently have no hero at all.
- `SPELL_META` is defined locally in `Battle.svelte:155` and used in `describe` and the status text.
- `attack`/`retaliate`/`shoot`/`cast` log entries all carry a `killed` count; `stepsFromLogEntry` (animSteps.ts) currently drops it — the floating text only shows damage.
- `BattleFx.svelte` floats `-N` in red (`.fx-damage`, 1rem) rising over the target cell.

**Labeling rules decided with the user:**

| Unit | Label | Color |
|---|---|---|
| Your stacks | `Goblins` | player (sky) |
| Your hero | `hero.name` ?? `your hero` | player (sky) |
| Allied (summoned) stacks | `allied Elves` | ally (emerald) |
| Enemy stacks, no enemy hero | `wild Goblins` | enemy (red) |
| Enemy stacks, boss hero present | `Karth's Goblins` | enemy (red) |
| Enemy hero (future boss) | `Karth` ?? `the enemy hero` | enemy (red) |

**Damage display rules decided with the user:**

- Damage numbers: red, bold, size-tiered — tier 0 (≤50), tier 1 (>50), tier 2 (>100), tier 3 (>1000). Applies in the log **and** the battlefield floater.
- Kills: "-x 💀", both places; omitted entirely when 0.
- Log sentence becomes `"…strike wild Wolfs for 12 damage. -2 💀"` (kills segment replaces `", killing 2."`).

Boss battles don't exist yet: `describeEvent` takes an optional `enemyHeroName` param that Battle.svelte doesn't pass today — that's the whole seam.

---

### Task 1: Controller identity + palette (`controllers.ts`)

**Files:**
- Create: `src/lib/ui/controllers.ts`
- Test: `src/lib/ui/__tests__/controllers.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { controllerOf, CONTROLLER_STYLE } from '../controllers';
import type { UnitStack } from '$lib/engine/types';

describe('controllerOf', () => {
  it('maps your own stacks to player', () => {
    expect(controllerOf({ side: 'player' } as UnitStack)).toBe('player');
  });

  it('maps your hero to player', () => {
    expect(controllerOf({ side: 'player', isHero: true } as UnitStack)).toBe('player');
  });

  it('maps summoned allies to ally', () => {
    expect(controllerOf({ side: 'player', isAlly: true } as UnitStack)).toBe('ally');
  });

  it('maps enemy stacks to enemy', () => {
    expect(controllerOf({ side: 'enemy' } as UnitStack)).toBe('enemy');
  });
});

describe('CONTROLLER_STYLE', () => {
  it('has log and badge classes for every controller', () => {
    for (const id of ['player', 'ally', 'enemy'] as const) {
      expect(CONTROLLER_STYLE[id].log).toBeTruthy();
      expect(CONTROLLER_STYLE[id].badge).toBeTruthy();
    }
  });
});
```

(`controllerOf` only reads `side`/`isAlly` — partial casts keep the tests short.)

**Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/ui/__tests__/controllers.test.ts`
Expected: FAIL — module `../controllers` not found.

**Step 3: Implement `src/lib/ui/controllers.ts`**

```ts
import type { UnitStack } from '$lib/engine/types';

/** Who commands a stack. Derived from side/isAlly today; when real
 *  multiplayer arrives, stamp a controller id on UnitStack in initBattle
 *  and this becomes a field read — every consumer already goes through here. */
export type ControllerId = 'player' | 'ally' | 'enemy';

export function controllerOf(u: UnitStack): ControllerId {
  if (u.side === 'enemy') return 'enemy';
  return u.isAlly ? 'ally' : 'player';
}

/** Tailwind classes per controller. Literal strings on purpose — the
 *  Tailwind scanner reads .ts files and can't see computed names.
 *  `log` colors unit names in the battle log; `badge` colors the count
 *  plate on battlefield tokens. Add entries here for future players. */
export const CONTROLLER_STYLE: Record<ControllerId, { log: string; badge: string }> = {
  player: { log: 'text-sky-300', badge: 'border-sky-300 bg-sky-700' },
  ally: { log: 'text-emerald-300', badge: 'border-emerald-300 bg-emerald-700' },
  enemy: { log: 'text-red-300', badge: 'border-red-300 bg-red-700' },
};
```

**Step 4: Run tests — verify pass**

Run: `npx vitest run src/lib/ui/__tests__/controllers.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ui/controllers.ts src/lib/ui/__tests__/controllers.test.ts
git commit -m "feat: controller identity and color palette for units"
```

---

### Task 2: Structured log lines (`logLines.ts`) + `Hero.name` + `damageTier`

**Files:**
- Modify: `src/lib/engine/types.ts` (add `name?: string` to `Hero`)
- Create: `src/lib/ui/logLines.ts`
- Test: `src/lib/ui/__tests__/logLines.test.ts`

**Step 1: Add the field** — in `types.ts`, `interface Hero`:

```ts
export interface Hero {
  class: FactionClass;
  name?: string;       // display name; boss heroes are named, the player's may be
  level: number;
  // …rest unchanged
```

**Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { describeEvent, damageTier, type LogLine } from '../logLines';
import type { BattleEvent, Hero, UnitStack } from '$lib/engine/types';

const HERO: Hero = { class: 'barbarian', level: 3, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [] };

function stack(id: string, name: string, side: 'player' | 'enemy', overrides: Partial<UnitStack> = {}): UnitStack {
  return {
    id,
    definition: { name, tier: 1, speed: 5, initiative: 10, hp: 10, attack: 2, defense: 1, minDamage: 1, maxDamage: 2, shots: 0, range: 0, isLarge: false, abilities: [] },
    count: 5, hp: 10, pos: { col: 0, row: 0 }, side,
    hasRetaliated: false, shotsLeft: 0, morale: 0, luck: 0, atb: 0, isDefending: false,
    ...overrides,
  };
}

function textOf(line: LogLine): string {
  return line.kind === 'event' ? line.segments.map(s => s.text).join('') : `Round ${line.round}`;
}

describe('damageTier', () => {
  it('tiers at >50, >100, >1000', () => {
    expect(damageTier(1)).toBe(0);
    expect(damageTier(50)).toBe(0);
    expect(damageTier(51)).toBe(1);
    expect(damageTier(100)).toBe(1);
    expect(damageTier(101)).toBe(2);
    expect(damageTier(1000)).toBe(2);
    expect(damageTier(1001)).toBe(3);
  });
});

describe('describeEvent', () => {
  const units = [
    stack('g1', 'Goblin', 'player'),
    stack('e1', 'Wolf', 'enemy'),
    stack('a1', 'Elf', 'player', { isAlly: true }),
    stack('h1', 'Hero', 'player', { isHero: true }),
  ];

  it('turns round_start into a round marker', () => {
    const line = describeEvent({ type: 'round_start', data: { round: 2 } }, units, HERO);
    expect(line).toEqual({ kind: 'round', round: 2 });
  });

  it('colors attacker and target, tiers the damage number, and appends a skull kill segment', () => {
    const line = describeEvent(
      { type: 'attack', data: { attackerId: 'g1', targetId: 'e1', damage: 120, killed: 2 } },
      units, HERO
    );
    expect(line.kind).toBe('event');
    if (line.kind !== 'event') return;
    expect(textOf(line)).toBe('Goblins strike wild Wolfs for 120 damage. -2 💀');
    expect(line.segments.find(s => s.text === 'Goblins')?.controller).toBe('player');
    expect(line.segments.find(s => s.text === 'wild Wolfs')?.controller).toBe('enemy');
    expect(line.segments.find(s => s.text === '120')?.damage).toBe(2);
    expect(line.segments.find(s => s.text === '-2 💀')?.kills).toBe(true);
  });

  it('omits the kill segment when nothing died', () => {
    const line = describeEvent(
      { type: 'attack', data: { attackerId: 'g1', targetId: 'e1', damage: 3, killed: 0 } },
      units, HERO
    );
    expect(textOf(line)).toBe('Goblins strike wild Wolfs for 3 damage.');
  });

  it('labels enemy stacks as wild when there is no enemy hero', () => {
    const line = describeEvent({ type: 'defend', data: { unitId: 'e1' } }, units, HERO);
    expect(textOf(line)).toBe('Wild Wolfs brace for defense.');
  });

  it("labels enemy stacks possessively when an enemy hero name is given", () => {
    const line = describeEvent({ type: 'defend', data: { unitId: 'e1' } }, units, HERO, 'Karth');
    expect(textOf(line)).toBe("Karth's Wolfs brace for defense.");
  });

  it('labels allied stacks and tags them with the ally controller', () => {
    const line = describeEvent({ type: 'defend', data: { unitId: 'a1' } }, units, HERO);
    expect(textOf(line)).toBe('Allied Elfs brace for defense.');
    if (line.kind !== 'event') return;
    expect(line.segments[0].controller).toBe('ally');
  });

  it('uses the hero name when set, otherwise "your hero"', () => {
    const cast: BattleEvent = { type: 'cast', data: { spell: 'lightning', casterId: 'h1', targetId: 'e1', damage: 20, killed: 1 } };
    expect(textOf(describeEvent(cast, units, HERO))).toBe('Your hero casts Lightning at wild Wolfs for 20 damage. -1 💀');
    expect(textOf(describeEvent(cast, units, { ...HERO, name: 'Aria' }))).toBe('Aria casts Lightning at wild Wolfs for 20 damage. -1 💀');
  });

  it('capitalizes the first letter of a line', () => {
    const line = describeEvent({ type: 'death', data: { unitId: 'e1' } }, units, HERO);
    expect(textOf(line)).toBe('Wild Wolfs are wiped out!');
  });
});
```

**Step 3: Run — verify fail**

Run: `npx vitest run src/lib/ui/__tests__/logLines.test.ts`
Expected: FAIL — module not found.

**Step 4: Implement `src/lib/ui/logLines.ts`**

Port `describe`/`unitLabel` from `Battle.svelte:370-427` and `SPELL_META` from `Battle.svelte:155` (move it verbatim — glyphs and labels unchanged). Complete module:

```ts
import type { BattleEvent, Hero, Pos, SpellId, UnitStack } from '$lib/engine/types';
import { controllerOf, type ControllerId } from './controllers';

// Moved from Battle.svelte so log building is a pure, testable module.
export const SPELL_META: Record<SpellId, { glyph: string; label: string }> = {
  /* copy the exact object from Battle.svelte:155 */
};

/** Damage size tiers, shared by the log and the battlefield floaters:
 *  0 ≤50 · 1 >50 · 2 >100 · 3 >1000. */
export type DamageTier = 0 | 1 | 2 | 3;
export function damageTier(value: number): DamageTier {
  return value > 1000 ? 3 : value > 100 ? 2 : value > 50 ? 1 : 0;
}

export type LogSegment = {
  text: string;
  controller?: ControllerId; // unit-name segment — colored by owner
  damage?: DamageTier;       // red damage number, size-tiered
  kills?: boolean;           // "-x 💀" stack-kill segment
  emph?: boolean;            // other emphasized numbers (e.g. HP drained)
};

export type LogLine =
  | { kind: 'round'; round: number }
  | { kind: 'event'; segments: LogSegment[] };

/** Renders one battle event as colored segments.
 *  `enemyHeroName` is the boss-battle seam: named enemy heroes own their
 *  stacks ("Karth's Wolfs"); without one, enemy stacks are "wild Wolfs". */
export function describeEvent(
  ev: BattleEvent,
  units: UnitStack[],
  hero: Hero,
  enemyHeroName?: string
): LogLine {
  const unit = (id: unknown): LogSegment => {
    const u = units.find(u => u.id === id);
    if (!u) return { text: 'a unit' };
    const controller = controllerOf(u);
    if (u.isHero) {
      return u.side === 'enemy'
        ? { text: enemyHeroName ?? 'the enemy hero', controller }
        : { text: hero.name ?? 'your hero', controller };
    }
    const plural = `${u.definition.name}s`;
    if (u.side === 'enemy') {
      return { text: enemyHeroName ? `${enemyHeroName}'s ${plural}` : `wild ${plural}`, controller };
    }
    return { text: u.isAlly ? `allied ${plural}` : plural, controller };
  };

  const dmg = (value: unknown): LogSegment => ({ text: String(value), damage: damageTier(Number(value)) });
  const num = (value: unknown): LogSegment => ({ text: String(value), emph: true });
  const t = (text: string): LogSegment => ({ text });
  // null when nothing died — line() drops it, along with the sentence gap.
  const kills = (killed: unknown): LogSegment | null =>
    Number(killed) > 0 ? { text: `-${killed} 💀`, kills: true } : null;

  // Sentence fragments start lowercase ("your hero", "wild Wolfs") — lines
  // shouldn't. Capitalize the first character of the first segment.
  const line = (...segments: (LogSegment | null)[]): LogLine => {
    const kept = segments.filter((s): s is LogSegment => s !== null);
    const [first, ...rest] = kept;
    return {
      kind: 'event',
      segments: [{ ...first, text: first.text.charAt(0).toUpperCase() + first.text.slice(1) }, ...rest],
    };
  };

  const d = ev.data;
  switch (ev.type) {
    case 'round_start':
      return { kind: 'round', round: d.round as number };
    case 'move':
      return line(unit(d.unitId), t(` move to (${(d.to as Pos).col}, ${(d.to as Pos).row}).`));
    case 'defend':
      return line(unit(d.unitId), t(' brace for defense.'));
    case 'cast':
      return d.spell === 'lightning'
        ? line(unit(d.casterId), t(' casts Lightning at '), unit(d.targetId), t(' for '), dmg(d.damage), t(' damage. '), kills(d.killed))
        : line(unit(d.casterId), t(` casts ${SPELL_META[d.spell as SpellId].label} on `), unit(d.targetId), t('.'));
    case 'attack':
      return line(unit(d.attackerId), t(' strike '), unit(d.targetId), t(' for '), dmg(d.damage), t(' damage. '), kills(d.killed));
    case 'retaliate':
      return line(unit(d.attackerId), t(' retaliate against '), unit(d.targetId), t(' for '), dmg(d.damage), t(' damage. '), kills(d.killed));
    case 'shoot':
      return line(unit(d.attackerId), t(' shoot '), unit(d.targetId), t(' for '), dmg(d.damage), t(`${d.farShot ? ' (long shot — half damage)' : ''} damage. `), kills(d.killed));
    case 'death':
      return line(unit(d.unitId), t(' are wiped out!'));
    case 'morale_boost':
      return line(t('High morale! '), unit(d.unitId), t(' act again.'));
    case 'morale_freeze':
      return line(t('Low morale — '), unit(d.unitId), t(' freeze and skip their turn.'));
    case 'luck':
      return d.kind === 'good'
        ? line(t('Lucky strike! '), unit(d.unitId), t(' land a double-damage blow.'))
        : line(t('Bad luck — '), unit(d.unitId), t(' fumble for half damage.'));
    case 'status': {
      const u = unit(d.unitId);
      switch (d.effect) {
        case 'life_drain': return line(u, t(' drain '), num(d.heal), t(' HP of life.'));
        case 'slow': return line(u, t(' are slowed.'));
        case 'drain_morale': return line(u, t(' morale is drained.'));
        case 'blind': return line(u, t(' are blinded and skip their turn.'));
        case 'burn_apply': return line(u, t(' catch fire.'));
        case 'burn': return line(u, t(' burn for '), dmg(d.damage), t(' damage.'));
        case 'bind': return line(u, t(' are bound in place.'));
        case 'bind_block': return line(u, t(' strain against their bindings and cannot move.'));
        default: return line(u, t(` are affected by ${d.effect}.`));
      }
    }
    case 'battle_end':
      return line(t('The battle is over.'));
    default:
      return line(t(ev.type));
  }
}
```

⚠️ Careful with the trailing `' damage. '` + kills pattern: when `killed` is 0 the kills segment is dropped and the line ends with `"damage. "` — trim that: in `line()`, after filtering, `rest[rest.length - 1]`… simpler: make the damage-sentence text `' damage.'` (no trailing space) and the kills segment text `' -2 💀'` (leading space). Adjust the tests' expected strings accordingly if you take that route — the expectations above assume `' damage. '` + `'-2 💀'` with killed>0 and a trailing space when killed=0 is trimmed. **Recommended:** `t(' damage.')` + kills text `` ` -${killed} 💀` `` — no trailing-space problem at all; update the two expected strings to `'…for 120 damage. -2 💀'` (same visible text) and the segment lookup to `s.text === ' -2 💀'`.

**Step 5: Run — verify pass**

Run: `npx vitest run src/lib/ui/__tests__/logLines.test.ts && npm test`
Expected: PASS (full suite too — nothing consumes the module yet).

**Step 6: Commit**

```bash
git add src/lib/engine/types.ts src/lib/ui/logLines.ts src/lib/ui/__tests__/logLines.test.ts
git commit -m "feat: structured battle log lines with tiered damage and skull kills"
```

---

### Task 3: Render structured lines (GameLog.svelte + Battle.svelte wiring)

**Files:**
- Modify: `src/lib/ui/GameLog.svelte`
- Modify: `src/lib/ui/Battle.svelte` (delete `describe`, `unitLabel`, local `SPELL_META`; import from `logLines`)

No unit test — Svelte rendering; verified in Task 6.

**Step 1: GameLog.svelte — replace string handling with structured lines**

Props and grouping (drops the `ROUND_RE` regex entirely):

```svelte
<script lang="ts">
  import type { LogLine, DamageTier } from './logLines';
  import { CONTROLLER_STYLE } from './controllers';

  // Permanent, scrollable battle history, grouped under sticky round headers.
  interface Props {
    lines: LogLine[];
  }

  let { lines }: Props = $props();

  // Log body is 11px; damage grows with the hit. Literal classes for Tailwind.
  const DAMAGE_CLS: Record<DamageTier, string> = {
    0: 'text-[13px]',
    1: 'text-[15px]',
    2: 'text-[17px]',
    3: 'text-[20px]',
  };

  const groups = $derived.by(() => {
    const out: { round: number | null; lines: Extract<LogLine, { kind: 'event' }>[] }[] = [];
    let current: (typeof out)[number] | null = null;
    for (const line of lines) {
      if (line.kind === 'round') {
        current = { round: line.round, lines: [] };
        out.push(current);
        continue;
      }
      if (!current) {
        current = { round: null, lines: [] };
        out.push(current);
      }
      current.lines.push(line);
    }
    return out;
  });

  // …scroller/stick logic unchanged…
</script>
```

Line rendering (replace the `<p class="text-slate-400">{line}</p>` block):

```svelte
{#each group.lines as line, i (i)}
  <p class="text-slate-400">
    {#each line.segments as seg, j (j)}
      {#if seg.controller}<span class="font-semibold {CONTROLLER_STYLE[seg.controller].log}">{seg.text}</span
      >{:else if seg.damage !== undefined}<span class="font-bold text-red-400 {DAMAGE_CLS[seg.damage]}">{seg.text}</span
      >{:else if seg.kills}<span class="text-[13px] font-bold text-slate-200">{seg.text}</span
      >{:else if seg.emph}<span class="text-[13px] font-bold text-slate-200">{seg.text}</span
      >{:else}{seg.text}{/if}
    {/each}
  </p>
{/each}
```

(The `</span\n>` closing-tag line breaks avoid whitespace text nodes between segments — segments carry their own spacing.)

**Step 2: Battle.svelte — wire in the module**

- Delete the local `SPELL_META` (line 155), `unitLabel` (line ~370), and `describe` (lines ~377-426).
- Import: `import { describeEvent, SPELL_META } from './logLines';`
- Replace `const logLines = $derived(battle.log.map(describe));` with:

```ts
const logLines = $derived(battle.log.map(ev => describeEvent(ev, battle.units, battle.hero)));
```

(No `enemyHeroName` passed — boss battles thread it here later.)

- The status text at line ~435 keeps using `SPELL_META` via the new import.

**Step 3: Type-check and full suite**

Run: `npx svelte-check --threshold error && npm test`
Expected: clean / PASS. Pay attention to any other `describe(`/`SPELL_META` references svelte-check flags in Battle.svelte.

**Step 4: Commit**

```bash
git add src/lib/ui/GameLog.svelte src/lib/ui/Battle.svelte
git commit -m "feat: battle log renders controller colors, tiered damage, skull kills"
```

---

### Task 4: Bigger, controller-colored count badge (UnitToken.svelte)

**Files:**
- Modify: `src/lib/ui/UnitToken.svelte`

**Step 1: Swap the badge classes**

```svelte
<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import Sprite from './Sprite.svelte';
  import { controllerOf, CONTROLLER_STYLE } from './controllers';
  // …props unchanged…
</script>
```

Replace the count `<span>` (lines 23-29):

```svelte
<span
  class="absolute bottom-0 right-0 rounded-sm border px-1 font-mono font-bold leading-tight text-white
    {small ? 'text-[11px]' : 'text-[13px]'}
    {CONTROLLER_STYLE[controllerOf(unit)].badge}"
>
  {unit.count}
</span>
```

Size bump: 11→13px regular, 9→11px small. Behavior change to note: **summoned allies' badges turn emerald** (they were sky) — that's the point of controller coloring, and it now matches their log color.

**Step 2: Type-check + suite**

Run: `npx svelte-check --threshold error && npm test`
Expected: clean / PASS.

**Step 3: Commit**

```bash
git add src/lib/ui/UnitToken.svelte
git commit -m "feat: larger, controller-colored unit count badges"
```

---

### Task 5: Battlefield floaters — tiered damage + "-x 💀" (animSteps.ts + BattleFx.svelte)

**Files:**
- Modify: `src/lib/ui/animSteps.ts` (damage step gains `kills?: number`)
- Modify: `src/lib/ui/BattleFx.svelte`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Merge note:** if the projectiles plan already landed, the shoot case emits `projectile` + `delayed` damage — keep those and *add* `kills`; the expectations below show the pre-projectiles shape, adjust accordingly.

**Step 1: Write the failing test** — extend the attack-mapping test in `animSteps.test.ts`:

```ts
it('carries the kill count on the damage step', () => {
  const entry: BattleEvent = {
    type: 'attack',
    data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 3 },
  };

  const steps = stepsFromLogEntry(entry);

  expect(steps).toContainEqual({ unitId: 't1', kind: 'damage', value: 7, kills: 3 });
});

it('omits kills from the damage step when nothing died', () => {
  const entry: BattleEvent = {
    type: 'attack',
    data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 0 },
  };

  const steps = stepsFromLogEntry(entry);

  expect(steps).toContainEqual({ unitId: 't1', kind: 'damage', value: 7 });
});
```

Existing exact-equality tests for attack/retaliate/shoot/cast damage steps will need their expected objects updated (add `kills: N` where the entry's `killed` > 0; the current fixtures mostly use `killed: 0`, which stays shapeless).

**Step 2: Run — verify the new test fails**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — damage step has no `kills` field.

**Step 3: Implement in animSteps.ts**

Union change:

```ts
| { unitId: string; kind: 'damage'; value: number; kills?: number }
```

In `stepsFromLogEntry`, everywhere a damage step is built from an entry that has `killed` (attack, retaliate, shoot, cast-with-damage), thread it:

```ts
const dmgStep = (unitId: string, value: number, killed?: number): AnimStep =>
  killed && killed > 0 ? { unitId, kind: 'damage', value, kills: killed } : { unitId, kind: 'damage', value };
```

and use `dmgStep(targetId, damage, killed)` in those cases (destructure `killed` from `entry.data` alongside the existing fields).

**Step 4: Run — verify pass**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts && npm test`
Expected: PASS.

**Step 5: BattleFx.svelte — tiered size + skull line**

Import the shared tiers: `import { damageTier, type DamageTier } from './logLines';`

```ts
// Floater grows with the hit — same tiers as the log.
const DMG_SIZE: Record<DamageTier, string> = {
  0: 'fx-dmg-0',
  1: 'fx-dmg-1',
  2: 'fx-dmg-2',
  3: 'fx-dmg-3',
};
```

Replace the damage branch:

```svelte
{#if step.kind === 'damage'}
  <span class="fx-text fx-damage {DMG_SIZE[damageTier(step.value)]}">-{step.value}</span>
  {#if step.kills}
    <span class="fx-text fx-kills">-{step.kills} 💀</span>
  {/if}
```

CSS additions:

```css
.fx-dmg-0 { font-size: 1rem; }
.fx-dmg-1 { font-size: 1.25rem; }
.fx-dmg-2 { font-size: 1.5rem; }
.fx-dmg-3 { font-size: 1.9rem; }

/* Kill tally floats up beneath the damage number, on a slight lag so the
   two read as separate beats of the same hit. */
.fx-kills {
  top: 55%;
  color: #e2e8f0;
  font-size: 0.85rem;
  animation-delay: 150ms;
  animation-fill-mode: backwards;
}
```

(`.fx-kills` composes with `.fx-text`, which already sets position/float-up animation; `backwards` fill keeps it hidden during the delay. If the projectiles plan's `delayed` flag is also present, both delays must combine — set `animation-delay: calc(var(--flight-ms, 0ms) + 150ms)` in that world.)

**Step 6: Type-check + suite**

Run: `npx svelte-check --threshold error && npm test`
Expected: clean / PASS.

**Step 7: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts src/lib/ui/BattleFx.svelte
git commit -m "feat: tiered damage floaters with skull kill tallies"
```

---

### Task 6: End-to-end verification

**REQUIRED SUB-SKILL:** Use the `verify` skill (build, launch, and drive the battle UI).

Checklist:

1. **Log colors:** fight a battle — your stack names render sky-blue, enemy names red, every enemy stack reads "wild Wolfs"-style.
2. **Tiered damage in log:** small hits read at 13px; force a big hit (lightning at high level, or a large stack) — the number visibly steps up in size and is red. Kill lines show "-2 💀"; zero-kill hits show no skull segment and end cleanly at "damage." (no dangling space/period issues).
3. **Battlefield floaters:** the floating red number grows for larger hits; a killing blow floats "-x 💀" beneath the damage number on a slight lag; a no-kill hit floats only the damage.
4. **Ally color:** trigger an ally summon — allied names emerald in the log, emerald badge on the board.
5. **Hero lines:** hero attack/cast lines say "Your hero…" colored sky-blue; capitalization correct.
6. **Round headers:** sticky "Round N" headers still group correctly (regex is gone).
7. **Badges:** count plates noticeably larger, no overflow on small tokens (check TurnBar/ArmySetup if they use the small variant).
8. **Reduced motion:** floaters still fade in/out sanely with `prefers-reduced-motion` (the `.fx-kills` delay must not strand it invisible — `backwards` fill + the existing `fade-only` keyframes should compose; verify).

Fix anything found, re-run `npm test`, then commit fixes with explicit file paths (the working tree has unrelated uncommitted changes — never `git add -A`):

```bash
git add src/lib/ui/GameLog.svelte src/lib/ui/BattleFx.svelte src/lib/ui/logLines.ts
git commit -m "fix: battle log readability polish from e2e verification"   # only if fixes were needed
```

---

## Out of scope (deliberately)

- **Boss battles / enemy hero data model** — `describeEvent`'s `enemyHeroName` param and `Hero.name` are the seams; the boss-battle plan wires them.
- **Real multiplayer controller ids on UnitStack** — `controllerOf` is the single derivation point to replace when that lands.
- **BattleLog.svelte** — dead code (unused anywhere); deleting it belongs in a cleanup commit, not this feature.
- **Turn-bar / unit-info coloring** — trivial follow-up via `CONTROLLER_STYLE` if it reads well.
- **Damage-preview tooltip restyle** — the hover forecast (💀/💥) already uses skulls; leaving untouched.
