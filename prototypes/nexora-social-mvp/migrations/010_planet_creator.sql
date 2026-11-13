CREATE TABLE IF NOT EXISTS nexora_social_world.custom_planets (
  id BIGSERIAL PRIMARY KEY,
  owner_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  category VARCHAR(24) NOT NULL DEFAULT 'social' CHECK (category IN ('social','romantic','music','dance','game','vip','private','custom')),
  theme VARCHAR(24) NOT NULL DEFAULT 'nebula' CHECK (theme IN ('nebula','aurora','sunset','ocean','violet','emerald')),
  accent_color VARCHAR(7) NOT NULL DEFAULT '#9d8cff' CHECK (accent_color ~ '^#[0-9A-Fa-F]{6}$'),
  access_mode VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public','invite','private')),
  capacity SMALLINT NOT NULL DEFAULT 30 CHECK (capacity BETWEEN 2 AND 100),
  welcome_message VARCHAR(180) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','blocked')),
  total_visits BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planets_catalog_idx ON nexora_social_world.custom_planets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS planets_owner_idx ON nexora_social_world.custom_planets(owner_account_id);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_members (
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (planet_id, account_id)
);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_staff (
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL CHECK (role IN ('ADMIN','MODERATOR')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (planet_id, account_id)
);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_bans (
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  actor_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id),
  reason VARCHAR(300) NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (planet_id, account_id)
);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_invites (
  id BIGSERIAL PRIMARY KEY,
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  invited_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  invited_by BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (planet_id, invited_account_id)
);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_visits (
  id BIGSERIAL PRIMARY KEY,
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planet_visits_lookup_idx ON nexora_social_world.planet_visits(planet_id, visited_at DESC);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_favorites (
  planet_id BIGINT NOT NULL REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (planet_id, account_id)
);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_settings (
  planet_id BIGINT PRIMARY KEY REFERENCES nexora_social_world.custom_planets(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS nexora_social_world.planet_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  planet_id BIGINT REFERENCES nexora_social_world.custom_planets(id) ON DELETE SET NULL,
  actor_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  target_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planet_audit_lookup_idx ON nexora_social_world.planet_audit_logs(planet_id, created_at DESC);
