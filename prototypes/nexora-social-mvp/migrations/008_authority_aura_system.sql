-- NEXORA authority titles and aura progression. Additive and backwards-compatible.
ALTER TABLE nexora_social_world.characters
  ADD COLUMN IF NOT EXISTS authority_title VARCHAR(24) NOT NULL DEFAULT 'NOVICE',
  ADD COLUMN IF NOT EXISTS aura_enabled BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'characters_authority_title_check'
      AND conrelid = 'nexora_social_world.characters'::regclass
  ) THEN
    ALTER TABLE nexora_social_world.characters
      ADD CONSTRAINT characters_authority_title_check
      CHECK (authority_title IN ('NOVICE','BEDA','PAPA','ANGEL','CREATOR'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS nexora_social_world.authority_title_config (
  title_key VARCHAR(24) PRIMARY KEY CHECK (title_key IN ('NOVICE','BEDA','PAPA','ANGEL','CREATOR')),
  title_label VARCHAR(40) NOT NULL,
  sort_order SMALLINT NOT NULL UNIQUE CHECK (sort_order BETWEEN 0 AND 4),
  koins_price BIGINT NOT NULL DEFAULT 0 CHECK (koins_price >= 0),
  min_authority INTEGER NOT NULL DEFAULT 0 CHECK (min_authority >= 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  aura_type VARCHAR(24) NOT NULL CHECK (aura_type IN ('NONE','GOLD_SOFT','GOLD_PREMIUM','GREEN','FIRE_RED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO nexora_social_world.authority_title_config
  (title_key,title_label,sort_order,koins_price,min_authority,enabled,aura_type)
VALUES
  ('NOVICE','Новичок',0,0,0,TRUE,'NONE'),
  ('BEDA','Беда',1,500,25,TRUE,'GOLD_SOFT'),
  ('PAPA','Папа',2,1500,75,TRUE,'GOLD_PREMIUM'),
  ('ANGEL','Ангел',3,3500,150,TRUE,'GREEN'),
  ('CREATOR','Создатель',4,10000,300,TRUE,'FIRE_RED')
ON CONFLICT (title_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS nexora_social_world.authority_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  old_title VARCHAR(24) NOT NULL,
  new_title VARCHAR(24) NOT NULL,
  source VARCHAR(24) NOT NULL CHECK (source IN ('PURCHASE','DEVELOPER','SYSTEM')),
  actor_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authority_history_account_created_idx
  ON nexora_social_world.authority_history(account_id,created_at DESC);

CREATE TABLE IF NOT EXISTS nexora_social_world.authority_purchases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  title_key VARCHAR(24) NOT NULL REFERENCES nexora_social_world.authority_title_config(title_key),
  koins_spent BIGINT NOT NULL CHECK (koins_spent >= 0),
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS authority_purchases_account_created_idx
  ON nexora_social_world.authority_purchases(account_id,created_at DESC);
