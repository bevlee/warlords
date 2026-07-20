-- Runtime metadata required to reconnect a player to a journalled battle after
-- the single Node process restarts. Lobby rows are deliberately discarded on
-- boot; only rows linked to live battles are rehydrated.
CREATE TABLE rooms (
  code             TEXT PRIMARY KEY,
  battle_id        TEXT REFERENCES battles(id),
  host_player_id   TEXT NOT NULL REFERENCES players(id),
  guest_player_id  TEXT REFERENCES players(id),
  host_loadout     TEXT NOT NULL,
  guest_loadout    TEXT,
  phase            TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  last_activity    INTEGER NOT NULL
);

CREATE INDEX rooms_host_player_idx ON rooms(host_player_id);
CREATE INDEX rooms_guest_player_idx ON rooms(guest_player_id);
