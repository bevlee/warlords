# Hero Profile & Playstyles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A dedicated hero profile UI (level, XP, stats, faction skills, artifacts, taught unit skills) with switchable playstyles — Offense, Magic, Ranged — that meaningfully modify battles.

**Architecture:** Playstyles are entries in a data registry (`PLAYSTYLES`) whose effects flow through **one composition point** — a new `collectBattleModifiers()` that merges artifact bonuses + playstyle bonuses into the existing `armyBonuses`/hero seams `initBattle` already consumes. The profile is a modal component (`HeroProfile.svelte`) composed of small reusable panels, opened from the gauntlet map (and reusable by the main game later). `Hero.playstyle` is an optional persisted field; switching is allowed anywhere outside battle.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest.

---

## Designing for future features (the architectural spine)

Three rules this plan institutionalizes — follow them and later features
(difficulty modifiers, blessings/curses, prestige perks, more playstyles)
become data + one registry entry each:

1. **Registries over branches.** Playstyles, artifacts, unit skills, abilities
   are records keyed by id with the UI iterating the registry — adding a
   playstyle is a new `PLAYSTYLES` entry; no component edits.
2. **One modifier pipeline.** Anything that buffs a battle contributes through
   `collectBattleModifiers({ hero, items })` → `{ hero', armyBonuses, extraShots }`.
   `initBattle` keeps its existing signature; new sources (a future
   "blessing" system, endless-depth scaling) plug into the collector, not
   into initBattle or the pages.
3. **Optional, defaulted persistence.** Every new `Hero`/`RunState` field is
   optional with a load-time default (the established `saved.x ?? default`
   pattern) — saves never break, and features ship without migrations.

## Playstyle definitions (launch set)

| id | Name | Battle effect |
|---|---|---|
| `offense` | ⚔️ Offense | +3 army attack, +1 army morale |
| `magic` | ✨ Magic | +6 max mana, +25% spell damage |
| `ranged` | 🏹 Ranged | +2 shots and +1 range for shooter stacks, +2 army luck… capped by the ±3 clamp — use +1 luck |

(No playstyle selected = balanced/no modifier — the current game.)

---

### Task 1: Playstyle registry + modifier collector

**Files:**
- Create: `src/lib/engine/playstyles.ts`
- Modify: `src/lib/engine/types.ts` (`Hero.playstyle?: PlaystyleId`)
- Test: `src/lib/engine/__tests__/playstyles.test.ts`

**Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { PLAYSTYLES, PLAYSTYLE_IDS, collectBattleModifiers, emptyBonuses } from '../playstyles';
import type { ArmyBonuses, Hero } from '../types';

const HERO: Hero = { class: 'wizard', level: 4, xp: 0, attack: 3, defense: 2, statPoints: 0, factionSkills: [] };

describe('registry', () => {
  it('has offense/magic/ranged with names, glyphs, and blurbs', () => {
    expect(new Set(PLAYSTYLE_IDS)).toEqual(new Set(['offense', 'magic', 'ranged']));
    for (const id of PLAYSTYLE_IDS) {
      expect(PLAYSTYLES[id].name).toBeTruthy();
      expect(PLAYSTYLES[id].description).toBeTruthy();
    }
  });
});

describe('collectBattleModifiers', () => {
  const items: ArmyBonuses = { attack: 4, defense: 8, initiative: 1, luck: 0, morale: 0 };

  it('no playstyle: item bonuses pass through, hero untouched', () => {
    const m = collectBattleModifiers({ hero: HERO, itemBonuses: items });
    expect(m.armyBonuses).toEqual(items);
    expect(m.hero).toEqual(HERO);
    expect(m.extraShots).toBe(0);
  });

  it('offense adds army attack and morale on top of items', () => {
    const m = collectBattleModifiers({ hero: { ...HERO, playstyle: 'offense' }, itemBonuses: items });
    expect(m.armyBonuses.attack).toBe(4 + 3);
    expect(m.armyBonuses.morale).toBe(1);
  });

  it('magic raises mana and spell power', () => {
    const m = collectBattleModifiers({ hero: { ...HERO, playstyle: 'magic' }, itemBonuses: emptyBonuses() });
    expect(m.hero.mana).toBeUndefined(); // mana bonus is additive at initBattle
    expect(m.manaBonus).toBe(6);
    expect(m.spellPowerMult).toBeCloseTo(1.25);
  });

  it('ranged grants extra shots, range, and luck', () => {
    const m = collectBattleModifiers({ hero: { ...HERO, playstyle: 'ranged' }, itemBonuses: emptyBonuses() });
    expect(m.extraShots).toBe(2);
    expect(m.extraRange).toBe(1);
    expect(m.armyBonuses.luck).toBe(1);
  });
});
```

**Step 2: Verify fail. Step 3: Implement**

```ts
import type { ArmyBonuses, Hero } from './types';

