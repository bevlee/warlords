export type Pos = { col: number; row: number };

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type StackOrigin =
  | { type: 'deployed'; armySlotKey: string }
  | {
      type: 'summoned';
      source:
        | 'gate'
        | 'necromancy'
        | 'dragon_ossuary'
        | 'putrid_grimoire'
        | 'blood_tithe'
        | 'knights_reliquary'
        | 'animus_engine';
      summonerId?: string;
    }
  | { type: 'reborn'; source: 'infernal_rebirth' | 'ninth_circle' };

export type UnitType = 'construct';

export interface UnitDef {
  name: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  speed: number;      // movement range in cells
  initiative: number; // ATB fill rate; 10 = one turn per round
  hp: number;
  attack: number;
  defense: number;
  minDamage: number;
  maxDamage: number;
  shots: number;       // 0 = melee only
  range: number;       // max shooting distance in cells (Chebyshev); 0 = melee only
  isLarge: boolean;
  /** Rules-facing creature classifications, separate from active abilities. */
  types?: UnitType[];
  abilities: string[]; // 'no_retaliation' | 'flying' | 'defense_reduction'
  /** Subset of `abilities` granted by run skills rather than the base unit —
   *  the UI colors these differently in stat previews. */
  grantedAbilities?: string[];
  /** Per-ability numeric levels; absent entries use the catalog default
   *  (see engine/abilityCatalog.ts). */
  abilityLevels?: Record<string, number>;
}

export type UnitModifierStat =
  | 'attack'
  | 'defense'
  | 'damage'
  | 'initiative'
  | 'speed'
  | 'morale'
  | 'luck';

/** One named cause behind a stack's active numeric modifiers. The combat
 * fields below remain the calculation fast-path; this ledger makes their
 * sources independently visible instead of collapsing everything to a total. */
export interface UnitModifierSource {
  id: string;
  label: string;
  stats: Partial<Record<UnitModifierStat, number>>;
  stacks: number;
}

export interface EffectExpiry {
  /** Effects normally expire after this many completed turns of their target. */
  targetTurnsRemaining?: number;
  /** A source-turn expiry is used by auras and plans owned by another stack. */
  sourceTurnsRemaining?: number;
  /** Whether a target-turn expiry is processed before or after that turn. */
  phase?: 'start' | 'end';
}

export interface CombatEffect {
  id: string;
  kind: string;
  sourceStackId?: string;
  sourceControllerId?: string;
  positive: boolean;
  innate: boolean;
  removable: boolean;
  stacks: number;
  expires?: EffectExpiry;
  stats?: Partial<Record<UnitModifierStat, number>>;
  data?: Record<string, JsonValue>;
}

export interface TargetMark {
  kind: 'quarry' | 'ranged_mark' | 'marked_for_death';
  ownerTeamId: string;
  sourceControllerId: string;
  sourceId?: string;
  expires?: EffectExpiry;
  triggeredBy?: string[];
}

export type DamageAttribute = 'fire' | 'lightning' | 'cold' | 'acid';
export type DamageType = 'physical' | 'magic' | 'true' | 'sacrifice';
export interface DamagePacket {
  sourceId?: string;
  targetId: string;
  amount: number;
  type: DamageType;
  attributes?: DamageAttribute[];
  delivery: 'primary' | 'secondary' | 'retaliation' | 'dot' | 'collision';
  ranged: boolean;
  direct: boolean;
  canTriggerOnHit: boolean;
  canLifeDrain: boolean;
}

export interface DamageOutcome {
  finalDamage: number;
  killed: number;
  overkill: number;
  soulReaperKills: number;
  survived: boolean;
  resisted?: boolean;
}

