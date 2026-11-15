CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key VARCHAR(240) NOT NULL UNIQUE,
  mime_type VARCHAR(40) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  public_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_assets_owner_created_idx ON media_assets(owner_user_id,created_at DESC);
