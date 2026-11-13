CREATE TABLE IF NOT EXISTS nexora_social_world.planet_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  planet_key TEXT NOT NULL,
  account_id BIGINT NOT NULL,
  nickname TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planet_chat_messages_planet_id_idx
  ON nexora_social_world.planet_chat_messages (planet_key, id DESC);
