-- Isolated, additive schema for NEXORA Social World.
-- Does not alter or delete objects in the main site's schema.
CREATE SCHEMA IF NOT EXISTS nexora_social_world;

CREATE TABLE IF NOT EXISTS nexora_social_world.accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nickname VARCHAR(18) NOT NULL,
  nickname_normalized VARCHAR(18) NOT NULL UNIQUE,
  recovery_code_hash TEXT NOT NULL,
  recovery_code_lookup_hash CHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS nexora_social_world.sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON nexora_social_world.sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON nexora_social_world.sessions(expires_at);

CREATE TABLE IF NOT EXISTS nexora_social_world.characters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL UNIQUE REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  nickname VARCHAR(18) NOT NULL,
  avatar JSONB NOT NULL DEFAULT '{}'::jsonb,
  planet VARCHAR(32) NOT NULL DEFAULT 'starter',
  position_x REAL NOT NULL DEFAULT 0.5 CHECK (position_x >= 0 AND position_x <= 1),
  authority INTEGER NOT NULL DEFAULT 0 CHECK (authority >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexora_social_world.friends (
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  friend_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_id, friend_account_id),
  CHECK(account_id <> friend_account_id)
);

CREATE TABLE IF NOT EXISTS nexora_social_world.messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  planet VARCHAR(32) NOT NULL,
  account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  nickname VARCHAR(18) NOT NULL,
  message_text VARCHAR(240) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_planet_created_idx ON nexora_social_world.messages(planet, created_at DESC);

CREATE TABLE IF NOT EXISTS nexora_social_world.gifts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  to_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  gift_type VARCHAR(24) NOT NULL,
  authority_added INTEGER NOT NULL CHECK(authority_added > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexora_social_world.wallets (
  account_id BIGINT PRIMARY KEY REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK(balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexora_social_world.inventory (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  item_code VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(account_id, item_code)
);

CREATE TABLE IF NOT EXISTS nexora_social_world.planets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  slug VARCHAR(48) NOT NULL UNIQUE,
  title VARCHAR(80) NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexora_social_world.rooms (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  planet_id BIGINT REFERENCES nexora_social_world.planets(id) ON DELETE CASCADE,
  slug VARCHAR(48) NOT NULL UNIQUE,
  title VARCHAR(80) NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS nexora_social_world.furniture (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.planets(id) ON DELETE CASCADE,
  item_code VARCHAR(64) NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  rotation REAL NOT NULL DEFAULT 0,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS furniture_planet_idx ON nexora_social_world.furniture(planet_id);

-- Additive upgrade for existing social-world databases.
ALTER TABLE nexora_social_world.accounts
  ADD COLUMN IF NOT EXISTS recovery_code_lookup_hash CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_recovery_lookup_idx
  ON nexora_social_world.accounts(recovery_code_lookup_hash)
  WHERE recovery_code_lookup_hash IS NOT NULL;
