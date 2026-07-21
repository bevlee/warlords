// Spritesheet lookup for unit standees. Sheets live in src/lib/assets/units/
// as <slug>.png — 4 frames per row, one row per pose.

export const POSES = ['idle', 'attack', 'hit', 'death'] as const;
export type Pose = (typeof POSES)[number];

/** Row index of each pose within a sheet. Idle first: static consumers get it for free. */
export const POSE_ROW: Record<Pose, number> = { idle: 0, attack: 1, hit: 2, death: 3 };

/** Frames per pose row. */
export const FRAMES = 4;

const sheets = import.meta.glob('../assets/units/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function unitSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

const bySlug = new Map(
  Object.entries(sheets).map(([file, url]) => [
    file.slice(file.lastIndexOf('/') + 1).replace(/\.png$/, ''),
    url,
  ]),
);

/** Sheet URL for a unit name, or undefined to fall back to the vector standee. */
export function sheetFor(name: string): string | undefined {
  return bySlug.get(unitSlug(name));
}
