const icons = import.meta.glob('../assets/items/*.png', {
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

/** Generated pixel-art icon URL for an artifact, or undefined for future items. */
export function itemIconFor(id: string): string | undefined {
  return byId.get(id);
}
