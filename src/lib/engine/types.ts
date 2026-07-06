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

export interface Hero {
  class: 'barbarian';
  level: number;
  xp: number;
  attack: number;
  defense: number;
  statPoints: number;
}

export interface ArmySlot {
  unit: UnitDef;
  count: number;
}

export type BattleEventType =
  | 'attack' | 'retaliate' | 'shoot' | 'move'
  | 'death' | 'morale_boost' | 'morale_freeze'
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
}

export type BattleAction =
  | { type: 'move'; to: Pos }
  | { type: 'attack'; targetId: string; moveTo?: Pos }
  | { type: 'shoot'; targetId: string }
  | { type: 'wait' };
