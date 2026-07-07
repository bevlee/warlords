# Roguelite Draft Mode — Design Document

**Game:** Warlords (SvelteKit + TypeScript, offline PWA, 12×10 grid combat)
**Mode name (working title):** *Gauntlet*
**Status:** Design — ready for implementation
**Target run length:** 20–35 minutes

---

## 1. Core loop

### 1.1 Run flow

```
Main Menu
  └─> Gauntlet Setup
        ├─ Pick faction (1 of 6)
        ├─ Curse revealed (1 random curse applied to the whole run)
        └─ Starting army shown (T1 + T2 units, small counts)
  └─> Run Map (vertical 10-node track, 3 acts)
        └─> Encounter n (battle on the existing 12×10 board)
              ├─ WIN  → Draft screen: 3 cards, pick 1 → next node
              │         (after a boss: also pick 1 of 2 Blessings)
              └─ LOSE → Run Summary (defeat) → run deleted, stats recorded
  └─> Encounter 10 (Act 3 boss) won → Run Summary (victory)
```

### 1.2 Structure

- **10 encounters**, split into **3 acts**:
  - **Act I — The Borderlands:** encounters 1–3 (boss at node 3)
  - **Act II — The Deep Wilds:** encounters 4–7 (boss at node 7)
  - **Act III — The Black Citadel:** encounters 8–10 (boss at node 10)
- **9 draft picks** per full run (one after every victory except the final boss) plus **3 blessing picks** (one after each act boss, including the final one — the last blessing is cosmetic/score only).
- **No gold, no shop, no healing between fights by default.** Losses persist between battles. Attrition is the core tension — talents like *Field Medic* and Necromancer's *Bone Harvest* exist specifically to fight it.

### 1.3 What the player sees at each stage

| Stage | Screen | Contents |
|---|---|---|
| Setup | `RunSetupScreen` | Faction cards, curse reveal with flavor text, starting army preview, "Begin Run" button |
| Between fights | `RunMap` | Vertical node track with act dividers, current node highlighted, boss nodes marked with a skull, next enemy's faction + approximate strength shown on hover |
| Battle | Existing battle screen | Unchanged, plus a small curse icon in the corner and the hero ability bar (new) |
| Post-victory | `DraftScreen` | 3 cards face-up, army sidebar, reroll button if available, pick confirms immediately |
| Run end | `RunSummary` | Victory/defeat banner, full draft history as a card strip, battles won, damage dealt, favorite stack, score |

### 1.4 Pacing math (hits the 20–35 min target)

- Battles 1–3: small armies, ~1.5–2 min each ≈ 6 min
- Battles 4–7: mid armies, ~2.5–3 min each ≈ 11 min
- Battles 8–10: large armies + boss mechanics, ~3.5–4 min each ≈ 11 min
- 9 drafts × ~30–45 s ≈ 6 min
- **Total: ~28–34 min** for a full run

### 1.5 Starting state

- **Hero:** level 1, faction skills at 0, mana 8, knows Lightning + one faction-flavored starter spell.
- **Army:** the faction's Tier-1 and Tier-2 units at fixed starting counts, tuned to ~90 power total.
- **Hero levels up between fights, not from combat XP:** hero gains exactly 1 level per victory (levels 1→10 across the run).

---

## 2. Card types

### 2.1 Unit cards

**What a unit card gives you:** a fixed count of one unit type, tier-gated by act.

| Act | Tiers offered | Count formula (per card) | Example |
|---|---|---|---|
| I | T1–T3 | `round(60 / tierPower(t))` | "16 Goblins", "6 Wolf Riders" |
| II | T2–T5 | `round(110 / tierPower(t))` | "9 Ogres", "3 T5s" |
| III | T4–T7 | `round(170 / tierPower(t))` | "2 Behemoths", "1 Titan" |

**Rules:**
- Unit cards are drawn from **your faction's roster** by default. **Mercenary cards** (epic rarity only) offer an off-faction unit at 75% count.
- **Duplicates stack counts.** Picking "16 Goblins" when you already have Goblins adds 16 to the existing stack.
- **Elite upgrade at 3 copies:** the third time you pick the *same unit type*, the whole stack upgrades to an **Elite variant**: +15% attack/defense/HP, +1 speed, and one bonus keyword from a fixed per-unit table. Data-wise this is an `elite: boolean` flag plus a static `ELITE_BONUSES` table.
- **7-slot cap:** unit cards for new types stop appearing when at 7 stacks unless a stack is below 25% of its peak count.

