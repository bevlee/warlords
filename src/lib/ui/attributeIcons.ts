// Icon files are named for the stat they show, with one rule: never give an
// asset a name a content blocker recognises. This was `count.png`, which
// EasyPrivacy-style lists match as a tracking pixel — privacy browsers blocked
// it and the whole eager glob failed to load, taking the route with it.
const icons = import.meta.glob('../assets/attributes/*.png', {
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

export type AttributeIconId =
  | 'attack'
  | 'cost'
  | 'units'
  | 'damage'
  | 'defense'
  | 'hp'
  | 'initiative'
  | 'level'
  | 'luck'
  | 'mana'
  | 'morale'
  | 'range'
  | 'shots'
  | 'speed'
  | 'xp';

/** Generated pixel-art icon URL for a game attribute. */
export function attributeIconFor(id: AttributeIconId): string {
  const icon = byId.get(id);
  if (!icon) throw new Error(`Missing attribute icon: ${id}`);
  return icon;
}
