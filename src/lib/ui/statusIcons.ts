const icons = import.meta.glob('../assets/statuses/*.png', {
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

export type StatusIconId =
  | 'bad_luck'
  | 'bind'
  | 'blind'
  | 'bloodlust'
  | 'burn'
  | 'defending'
  | 'gating'
  | 'good_luck'
  | 'life_drain'
  | 'morale_boost'
  | 'morale_drain'
  | 'morale_freeze'
  | 'slow'
  | 'stoneskin';

/** Generated pixel-art icon URL for a combat buff or status. */
export function statusIconFor(id: StatusIconId): string {
  const icon = byId.get(id);
  if (!icon) throw new Error(`Missing status icon: ${id}`);
  return icon;
}
