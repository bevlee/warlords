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
  | 'count'
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
