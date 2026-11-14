CREATE SCHEMA IF NOT EXISTS nexora_social_world;

CREATE TABLE IF NOT EXISTS nexora_social_world.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(24) NOT NULL,
  nickname_normalized VARCHAR(24) NOT NULL UNIQUE,
  phone VARCHAR(24) UNIQUE,
  gender VARCHAR(12) NOT NULL CHECK (gender IN ('male','female','other')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexora_social_world.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON nexora_social_world.sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON nexora_social_world.sessions(expires_at);

CREATE TABLE IF NOT EXISTS nexora_social_world.account_preferences (
  account_id UUID PRIMARY KEY REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'online',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
