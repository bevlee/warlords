import { describe, it, expect } from 'vitest';
import { ITEMS, ITEM_IDS, itemBonuses, itemDraftOptions, itemEffectText, type ItemId } from '../items';
import { newRun } from '../run';

describe('item catalog', () => {
  it('every item has a name, a rarity, and at least one effect', () => {
    for (const id of ITEM_IDS) {
      const item = ITEMS[id];
      expect(item.id).toBe(id);
      expect(item.name.length).toBeGreaterThan(0);
      expect(['common', 'rare', 'epic']).toContain(item.rarity);
      expect(Object.keys(item.effects).length).toBeGreaterThan(0);
    }
  });

  it('item names are unique', () => {
    const names = ITEM_IDS.map(id => ITEMS[id].name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('itemEffectText', () => {
  it('renders signed stat effects in catalog order', () => {
    expect(itemEffectText(ITEMS.berserkers_brew)).toBe('+10 Atk · −4 Def');
    expect(itemEffectText(ITEMS.rabbits_foot)).toBe('+1 Luck');
  });
});

describe('itemBonuses', () => {
  it('returns all zeros for no items', () => {
    expect(itemBonuses([])).toEqual({
      attack: 0,
      defense: 0,
      initiative: 0,
      luck: 0,
      morale: 0,
    });
  });

  it('sums effects across items, including negatives', () => {
    // Blade of the Vanguard (+4 atk) + Berserker's Brew (+10 atk, −4 def)
    const b = itemBonuses(['blade_of_the_vanguard', 'berserkers_brew']);
    expect(b.attack).toBe(14);
    expect(b.defense).toBe(-4);
    expect(b.initiative).toBe(0);
  });
});

describe('itemDraftOptions', () => {
  it('offers 2 distinct unowned items, deterministic for the same run state', () => {
    const run = { ...newRun('barbarian', 42), battlesWon: 3 };
    const a = itemDraftOptions(run);
    const b = itemDraftOptions(run);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(new Set(a).size).toBe(2);
  });

  it('never offers an item the run already owns', () => {
    for (let seed = 0; seed < 200; seed++) {
      const owned: ItemId[] = ['blade_of_the_vanguard', 'aegis_charm', 'rabbits_foot'];
      const run = { ...newRun('knight', seed), battlesWon: 3, items: owned };
      for (const id of itemDraftOptions(run)) expect(owned).not.toContain(id);
    }
  });

  it('excludes items whose only positive stat is already capped', () => {
    // Banner (+1 morale) + Standard of Heroes (+2) = morale capped at +3;
    // Reckless Standard's only positive effect is morale, so it must not appear.
    const owned: ItemId[] = ['banner_of_courage', 'standard_of_heroes'];
    for (let seed = 0; seed < 300; seed++) {
      const run = { ...newRun('knight', seed), battlesWon: 3, items: owned };
      expect(itemDraftOptions(run)).not.toContain('reckless_standard');
    }
  });

  it('offers fewer (or zero) items when the pool runs dry', () => {
    const run = { ...newRun('wizard', 7), battlesWon: 9, items: [...ITEM_IDS] };
    expect(itemDraftOptions(run)).toEqual([]);
  });

  it('weights rarities roughly common > rare > epic', () => {
    const counts = { common: 0, rare: 0, epic: 0 };
    for (let seed = 0; seed < 600; seed++) {
      const run = { ...newRun('demon', seed), battlesWon: 3 };
      for (const id of itemDraftOptions(run)) counts[ITEMS[id].rarity]++;
    }
    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.epic);
    expect(counts.epic).toBeGreaterThan(0);
  });
});
