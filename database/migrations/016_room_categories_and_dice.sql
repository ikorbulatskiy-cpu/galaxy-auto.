-- NEXORA room discovery categories and server-authoritative dice rounds.
-- Additive and safe to rerun.
ALTER TABLE planets
  ADD COLUMN IF NOT EXISTS category VARCHAR(24) NOT NULL DEFAULT 'social';
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS category VARCHAR(24) NOT NULL DEFAULT 'social';

ALTER TABLE planets DROP CONSTRAINT IF EXISTS planets_category_check;
ALTER TABLE planets ADD CONSTRAINT planets_category_check
  CHECK (category IN ('social','music','dating','interests','games','adult'));

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_category_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_category_check
  CHECK (category IN ('social','music','dating','interests','games','adult'));

UPDATE planets SET category=CASE
  WHEN slug LIKE '%love%' OR slug LIKE '%date%' THEN 'dating'
  WHEN slug LIKE '%music%' OR slug LIKE '%neon%' THEN 'music'
  WHEN slug LIKE '%game%' OR slug LIKE '%arcade%' THEN 'games'
  WHEN slug LIKE '%vip%' THEN 'interests'
  ELSE category END
WHERE category='social';

UPDATE rooms SET category=CASE
  WHEN slug LIKE '%club%' OR slug LIKE '%music%' OR slug LIKE '%dj%' THEN 'music'
  WHEN slug LIKE '%heart%' OR slug LIKE '%love%' OR slug LIKE '%date%' THEN 'dating'
  WHEN slug LIKE '%game%' OR slug LIKE '%dice%' OR slug LIKE '%barrel%' THEN 'games'
  WHEN slug LIKE '%vip%' THEN 'interests'
  ELSE category END
WHERE category='social';

CREATE INDEX IF NOT EXISTS rooms_planet_category_active_idx
  ON rooms(planet_id,category,is_active);

CREATE TABLE IF NOT EXISTS mini_game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_slug VARCHAR(32) NOT NULL CHECK (game_slug IN ('dice')),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mini_game_rounds_user_time_idx
  ON mini_game_rounds(user_id,created_at DESC);