### 2.2 Talent cards (passive hero upgrades)

#### Faction-agnostic talents (17)

| # | Name | Rarity | Effect | Tags |
|---|---|---|---|---|
| 1 | **Drillmaster** | common | Future unit cards grant +25% count | economy |
| 2 | **Ironclad** | common | All your units +2 defense | defense |
| 3 | **Bloodthirst** | common | All your units +2 attack | offense |
| 4 | **Fleet Commander** | common | All your units +1 speed | speed |
| 5 | **Quartermaster** | common | Ranged units +3 ammo | ranged |
| 6 | **Sharpshooter** | rare | Ranged units ignore melee-adjacency penalty | ranged |
| 7 | **Sky Marshal** | rare | Flying units +20% damage and +1 speed | flying |
| 8 | **Standard Bearer** | common | +1 morale to all your units | morale |
| 9 | **Lucky Coin** | common | +1 luck to all your units | luck |
| 10 | **Battle Meditation** | common | +8 max mana; regenerate 1 mana per round | magic |
| 11 | **Archmage's Focus** | rare | All spells cost −2 mana (minimum 2) | magic |
| 12 | **Overwhelm** | rare | When your stack destroys an enemy, your whole army gains +1 morale | morale, offense |
| 13 | **First Blood** | common | Each stack deals +25% damage on its first attack each battle | offense, speed |
| 14 | **Shieldwall** | rare | Stacks that use Defend take −20% damage | defense |
| 15 | **Field Medic** | epic | After each victory, resurrect 20% of units you lost (per stack) | economy, defense |
| 16 | **Grudge** | rare | When your stack is destroyed, all survivors gain +3 attack for the battle | offense |
| 17 | **Hoarder's Instinct** | epic | All future drafts offer 4 cards instead of 3 | economy |

#### Faction-specific talents (3 per faction)

**Barbarian**
| Name | Rarity | Effect |
|---|---|---|
| **Blood Rage** | rare | Stacks below 50% starting count gain +6 attack |
| **Horde Tactics** | common | Unit cards for T1–T3 grant +50% count |
| **Skullcrusher** | epic | Melee attacks reduce target defense by 2 (stacking) |

**Knight**
| Name | Rarity | Effect |
|---|---|---|
| **Banner of the Crown** | common | +1 morale; morale triggers also grant +3 attack for that action |
| **Holy Charge** | epic | Jousting damage bonus is doubled |
| **Shield Brothers** | rare | Stacks gain +3 defense while adjacent to a friendly stack |

**Wizard**
| Name | Rarity | Effect |
|---|---|---|
| **Overcharge** | rare | Damage spells deal +40% damage |
| **Mini-Artifacts** | epic | Every stack: +2 attack, +2 defense, +10% HP |
| **Twin Cast** | rare | The first spell each battle resolves twice |

**Necromancer**
| Name | Rarity | Effect |
|---|---|---|
| **Bone Harvest** | epic | After each victory, add enemy losses to your Skeleton stack |
| **Dark Ritual** | common | Regain 3 mana whenever any stack is destroyed |
| **Chill of the Grave** | rare | Adjacent enemy stacks suffer −1 speed and −2 initiative |

**Ranger (Elf)**
| Name | Rarity | Effect |
|---|---|---|
| **Favored Enemy** | common | The strongest enemy stack is Marked: your units deal +25% damage to it |
| **Volley** | epic | Once per battle, each ranged stack may shoot twice in a single turn |
| **Nature's Grace** | rare | Stacks that took no damage last round heal 10% HP at turn start |

**Demon**
| Name | Rarity | Effect |
|---|---|---|
| **Hellfire** | rare | Burn/DoT effects deal double damage; when a burning stack dies, burn jumps to an adjacent enemy |
| **Gatekeeper** | epic | At battle start, your largest stack gates in a copy at 30% count |
| **Torment** | common | Enemy stacks affected by DoT deal −20% damage |

### 2.3 Spell cards (new spells)

