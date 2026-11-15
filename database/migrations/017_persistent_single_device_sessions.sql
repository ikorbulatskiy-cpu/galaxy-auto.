-- Persistent single-device login for NEXORA accounts.
-- NULL expiry means the session remains valid until explicitly revoked.
ALTER TABLE nexora_social_auth.sessions
  ALTER COLUMN expires_at DROP NOT NULL;
UPDATE nexora_social_auth.sessions
SET expires_at = NULL
WHERE expires_at IS NOT NULL;
