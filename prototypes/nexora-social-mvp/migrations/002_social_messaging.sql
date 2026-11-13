-- NEXORA Social World stage 2: persisted social graph, direct messages and notifications.
-- Additive only. All objects remain inside the isolated nexora_social_world schema.
CREATE TABLE IF NOT EXISTS nexora_social_world.friend_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  to_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_account_id <> to_account_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_pair_idx
  ON nexora_social_world.friend_requests(from_account_id,to_account_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS friend_requests_inbox_idx
  ON nexora_social_world.friend_requests(to_account_id,created_at DESC) WHERE status='pending';

CREATE TABLE IF NOT EXISTS nexora_social_world.user_blocks (
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  blocked_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_id,blocked_account_id),
  CHECK(account_id <> blocked_account_id)
);

CREATE TABLE IF NOT EXISTS nexora_social_world.conversations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  participant_a BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  participant_b BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(participant_a < participant_b),
  UNIQUE(participant_a,participant_b)
);
CREATE INDEX IF NOT EXISTS conversations_a_updated_idx ON nexora_social_world.conversations(participant_a,updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_b_updated_idx ON nexora_social_world.conversations(participant_b,updated_at DESC);

CREATE TABLE IF NOT EXISTS nexora_social_world.direct_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES nexora_social_world.conversations(id) ON DELETE CASCADE,
  sender_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  body VARCHAR(2000) NOT NULL CHECK(length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx ON nexora_social_world.direct_messages(conversation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_unread_idx ON nexora_social_world.direct_messages(conversation_id,sender_account_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS nexora_social_world.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  actor_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  type VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON nexora_social_world.notifications(account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON nexora_social_world.notifications(account_id) WHERE read_at IS NULL;

ALTER TABLE nexora_social_world.characters
  ADD COLUMN IF NOT EXISTS profile_status VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_bio VARCHAR(240) NOT NULL DEFAULT '';
