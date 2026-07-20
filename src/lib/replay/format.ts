import type { BattleCasualty, BattleHistoryRow } from '$lib/net/api';

export function casualtyText(rows: BattleCasualty[]): string {
  return rows.length ? rows.map(row => `${row.lost} ${row.unitName}`).join(', ') : 'none';
}

export function resultLabel(result: BattleHistoryRow['result']): string {
  if (result === 'player_wins') return 'Victory';
  if (result === 'enemy_wins') return 'Defeat';
  if (result === 'abandoned') return 'Abandoned';
  return 'Unfinished';
}