export interface UnitStack {
  id: string;
  definition: UnitDef;
  count: number;
  startCount: number;  // count at battle start; resurrection (life_drain) ceiling
  hp: number;          // HP of the top creature only
  pos: Pos;
  side: 'player' | 'enemy';
  hasRetaliated: boolean;
  shotsLeft: number;
  morale: number;      // -3..3
  luck: number;        // -3..3
  atb: number;         // position on the initiative scale; acts at 1
  // Settles exact ties in act order. Drawn once per stack from the battle seed,
  // so the order stays deterministic across replays. Optional only so test
  // fixtures can omit it; initBattle always sets it.
  tiePriority?: number;
  isDefending: boolean; // defensive stance until the start of its own next turn
  isHero?: boolean;    // hero combatant: off-grid, untargetable, no retaliation vs it
  isAlly?: boolean;    // summoned ally stack: fights on the player side, AI-controlled
  controllerId?: string; // authoritative owner in co-op; absent uses legacy side/isAlly derivation
  origin?: StackOrigin;
  /** Set after the stack completes any turn, including Wait, Defend and skips. */
  hasTakenTurn?: boolean;
  /** Opening effects use an explicit remaining-turn counter, not an absolute turn number. */
  empoweredTurnsRemaining?: number;
  cooldowns?: Record<string, number>;
  abilityState?: Record<string, JsonValue>;
  effects?: CombatEffect[];
  marks?: TargetMark[];
  modifierSources?: UnitModifierSource[]; // named causes for the active numeric modifiers below
  attackBuff?: number;  // battle-long attack modifier (spells add, Zombie infecting_strike subtracts)
  defenseBuff?: number; // battle-long defense modifier (spells add, Zombie infecting_strike subtracts)
  damageBonus?: number; // battle-long flat bonus to min and max damage (Blood Acolyte blood_frenzy)
  initiativeBonus?: number; // battle-long flat bonus to ATB fill rate (gauntlet items)
  lastMovedFrom?: Pos;      // set when a unit moves this turn; cleared at round start
  lastMovedDistance?: number; // resolved route length used by Pounce/Jousting/etc.
  lastMovePath?: Pos[];     // shortest legal route, including destination but not origin
  speedBonus?: number;        // battle-long movement bonus (Ranger Logistics), set once at battle start
  speedPenalty?: number;      // temporary movement reduction (Zombie slow_on_hit); cleared at round start
  blindedUntilRound?: number; // set on blind_on_hit proc; cleared after skipping this stack's next turn
  burnDamage?: number;        // flat damage applied at the start of this stack's turn while burnRoundsLeft > 0
  burnRoundsLeft?: number;    // remaining turns of burn damage (Efreet)
  burnSourceId?: string;
  boundUntilRound?: number;   // set on bind proc; blocks movement on this stack's next turn, then clears
}

export interface Cell {
  col: number;
  row: number;
  blocked: boolean;
  occupantId: string | null;
}

export interface Grid {
  width: number;
  height: number;
  cells: Cell[][];
}

export type FactionClass = 'barbarian' | 'knight' | 'wizard' | 'necromancer' | 'ranger' | 'demon';

export interface FactionSkill {
  id: string;
  name: string;
  description: string;
  level: 1 | 2 | 3; // basic, advanced, expert
}

export interface Hero {
  class: FactionClass;
  name?: string;       // display name; boss heroes are named, the player's may be
  level: number;
  xp: number;
  attack: number;
  defense: number;
  statPoints: number;
  factionSkills: FactionSkill[];
  gold?: number;       // campaign winnings; adds to the level recruiting budget
  mana?: number;       // set by initBattle (5 + 3·level) unless provided
  spells?: SpellId[];
  bonusSkeletons?: number; // Necromancer Necromancy: free Skeletons queued for the hero's next battle
}

export type SpellId =
  | 'lightning'
  | 'bloodlust'
  | 'stoneskin'
  | 'slow'
  | 'chain_lightning'
  | 'resurrect'
  | 'blizzard';

export interface ArmySlot {
  unit: UnitDef;
  count: number;
}

/** Army-wide flat stat bonuses applied to player stacks at battle start. */
export interface ArmyBonuses {
  attack: number;
  defense: number;
  initiative: number;
  speed: number;
  luck: number;
  morale: number;
}

