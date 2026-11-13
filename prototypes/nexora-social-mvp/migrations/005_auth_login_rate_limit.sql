-- Persistent login throttling for recovery-code authentication.
-- One row per hashed client IP; no raw IP addresses or recovery codes are stored.
CREATE TABLE IF NOT EXISTS nexora_social_world.auth_login_attempts (
  ip_hash CHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_login_attempts_updated_idx
  ON nexora_social_world.auth_login_attempts(updated_at);