export type PlaystyleId = 'offense' | 'magic' | 'ranged';

export interface PlaystyleDef {
  id: PlaystyleId;
  name: string;
  glyph: string;
  description: string;
  /** Declarative modifiers; every field optional so future styles mix freely. */
  armyBonuses?: Partial<ArmyBonuses>;
  manaBonus?: number;
  spellPowerMult?: number;
  extraShots?: number;
  extraRange?: number;
}

export const PLAYSTYLES: Record<PlaystyleId, PlaystyleDef> = {
  offense: { id: 'offense', name: 'Offense', glyph: '⚔️', description: '+3 attack and +1 morale for your whole army.', armyBonuses: { attack: 3, morale: 1 } },
  magic:   { id: 'magic', name: 'Magic', glyph: '✨', description: '+6 max mana and +25% spell damage.', manaBonus: 6, spellPowerMult: 1.25 },
  ranged:  { id: 'ranged', name: 'Ranged', glyph: '🏹', description: 'Shooters gain +2 shots and +1 range; +1 army luck.', extraShots: 2, extraRange: 1, armyBonuses: { luck: 1 } },
};

export const PLAYSTYLE_IDS = Object.keys(PLAYSTYLES) as PlaystyleId[];

export const emptyBonuses = (): ArmyBonuses => ({ attack: 0, defense: 0, initiative: 0, luck: 0, morale: 0 });

export interface BattleModifiers {
  hero: Hero;
  armyBonuses: ArmyBonuses;
  manaBonus: number;
  spellPowerMult: number;
  extraShots: number;
  extraRange: number;
}

/** THE composition point for battle-affecting bonuses. Items, playstyle —
 *  and any future source (blessings, difficulty, prestige) — merge here so
 *  initBattle and the pages never grow per-feature parameters. */
