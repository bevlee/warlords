// Icon + label + hover explanation per stat, kept in one place so the meaning
// of each glyph is discoverable via title tooltip as well as its label, and so
// the battle sidebar (UnitInfo) and the compendium describe a stat identically.
export const STAT_META = {
  level: { icon: '⭐', title: 'Level', label: 'Level' },
  mana: { icon: '🔷', title: 'Mana — spent casting spells', label: 'Mana' },
  xp: { icon: '✨', title: 'Experience points', label: 'Experience' },
  count: { icon: '👥', title: 'Count — creatures remaining in this stack', label: 'Count' },
  hp: { icon: '💚', title: 'Hit points — current / max per creature', label: 'HP' },
  attack: { icon: '⚔️', title: 'Attack — raises damage dealt', label: 'Attack' },
  defense: { icon: '🛡️', title: 'Defense — reduces damage taken', label: 'Defense' },
  damage: { icon: '💥', title: 'Damage — min–max per hit', label: 'Damage' },
  speed: { icon: '🥾', title: 'Speed — tiles moved per turn', label: 'Speed' },
  initiative: { icon: '⚡', title: 'Initiative — determines turn order', label: 'Initiative' },
  range: { icon: '🎯', title: 'Range — shooting distance', label: 'Range' },
  shots: { icon: '🏹', title: 'Shots — ranged attacks left / max', label: 'Shots' },
  morale: { icon: '🎺', title: 'Morale — chance to act again, or freeze if negative', label: 'Morale' },
  luck: { icon: '🍀', title: 'Luck — chance to double damage, or halve it if negative', label: 'Luck' },
  cost: { icon: '🪙', title: 'Cost — gold per creature when recruiting', label: 'Cost' },
} as const;

export type StatKey = keyof typeof STAT_META;