| Spell | Mana | Rarity | Effect | Tags |
|---|---|---|---|---|
| **Fireball** | 7 | common | `20 + 6×heroLevel` damage to target tile + half to 8 surrounding tiles; direct hit burns for 2 rounds | magic, aoe |
| **Frostbite** | 5 | common | `12 + 4×heroLevel` damage + −2 speed, −3 initiative for 2 rounds | magic, control |
| **Haste** | 4 | common | Friendly stack: +2 speed, +3 initiative for 3 rounds | speed |
| **Slow** | 4 | common | Enemy stack: −2 speed, −3 initiative for 3 rounds | control |
| **Weakness** | 4 | common | Enemy stack: −4 attack for 3 rounds | control, defense |
| **Arcane Shield** | 5 | rare | Friendly stack absorbs `30 + 10×heroLevel` damage | defense, magic |
| **Chain Lightning** | 9 | rare | `25 + 7×heroLevel` true damage; jumps to 2 nearest enemies at 60%/36% | magic, aoe |
| **Teleport** | 6 | rare | Move a friendly stack to any free tile within 6 tiles | speed, flying |
| **Summon Elementals** | 8 | epic | Summon `2 + heroLevel` Fire Elementals (T3-equivalent, burn-immune) | magic, economy |
| **Resurrection** | 10 | epic | Restore `40 + 15×heroLevel` HP to a stack, reviving dead units; persists after battle | defense, economy, magic |

### 2.4 Hero ability cards (active, no mana, cooldown-based)

| Ability | Cooldown | Rarity | Effect |
|---|---|---|---|
| **Rally** | once/battle | common | Remove all debuffs from your stacks; +1 morale this round |
| **Hero Strike** | 3 rounds | common | Hero attacks enemy for `10 + 5×heroLevel + 3×heroAttack` damage (no retaliation) |
| **War Horn** | 4 rounds | rare | One friendly stack that already acted immediately acts again |
| **Intimidate** | 3 rounds | common | Enemy stack: −4 attack, −4 defense for 2 rounds |
| **Tactical Redeploy** | once/battle | rare | Swap two friendly stacks, or move one up to 3 tiles without consuming its turn |
| **Last Stand** | once/battle | epic | For one round, your stacks cannot drop below 1 living unit |

---

## 3. Card pool and weighting

### 3.1 Draft composition guarantee

- **Slot 1:** always a **unit card**
- **Slot 2:** unit OR talent (50/50)
- **Slot 3:** talent 35%, spell 30%, ability 20%, unit 15%

No duplicate cards within one draft.

### 3.2 Rarity

**Common 62% / Rare 30% / Epic 8%.**

- **Epic pity timer:** if no epic has been *offered* in the last 3 drafts, slot 3 is forced epic.
- Act II shift: 55/33/12. Act III: 45/38/17.

### 3.3 Synergy weighting

Every card carries `tags`. The run tracks a **tag affinity score** (+1 per tag on every card picked + tags implied by the current army). A card's draw weight is multiplied by `1 + 0.35 × min(affinity, 4)` — up to **2.4×** for a heavily invested axis, capped to prevent tunneling.

### 3.4 Faction bias

- Faction-specific talents only appear for that faction (15 in the pool).
- Unit cards: 90% own-faction, 10% chance epic slot rolls a mercenary off-faction unit.
- Faction talents get 1.5× base weight.

### 3.5 Determinism

All draws from **seeded mulberry32 PRNG** (`seed` in `RunState`).

---

## 4. Encounter design

### 4.1 Power budget curve

```
budget(n) = 90 × 1.32^(n-1)
→ n:  1    2    3(B)  4    5    6    7(B)  8    9    10(B)
     90   119   172  207  273  360   518  629  830  1195
```

### 4.2 Enemy hero scaling by encounter

| Encounters | Enemy gets |
|---|---|
| 1–2 | No spells, no hero |
| 3–4 | 1 spell (Stoneskin or Bloodlust) |
| 5–6 | 2 spells incl. damage spell; +1 morale army-wide |
| 7–8 | 3 spells; one Elite stack |
| 9–10 | Full spell kit incl. control spell; two Elite stacks; +1 luck |

### 4.3 Board variety

Encounters 4+ roll one terrain layout: open field / center wall / two corridors / scattered rocks. Reuses the existing obstacle system.

---

## 5. Boss encounters

### Boss 1 — node 3: **Sir Aldric, the Unbreakable** (Knight)

- **Army:** large Peasant wall + 2 crossbow stacks + 1 cavalry stack
- **Mechanic — Fortress Protocol:** his back two columns give −30% ranged damage taken and +2 defense. His cavalry opens with a jousting charge.
- **Lesson:** teaches the value of speed/flying/ranged axes before Act II.

### Boss 2 — node 7: **Vex the Carrion Queen** (Necromancer)

