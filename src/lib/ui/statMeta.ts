import { attributeIconFor } from './attributeIcons';

// Icon + label + hover explanation per stat, kept in one place so the meaning
// of each icon is discoverable via title tooltip as well as its label, and so
// the battle sidebar (UnitInfo) and the compendium describe a stat identically.
export const STAT_META = {
  level: { icon: attributeIconFor('level'), title: 'Level', label: 'Level' },
  mana: { icon: attributeIconFor('mana'), title: 'Mana — spent casting spells', label: 'Mana' },
  xp: { icon: attributeIconFor('xp'), title: 'Experience points', label: 'Experience' },
  count: { icon: attributeIconFor('count'), title: 'Count — creatures remaining in this stack', label: 'Count' },
  hp: { icon: attributeIconFor('hp'), title: 'Hit points — current / max per creature', label: 'HP' },
  attack: { icon: attributeIconFor('attack'), title: 'Attack — raises damage dealt', label: 'Attack' },
  defense: { icon: attributeIconFor('defense'), title: 'Defense — reduces damage taken', label: 'Defense' },
  damage: { icon: attributeIconFor('damage'), title: 'Damage — min–max per hit', label: 'Damage' },
  speed: { icon: attributeIconFor('speed'), title: 'Speed — tiles moved per turn', label: 'Speed' },
  initiative: { icon: attributeIconFor('initiative'), title: 'Initiative — determines turn order', label: 'Initiative' },
  range: { icon: attributeIconFor('range'), title: 'Range — shooting distance', label: 'Range' },
  shots: { icon: attributeIconFor('shots'), title: 'Shots — ranged attacks left / max', label: 'Shots' },
  morale: { icon: attributeIconFor('morale'), title: 'Morale — chance to act again, or freeze if negative', label: 'Morale' },
  luck: { icon: attributeIconFor('luck'), title: 'Luck — chance to double damage, or halve it if negative', label: 'Luck' },
  cost: { icon: attributeIconFor('cost'), title: 'Cost — gold per creature when recruiting', label: 'Cost' },
} as const;

export type StatKey = keyof typeof STAT_META;
