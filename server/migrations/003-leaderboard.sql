CREATE TABLE leaderboard_runs (
  id            TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL REFERENCES players(id),
  name          TEXT NOT NULL,
  faction       TEXT NOT NULL,
  battles_won   INTEGER NOT NULL,
  endless_depth INTEGER NOT NULL DEFAULT 0,
  hero_level    INTEGER NOT NULL,
  army          TEXT NOT NULL,
  items         TEXT NOT NULL,
  unit_skills   TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_leaderboard_score
  ON leaderboard_runs (battles_won DESC, endless_depth DESC, started_at ASC);