- **Army:** 3 Skeleton/Zombie stacks + 1 Vampire stack + 1 Bone Dragon
- **Mechanic — Endless Dead:** at start of each enemy round, resurrects 12% of total units lost (stops for units killed while burning — burn kills are exempt).
- **Lesson:** kill stacks fast; DoT/burst builds shine; Vampire life_drain is doubled — priority puzzle.

### Boss 3 — node 10: **Mardax, Warden of the Black Citadel** (Demon)

- **Army:** 2 Devil stacks (teleport) + 1 huge mid-tier melee + 2 Imp chaff
- **Mechanic 1 — Gating:** on rounds 1 and 3, every demon stack gates in a 25% copy.
- **Mechanic 2 — Infernal Brand:** each round, Mardax burns your largest stack for 2 rounds (uncleansable).
- **Mechanic 3 — Phase 2:** below 40% army power, all demon stacks gain +3 speed and no_retaliation.

---

## 6. Run modifiers

### 6.1 Curses (1 random at run start)

| # | Curse | Effect |
|---|---|---|
| 1 | **Swift Foes** | Enemy units +2 speed |
| 2 | **Ill Omen** | Your units start every battle with −1 morale |
| 3 | **Fog of War** | Your ranged units deal 25% less damage |
| 4 | **Rusted Arms** | Your units −2 attack |
| 5 | **Mana Leak** | Your spells cost +2 mana |
| 6 | **Endless Legions** | Enemy armies +15% unit counts |
| 7 | **Attrition** | After each battle, each stack loses an additional 5% units |
| 8 | **Hesitation** | Your army acts with −3 initiative on round 1 |
| 9 | **Bloodless** | Your healing and resurrection effects are halved |
| 10 | **Cursed Cards** | One of the 3 draft cards is face-down until picked |

### 6.2 Blessings (pick 1 of 2 after each act boss)

| # | Blessing | Effect |
|---|---|---|
| 1 | **Abundance** | Unit cards grant +20% counts |
| 2 | **Clairvoyance** | See the exact enemy stack list for every future encounter |
| 3 | **Mulligan** | Once per draft, reroll all 3 cards |
| 4 | **Stalwart Souls** | All your units +10% HP |
| 5 | **Hero's Favor** | Immediately gain 1 bonus draft + 1 hero level |

---

## 7. Synergy axes

1. **Sky Army** — all-flying units. Payoffs: *Sky Marshal*, *Teleport*, *Haste*, *Fleet Commander*.
2. **Firing Line** — all-ranged. Payoffs: *Quartermaster*, *Sharpshooter*, *Volley*, *Slow*, *Frostbite*.
3. **Morale Engine** — snowball on kills. *Standard Bearer* → *Overwhelm* → *Banner of the Crown* → *Rally*.
4. **Jousting Rush** — alpha-strike speed. *Fleet Commander* + *Haste* + *First Blood* + *Holy Charge* + *War Horn*.
5. **Tall Stack** — one giant Elite stack. *Blood Rage* / *Mini-Artifacts* + *Arcane Shield* + *Resurrection* + *Last Stand*.
6. **Burn the World** — DoT. Demon burn + *Fireball* + *Hellfire* + *Torment*. Uniquely strong vs. Boss 2.
7. **Necropolis Economy** — attrition immunity. *Field Medic* + *Bone Harvest* + *Nature's Grace* + *Resurrection*.
8. **Battlemage** — spell-carry. *Battle Meditation* + *Archmage's Focus* + *Overcharge* + *Chain Lightning* + *Summon Elementals*.

---

## 8. Technical implementation sketch

### 8.1 New data structures (`src/lib/gauntlet/types.ts`)

```ts
export type CardKind = 'unit' | 'talent' | 'spell' | 'ability';
export type Rarity = 'common' | 'rare' | 'epic';
export type Tag =
  | 'ranged' | 'flying' | 'morale' | 'speed' | 'offense' | 'defense'
  | 'magic' | 'control' | 'aoe' | 'economy' | 'luck' | 'mercenary';

export interface Card {
  id: string;
  kind: CardKind;
  name: string;
  description: string;
  rarity: Rarity;
  tags: Tag[];
  faction?: FactionId;
  payload:
    | { kind: 'unit'; unitId: UnitId; count: number }
    | { kind: 'talent'; talentId: TalentId }
    | { kind: 'spell'; spellId: SpellId }
    | { kind: 'ability'; abilityId: AbilityId };
}

export interface RunState {
  version: 1;
  seed: number;
  faction: FactionId;
  curseId: CurseId;
  blessingIds: BlessingId[];
  encounterIndex: number;
  hero: Hero;
  army: ArmyStack[];
  eliteProgress: Record<UnitId, number>;
  talentIds: TalentId[];
  spellIds: SpellId[];
  abilityIds: AbilityId[];
  tagAffinity: Partial<Record<Tag, number>>;
  pendingDraft: Card[] | null;
  draftsSinceEpic: number;
  draftHistory: { encounter: number; offered: string[]; picked: string }[];
  status: 'drafting' | 'pre_battle' | 'in_battle' | 'won' | 'lost';
  stats: { unitsLost: number; damageDealt: number; startedAt: number };
}
```

