// Icon lookup for unit skills. Drop a PNG named after the skill id into
// src/lib/assets/skills/ (e.g. double_strike.png) and it is picked up here —
// same pattern as the unit spritesheets in sprites.ts. Until art exists,
// consumers fall back to the glyph.

const icons = import.meta.glob('../assets/skills/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId = new Map(
  Object.entries(icons).map(([file, url]) => [
    file.slice(file.lastIndexOf('/') + 1).replace(/\.png$/, ''),
    url,
  ])
);

/** PNG url for a skill id, or undefined to fall back to the glyph. */
export function skillIconFor(id: string): string | undefined {
  return byId.get(id);
}

/** Emoji fallback shown until real art lands in assets/skills/. */
export const SKILL_GLYPH: Record<string, string> = {
  life_drain: '🩸',
  double_strike: '⚔️',
  no_retaliation: '🛡️',
  fleet_footwork: '🥾',
  bravery: '🎺',
};

export function skillGlyph(id: string): string {
  return SKILL_GLYPH[id] ?? '✦';
}