export type BattleEventType =
  | 'attack' | 'retaliate' | 'shoot' | 'move' | 'defend' | 'cast'
  | 'death' | 'morale_boost' | 'morale_freeze' | 'luck' | 'status'
  | 'round_start' | 'battle_end' | 'debug';

export interface BattleEvent {
  type: BattleEventType;
  data: Record<string, unknown>;
}

export interface BattleState {
  grid: Grid;
  units: UnitStack[];
  hero: Hero;
  /** Co-op heroes keyed by controller id. `hero` remains the host/solo fallback. */
  heroes?: Record<string, Hero>;
  round: number;
  battleTime: number;  // in rounds; a baseline init-10 stack acts once per round
  currentUnitId: string | null;
  log: BattleEvent[];
  result: 'ongoing' | 'player_wins' | 'enemy_wins';
  seed: number;
  /** Increments exactly once for each completed unit/hero turn. */
  actionSeq?: number;
  /** Actual one-based gauntlet encounter number; 1 outside a gauntlet by default. */
  gauntletRound?: number;
  /** Controller-scoped mechanic artifact identity. */
  artifacts?: Record<string, string[]>;
  /** Controller teams make target-owned marks work across co-op allies. */
  controllerTeams?: Record<string, string>;
  /** Encounter-owned Attack/Defence sources such as enemy bonus. */
  controllerStats?: Record<string, { attack: number; defense: number; label?: string }>;
  /** Learned training keyed by controller then strategic unit name. */
  training?: Record<string, Record<string, { weapon?: boolean; armour?: boolean }>>;
  /** Faction hero systems keep their serializable per-controller state here. */
  heroActionState?: Record<string, Record<string, JsonValue>>;
  /** Next battle-scoped unit id. Keeping allocation in state makes every
   *  transition replayable and identical across browser/server runtimes. */
  nextId: number;
  /** 'deploy' = pre-combat troop placement (UI freezes the turn loop);
   *  'combat' = normal battle. Absent on states built before this existed,
   *  treated as 'combat'. */
  phase?: 'deploy' | 'combat';
}

/** A complete stack payload without battle-owned identity or placement. Debug
 * actions carry the resolved values so replays do not depend on whichever
 * catalog or army bonuses happen to exist in a later build. */
export type DebugStackTemplate = Omit<UnitStack, 'id' | 'pos' | 'tiePriority'>;

/** State restored by one-step debug undo. The existing journal stays intact so
 * history shows both the original edit and the explicit undo operation. */
export type DebugBattleSnapshot = Omit<BattleState, 'log'>;

export type DebugBattleOperation =
  | { kind: 'add'; stack: DebugStackTemplate; to: Pos; label: string }
  | { kind: 'update'; unitId: string; stack: DebugStackTemplate; label: string }
  | { kind: 'delete'; unitId: string; label: string }
  | { kind: 'kill'; unitId: string; label: string }
  | { kind: 'heal'; unitId: string; label: string }
  | { kind: 'switch_side'; unitId: string; label: string }
  | { kind: 'restore'; snapshot: DebugBattleSnapshot; label: string }
  | { kind: 'note'; label: string };

export type BattleAction =
  | { type: 'move'; to: Pos }
  | { type: 'attack'; targetId: string; moveTo?: Pos; retreatTo?: Pos }
  | { type: 'shoot'; targetId: string }
  | { type: 'defend' }
  | { type: 'cast'; spell: SpellId; targetId: string }
  // Activated unit ability (engine/unitAbilities.ts). Deliberately not a
  // `cast`: spells are hero-only, cost mana, and target by side, none of which
  // fits a unit spending its own turn on its own resources.
  | { type: 'ability'; abilityId: string; targetId?: string; to?: Pos }
  | { type: 'hero_action'; actionId: string; targetId?: string; area?: Pos[] }
  // Development-only controls create these in solo battles. They remain an
  // engine action so persisted cause-only journals replay truthfully.
  | { type: 'debug'; operation: DebugBattleOperation }
  | { type: 'wait' };
