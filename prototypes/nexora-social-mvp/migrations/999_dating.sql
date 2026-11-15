CREATE TABLE IF NOT EXISTS nexora_social_world.likes (
  id BIGSERIAL PRIMARY KEY,
  from_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  to_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT likes_unique_pair UNIQUE(from_account_id,to_account_id),
  CONSTRAINT likes_no_self CHECK(from_account_id<>to_account_id)
);
CREATE INDEX IF NOT EXISTS likes_to_created_idx ON nexora_social_world.likes(to_account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS likes_from_created_idx ON nexora_social_world.likes(from_account_id,created_at DESC);