### 8.2 Modifier engine (the main battle-engine addition)

```ts
export interface Modifier {
  id: string;
  side: 'player' | 'enemy' | 'both';
  onBattleStart?(b: BattleState): void;
  onRoundStart?(b: BattleState, round: number): void;
  modifyStackStats?(s: StackView): StackView;
  modifyDamage?(ctx: DamageContext): number;
  modifySpell?(spell: SpellCast): SpellCast;
  onStackKilled?(b: BattleState, dead: Stack, killer: Stack): void;
  onBattleEnd?(run: RunState, result: BattleResult): void;
}
```

The battle engine gets `modifiers: Modifier[]` on `BattleState` and calls each hook at the named points. This also gives campaign mode scripted encounters for free.

### 8.3 New Svelte components

| Component | Purpose |
|---|---|
| `/gauntlet/+page.svelte` | Router: setup / map / draft / summary |
| `RunSetupScreen.svelte` | Faction pick, curse reveal, start |
| `RunMap.svelte` | 10-node track (reuse campaign's node-map) |
| `DraftScreen.svelte` | 3–4 `DraftCard`s + army sidebar |
| `DraftCard.svelte` | Kind icon, rarity border, name, description, tags |
| `RunHud.svelte` | Persistent in-battle strip: act, curse icon, hero level |
| `HeroAbilityBar.svelte` | In-battle buttons for drafted abilities with cooldown pips |
| `RunSummary.svelte` | Victory/defeat, draft history, stats, score, "New Run" |

### 8.4 IndexedDB stores

- **`gauntletRun`** key `'active'` — write after every state transition. One active run. Mid-*battle* state not persisted in v1.
- **`gauntletHistory`** autoincrement — `{ seed, faction, curseId, result, encounterReached, score, draftHistory, finishedAt }`.

---

## 9. Milestone breakdown

### M1 — Walking skeleton (playable loop)
- `RunState`, seeded RNG, IndexedDB resume
- `/gauntlet` route: faction pick → 10-encounter loop → win/lose summary
- Power-budget encounter generator
- **Unit cards only** (act tier gating, duplicate stacking, no elites)
- Hero +1 level per victory; losses persist
- **Exit:** full 10-fight run playable, survives browser refresh

### M2 — Full card pool
- Modifier engine wired into battle loop
- All 17 generic + 18 faction talents; 10 spells; 6 hero abilities + `HeroAbilityBar`
- Slot rules, rarity weights, pity timer, faction filtering
- Elite upgrades (3-copy rule + `ELITE_BONUSES` table)
- **Exit:** every card pickable and functional in battle

### M3 — Structure and drama
- 3 act structure; 3 scripted bosses as enemy Modifiers
- Enemy-hero capability unlock steps; counter-faction selection for encounters 8–9
- 10 curses + 5 blessings; curse reveal at setup; blessing pick after each boss
- Terrain layout variants; `gauntletHistory` store + run summary
- **Exit:** all 3 bosses beatable and mechanically distinct

### M4 — Balance and polish
- Headless sim harness: auto-play N seeded runs; tune toward 35–45% win rate
- Tag-affinity synergy weighting
- Card art/icons, rarity styling, draft animations
- Run score formula on summary and history screens
- **Exit:** 20 internal test runs across all 6 factions; median time 20–35 min

---

## Appendix A — Top 5 balance numbers to tune first

1. `budget(n)` growth factor (1.32) vs. average drafted power per pick (~110)
2. Unit-card count formulas per act (60/110/170)
3. Field Medic / Bone Harvest recovery rates
4. Boss 2 resurrection rate (12%) vs. Act II player DPS
5. Epic rarity rate by act (~2–3 epics per run target)
