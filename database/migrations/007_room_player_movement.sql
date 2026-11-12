-- Persisted, bounded 2D positions for each player's character in each room.
CREATE TABLE IF NOT EXISTS room_player_positions (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 50 CHECK (x BETWEEN 2 AND 98),
  y REAL NOT NULL DEFAULT 78 CHECK (y BETWEEN 8 AND 92),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_player_positions_updated_idx
  ON room_player_positions(room_id, updated_at DESC);
