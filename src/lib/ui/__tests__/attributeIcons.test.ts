import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';

const DIR = new URL('../../assets/attributes/', import.meta.url).pathname;

/**
 * Asset names are player-facing in a way that is easy to forget: the browser
 * asks for them by name, and a content blocker gets to veto the request. An
 * icon called `count.png` was matched as a tracking pixel by the blocklists
 * privacy browsers ship, so the eager glob in attributeIcons.ts failed and
 * took the whole route down with it — only in those browsers, which is what
 * made it so slippery to pin down.
 */
const BLOCKER_BAIT = /^(count|track|tracker|pixel|beacon|analytics|stat|stats|ad|ads|banner|hit|click|impression|log)\.(png|gif|jpg|svg|webp)$/i;

describe('attribute icon assets', () => {
  const files = readdirSync(DIR).filter(name => name.endsWith('.png'));

  it('ships the icons', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('gives no asset a name a content blocker would eat', () => {
    const risky = files.filter(name => BLOCKER_BAIT.test(name));
    expect(risky, `rename these — blocklists match them as trackers: ${risky.join(', ')}`).toEqual([]);
  });
});
