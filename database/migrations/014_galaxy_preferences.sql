-- Persistent per-user settings for the integrated Galaxy social world.
CREATE TABLE IF NOT EXISTS galaxy_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_bubbles BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  friends_only_messages BOOLEAN NOT NULL DEFAULT TRUE,
  invisible BOOLEAN NOT NULL DEFAULT FALSE,
  system_messages BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS galaxy_preferences_updated_idx
  ON galaxy_preferences(updated_at);
