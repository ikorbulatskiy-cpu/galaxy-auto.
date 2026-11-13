-- Preserve legacy accounts while adding email/password and external identity support.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS oauth_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider VARCHAR(24) NOT NULL CHECK (provider IN ('google','apple','vk')),
 provider_subject TEXT NOT NULL, email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(provider,provider_subject), UNIQUE(user_id,provider)
);
CREATE INDEX IF NOT EXISTS oauth_accounts_user_id_idx ON oauth_accounts(user_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id);
