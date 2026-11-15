ALTER TABLE nexora_social_auth.accounts
  ADD COLUMN IF NOT EXISTS recovery_code_hash TEXT;

CREATE TABLE IF NOT EXISTS nexora_social_auth.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES nexora_social_auth.accounts(id) ON DELETE CASCADE,
  head_id SMALLINT NOT NULL CHECK (head_id BETWEEN 1 AND 12),
  body_id SMALLINT NOT NULL CHECK (body_id BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
