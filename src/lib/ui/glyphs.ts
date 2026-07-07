export const GLYPHS: Record<string, string> = {
  Goblin: '👺',
  'Wolf Rider': '🐺',
  Orc: '🪓',
  Ogre: '👹',
  Cyclops: '👁️',
  Thunderbird: '🦅',
  Behemoth: '🦍',
  Hero: '👑',
};

export function glyphFor(name: string): string {
  return GLYPHS[name] ?? '❓';
}
