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
  augmented?: boolean; // set by augmentedDef so the UI can badge boosted units
}

export interface UnitStack {
  id: string;
  definition: UnitDef;
  count: number;
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
  attackBuff?: number;  // battle-long spell bonus to attack
  defenseBuff?: number; // battle-long spell bonus to defense
  lastMovedFrom?: Pos;  // set when a unit moves this turn; cleared at round start (Knight jousting)
  speedBonus?: number;        // battle-long movement bonus (Ranger Logistics), set once at battle start
  speedPenalty?: number;      // temporary movement reduction (Zombie slow_on_hit); cleared at round start
  blindedUntilRound?: number; // set on blind_on_hit proc; cleared after skipping this stack's next turn
  burnDamage?: number;        // flat damage applied at the start of this stack's turn while burnRoundsLeft > 0
  burnRoundsLeft?: number;    // remaining turns of burn damage (Efreet)
  boundUntilRound?: number;   // set on bind proc; blocks movement on this stack's next turn, then clears
  startCount?: number;        // battle-start creature count: the ceiling for heals/revivals
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
  level: number;
  xp: number;
  attack: number;
  defense: number;
  statPoints: number;
  factionSkills: FactionSkill[];
  mana?: number;       // set by initBattle (5 + 3·level) unless provided
  bonusSkeletons?: number; // Necromancer Necromancy: free Skeletons queued for the hero's next battle
  augmentPoints?: number;                  // unspent augment points (1 earned per level-up)
  unitAugments?: Record<string, string[]>; // unit name -> augment ids, max 2 per unit
}

export type SpellId =
  | 'lightning' | 'bloodlust' | 'stoneskin'          // shared
  | 'battle_cry'                                     // barbarian
  | 'healing_light'                                  // knight
  | 'fireball'                                       // wizard
  | 'raise_dead'                                     // necromancer
  | 'wasp_swarm'                                     // ranger
  | 'immolate';                                      // demon

export interface ArmySlot {
  unit: UnitDef;
  count: number;
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
  round: number;
  battleTime: number;  // in rounds; a baseline init-10 stack acts once per round
  currentUnitId: string | null;
  log: BattleEvent[];
  result: 'ongoing' | 'player_wins' | 'enemy_wins';
  seed: number;
  /** Claimable battlefield objectives (see structures.ts). Optional so
   *  hand-built states in tests and previews stay valid. */
  structures?: import('./structures').Structure[];
  lootXp?: number; // accumulated war_chest bonuses, paid out on player_wins
}

export type BattleAction =
  | { type: 'move'; to: Pos }
  | { type: 'attack'; targetId: string; moveTo?: Pos }
  | { type: 'shoot'; targetId: string }
  | { type: 'defend' }
  | { type: 'cast'; spell: SpellId; targetId: string }
  | { type: 'wait' };
