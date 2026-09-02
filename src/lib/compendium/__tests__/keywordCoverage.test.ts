import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The leak guard.
 *
 * Markup only stays invisible while every place that renders a description
 * either passes it through KeywordText or flattens it with stripKeywords. Miss
 * one and a player sees `[[banner_of_the_first_raid|empowered]]` on screen —
 * which no unit test of the parser would ever catch.
 *
 * So: read the components themselves and fail on a description interpolated
 * raw. Crude, but it fails loudly the moment someone adds a sixteenth render
 * site and forgets, which is exactly when it is needed.
 */

const SRC = new URL('../../../', import.meta.url).pathname;

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

/**
 * `{...description}` or `{...effect}` rendered as content.
 *
 * An attribute — `desc={season.description}` — is passing text to a component
 * that renders it, so it is not a leak; the component it hands off to is
 * checked on its own. Only a bare interpolation puts text on screen, so the
 * pattern rejects a match preceded by `=`.
 */
const RAW_TEXT = /(^|[^=])\{[^{}]*\b(description|effect|itemEffectText\([^)]*\))\s*\}/g;

/** The same expression, but handed to something that copes with markup. */
const SAFE = /(KeywordText|stripKeywords)/;

// Components that legitimately show raw description text: the debug drawer is
// developer-facing, and these keep their own rendering.
const EXEMPT = ['BattleDebugDrawer.svelte'];

describe('no render site leaks keyword markup', () => {
  const files = svelteFiles(SRC).filter((path) => !EXEMPT.some((name) => path.endsWith(name)));

  it('finds the components to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never interpolates a description without KeywordText or stripKeywords', () => {
    const leaks: string[] = [];
    for (const path of files) {
      // Only the template can leak markup to the screen; a `description` field
      // inside <script> is data being passed along, not text being rendered.
      const source = readFileSync(path, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
      for (const line of source.split('\n')) {
        for (const match of line.matchAll(RAW_TEXT)) {
          if (SAFE.test(line)) continue;
          leaks.push(`${path.replace(SRC, '')}: ${match[0].trim()}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
