-- NEXORA 11.0 additive economy, player reports and custom planet decoration.
CREATE TABLE IF NOT EXISTS nexora_social_world.shop_catalog (
  item_code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  category VARCHAR(24) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '✦',
  price BIGINT NOT NULL CHECK (price >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS nexora_social_world.wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  request_id VARCHAR(80) NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, request_id)
);
CREATE INDEX IF NOT EXISTS wallet_transactions_account_created_idx
  ON nexora_social_world.wallet_transactions(account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS nexora_social_world.player_reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  target_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  category VARCHAR(24) NOT NULL CHECK (category IN ('harassment','spam','scam','inappropriate','other')),
  details VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reporter_account_id <> target_account_id)
);
CREATE INDEX IF NOT EXISTS player_reports_status_created_idx
  ON nexora_social_world.player_reports(status, created_at DESC);
CREATE TABLE IF NOT EXISTS nexora_social_world.custom_planet_objects (
  id BIGSERIAL PRIMARY KEY,
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  object_code VARCHAR(40) NOT NULL,
  x REAL NOT NULL CHECK (x BETWEEN 0 AND 1),
  y REAL NOT NULL CHECK (y BETWEEN 0 AND 1),
  rotation REAL NOT NULL DEFAULT 0 CHECK (rotation BETWEEN -360 AND 360),
  scale REAL NOT NULL DEFAULT 1 CHECK (scale BETWEEN .5 AND 2),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS custom_planet_objects_order_idx
  ON nexora_social_world.custom_planet_objects(planet_id, y, id);

INSERT INTO nexora_social_world.shop_catalog(item_code,name,description,category,icon,price,metadata)
VALUES
 ('suit_neon_blue','Неоновый костюм','Светящийся сине-фиолетовый образ','clothes','🧥',120,'{"avatarPatch":{"suit":"#6d7cff"}}'),
 ('suit_rose','Розовый костюм','Яркий розовый образ','clothes','👚',120,'{"avatarPatch":{"suit":"#ef6c9b"}}'),
 ('suit_mint','Мятный костюм','Свежий мятный стиль','clothes','🧥',120,'{"avatarPatch":{"suit":"#35bca5"}}'),
 ('hair_long','Длинная причёска','Новая причёска персонажа','hair','💇',90,'{"avatarPatch":{"hair":"long"}}'),
 ('hair_spiky','Дерзкая причёска','Объёмная причёска персонажа','hair','⚡',90,'{"avatarPatch":{"hair":"spiky"}}'),
 ('hair_silver','Серебряные волосы','Холодный серебристый оттенок','hair','❄️',110,'{"avatarPatch":{"hairColor":"#e9eef8"}}'),
 ('accessory_glasses','Очки','Стильные очки','accessories','🕶️',75,'{"avatarPatch":{"accessory":"glasses"}}'),
 ('accessory_headphones','Наушники','Музыкальные наушники','accessories','🎧',95,'{"avatarPatch":{"accessory":"headphones"}}'),
 ('accessory_crown','Корона','Корона для особого образа','accessories','👑',250,'{"avatarPatch":{"accessory":"crown"}}')
ON CONFLICT(item_code) DO NOTHING;
