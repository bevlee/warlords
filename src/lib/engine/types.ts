export type Pos = { col: number; row: number };

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
  abilities: string[]; // 'no_retaliation' | 'flying' | 'defense_reduction'
  /** Subset of `abilities` granted by run skills rather than the base unit —
   *  the UI colors these differently in stat previews. */
  grantedAbilities?: string[];
  /** Per-ability numeric levels; absent entries use the catalog default
   *  (see engine/abilityCatalog.ts). */
  abilityLevels?: Record<string, number>;
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
  isDefending: boolean; // defensive stance until the start of its own next turn
  isHero?: boolean;    // hero combatant: off-grid, untargetable, no retaliation vs it
  isAlly?: boolean;    // summoned ally stack: fights on the player side, AI-controlled
  controllerId?: string; // authoritative owner in co-op; absent uses legacy side/isAlly derivation
  attackBuff?: number;  // battle-long spell bonus to attack
  defenseBuff?: number; // battle-long spell bonus to defense
  initiativeBonus?: number; // battle-long flat bonus to ATB fill rate (gauntlet items)
  lastMovedFrom?: Pos;  // set when a unit moves this turn; cleared at round start (Knight jousting)
  speedBonus?: number;        // battle-long movement bonus (Ranger Logistics), set once at battle start
  speedPenalty?: number;      // temporary movement reduction (Zombie slow_on_hit); cleared at round start
  blindedUntilRound?: number; // set on blind_on_hit proc; cleared after skipping this stack's next turn
  burnDamage?: number;        // flat damage applied at the start of this stack's turn while burnRoundsLeft > 0
  burnRoundsLeft?: number;    // remaining turns of burn damage (Efreet)
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
  bonusSkeletons?: number; // Necromancer Necromancy: free Skeletons queued for the hero's next battle
}

export type SpellId = 'lightning' | 'bloodlust' | 'stoneskin';

export interface ArmySlot {
  unit: UnitDef;
  count: number;
}

/** Army-wide flat stat bonuses (gauntlet items) applied to player stacks at battle start. */
export interface ArmyBonuses {
  attack: number;
  defense: number;
  initiative: number;
  luck: number;
  morale: number;
}

export type BattleEventType =
  | 'attack' | 'retaliate' | 'shoot' | 'move' | 'defend' | 'cast'
  | 'death' | 'morale_boost' | 'morale_freeze' | 'luck' | 'status'
  | 'round_start' | 'battle_end';

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
  /** Next battle-scoped unit id. Keeping allocation in state makes every
   *  transition replayable and identical across browser/server runtimes. */
  nextId: number;
  /** 'deploy' = pre-combat troop placement (UI freezes the turn loop);
   *  'combat' = normal battle. Absent on states built before this existed,
   *  treated as 'combat'. */
  phase?: 'deploy' | 'combat';
}

export type BattleAction =
  | { type: 'move'; to: Pos }
  | { type: 'attack'; targetId: string; moveTo?: Pos }
  | { type: 'shoot'; targetId: string }
  | { type: 'defend' }
  | { type: 'cast'; spell: SpellId; targetId: string }
  | { type: 'wait' };
