# Main Mode Review Fixes — Plan

Two findings from the review of `claude/main-mode-fixes-dn3lfe` (merged as
`f1f1165`), neither blocking, both worth closing:

## 1. Gold-credit-on-win path has no automated test

The credit logic lives inline in `+page.svelte`'s `handleResult` — page-level
Svelte, so it escaped the unit-test net. Fix by extraction, not by component
testing (repo convention):

- Add to `engine/progression.ts`:

```ts
/** Victory rewards in one step: XP (with level-ups) plus gold credited to the
 *  campaign wallet. Free-play passes goldReward 0 — XP only. */
export function applyVictory(hero: Hero, xp: number, goldReward: number): { hero: Hero; levels: number } {
  const { hero: next, levels } = applyXp(hero, xp);
  return { hero: { ...next, gold: (hero.gold ?? 0) + goldReward }, levels };
}
```

- `+page.svelte` `handleResult` calls it in place of the manual
  `applyXp` + gold arithmetic (bonusSkeletons/updateFactionSkills wrap stays
  in the page).
- TDD in `progression.test.ts`: campaign win credits gold on top of XP
  level-ups; `goldReward 0` leaves gold untouched; missing `gold` field
  defaults to 0.

## 2. Cramped gold breakdown in the setup header

`🪙 250 / 480 gold · incl. 180 won` runs the label together. Replace the
suffix with a spaced, parenthesized form plus a hover breakdown:

- Text: `🪙 {goldLeft} / {budget} gold (+{hero.gold} won)` — only when
  `hero.gold > 0`.
- `title` on the span: `"{level budget} level budget + {gold} gold won"`.

Verified by screenshot (setup screen with a gold-bearing hero injected into
the `warlords` IDB `hero` key).