export function collectBattleModifiers(input: { hero: Hero; itemBonuses: ArmyBonuses }): BattleModifiers {
  const style = input.hero.playstyle ? PLAYSTYLES[input.hero.playstyle] : undefined;
  const sb = style?.armyBonuses ?? {};
  const armyBonuses: ArmyBonuses = {
    attack: input.itemBonuses.attack + (sb.attack ?? 0),
    defense: input.itemBonuses.defense + (sb.defense ?? 0),
    initiative: input.itemBonuses.initiative + (sb.initiative ?? 0),
    luck: input.itemBonuses.luck + (sb.luck ?? 0),
    morale: input.itemBonuses.morale + (sb.morale ?? 0),
  };
  return {
    hero: input.hero,
    armyBonuses,
    manaBonus: style?.manaBonus ?? 0,
    spellPowerMult: style?.spellPowerMult ?? 1,
    extraShots: style?.extraShots ?? 0,
    extraRange: style?.extraRange ?? 0,
  };
}
```

`types.ts`: add `playstyle?: PlaystyleId` to `Hero` (type-only import cycle is
fine; or declare the union in types.ts and have playstyles.ts import it —
prefer the latter to keep types.ts dependency-free).

**Step 4: Verify pass + full suite. Step 5: Commit** —
`feat: playstyle registry and battle-modifier collector`

---

### Task 2: Engine consumption — mana, spell power, shots, range

**Files:**
- Modify: `src/lib/engine/battle.ts` (`initBattle` gains optional
  `modifiers?: { manaBonus?: number; extraShots?: number; extraRange?: number }`
  folded in where mana/`shotsLeft` are set; spell damage call sites multiply
  by `spellPowerMult` — thread via `BattleState` the way sorcery already
  works, or fold into the hero's existing sorcery multiplier seam:
  **decision: store `spellPowerMult` on `BattleState` (optional, default 1)**
  and multiply in the two lightning-damage call sites beside
  `getSorceryMultiplier`)
- Test: `src/lib/engine/__tests__/playstyles.test.ts` (extend)

TDD each: mana = maxMana + manaBonus at init; shooter stacks get
`shotsLeft + extraShots` and `range + extraRange` (definition-merged like
fleet speed — per-stack `shotsLeft` for shots, and range via a merged def so
selectors read it naturally); lightning damage ×1.25 under magic. Non-shooters
unaffected by extraShots. Legacy calls (no modifiers) byte-identical.

Commit — `feat: initBattle consumes playstyle modifiers`

---

### Task 3: Wire the pages through the collector

**Files:**
- Modify: `src/lib/ui/Battle.svelte` (accept optional `modifiers` prop and
  pass through both `initBattle` call sites)
- Modify: `src/routes/gauntlet/+page.svelte` (compute once:
  `collectBattleModifiers({ hero: debugAdjustedHero, itemBonuses: itemBonuses(run.items) })`
  and pass `armyBonuses`/`modifiers` from it — replaces the direct
  `itemBonuses(...)` prop)
- Modify: `src/routes/+page.svelte` (main game: same collector with
  `emptyBonuses()` items so playstyles work there too)

`npm run check && npm test` clean. Commit — `feat: battles flow through collectBattleModifiers`

---

### Task 4: HeroProfile.svelte

**Files:**
- Create: `src/lib/ui/HeroProfile.svelte`
- Modify: `src/routes/gauntlet/+page.svelte` (a "🛡 Hero" button in the map
  sidebar opens it; hidden during battle), `src/routes/+page.svelte` (same
  button on the army-setup screen)

Modal overlay (role=dialog, Esc/backdrop closes — follow SpellBook's dialog
conventions), sections as small components inside the file:

1. **Identity**: class glyph + `hero.name ?? FACTION_INFO[class].name`,
   level, XP bar (`xpToReach` from progression.ts), attack/defense/mana
   (playstyle-adjusted values shown with a green `(+N)` delta like UnitInfo
   buffs).
2. **Faction skills**: existing name/level rows (reuse the sidebar markup).
3. **Artifacts**: `ItemIcon` + name + `itemEffectText` rows (empty state text
   when none). Gauntlet-only section — rendered from an optional `items` prop
   so the main game omits it.
4. **Taught unit skills**: per-unit rows with the violet skill tags (optional
   `unitSkills` prop).
5. **Playstyle switcher**: three cards from `PLAYSTYLE_IDS` (glyph, name,
   description) + a "Balanced" none-card; selected card ringed; clicking
   calls `onplaystyle(id | undefined)` — the page mutates
   `run.hero.playstyle` (or main-game hero) and saves. The switcher is the
   registry iteration — a 4th playstyle appears with zero UI edits.

Verified in Task 5 (no unit tests — Svelte).
Commit — `feat: hero profile modal with playstyle switcher`

---

### Task 5: End-to-end verification

**REQUIRED SUB-SKILL:** `verify` skill. Battles open in deploy — click
`Begin battle ⚔️` first.

1. Profile opens from the gauntlet map: level/XP/stats correct; artifacts and
   taught skills listed; screenshot.
2. Switch to Offense → stats section shows the +3 delta; in the next battle a
   unit's UnitInfo attack includes it (hero-attack fold-in + army bonus both
   visible); enemy stacks unaffected.
3. Magic: mana reads `maxMana + 6` in battle; lightning hits ×1.25 vs a
   control battle (same seed, no playstyle).
4. Ranged: a shooter shows `shots +2` and reaches one cell farther (no
   long-shot penalty at old max range); a melee unit is unchanged.
5. Playstyle persists across reload; a save without the field loads as
   Balanced.
6. Switcher hidden/disabled while a battle is in progress.

---

## Out of scope

- Playstyle-specific artifacts/skills synergies (the collector is where
  they'd land).
- Respec costs or per-battle switching restrictions beyond "not in battle".
- Hero naming UI (`Hero.name` is already the seam; a rename input in the
  profile header is a trivial follow-up).
- Main-game persistence of playstyle beyond the existing `saveHero` blob (it
  serializes the whole hero, so it comes for free — verify, don't build).
