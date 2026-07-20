import type Database from 'better-sqlite3';

export const BATTLE_HISTORY_CAP = 200;

/** Deletes battles that fall beyond the cap for every participant. A shared
 * co-op record is retained while it is still inside either player's history. */
export function pruneBattleHistory(db: Database.Database, cap = BATTLE_HISTORY_CAP): string[] {
  const rows = db.prepare(
    'SELECT b.id, b.player_ids, r.code AS room_code FROM battles b ' +
      'LEFT JOIN rooms r ON r.battle_id = b.id ORDER BY b.started_at DESC, b.rowid DESC'
  ).all() as Array<{ id: string; player_ids: string; room_code: string | null }>;
  const seen = new Map<string, number>();
  const stale: string[] = [];

  for (const row of rows) {
    const players = parsePlayers(row.player_ids);
    if (!row.room_code && players.length > 0 && players.every(player => (seen.get(player) ?? 0) >= cap)) stale.push(row.id);
    for (const player of players) seen.set(player, (seen.get(player) ?? 0) + 1);
  }
  if (stale.length === 0) return stale;

  const deleteActions = db.prepare('DELETE FROM battle_actions WHERE battle_id = ?');
  const deleteChat = db.prepare('DELETE FROM battle_chat WHERE battle_id = ?');
  const deleteBattle = db.prepare('DELETE FROM battles WHERE id = ?');
  db.transaction(() => {
    for (const id of stale) {
      deleteActions.run(id);
      deleteChat.run(id);
      deleteBattle.run(id);
    }
  })();
  return stale;
}

function parsePlayers(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
