CREATE TABLE IF NOT EXISTS nexora_social_world.world_locations (
  id TEXT PRIMARY KEY,
  planet_key TEXT NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(planet_key,name)
);

CREATE TABLE IF NOT EXISTS nexora_social_world.world_rooms (
  id TEXT PRIMARY KEY,
  planet_key TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES nexora_social_world.world_locations(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 50 CHECK(capacity BETWEEN 2 AND 200),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(planet_key,location_id,name)
);

CREATE TABLE IF NOT EXISTS nexora_social_world.room_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES nexora_social_world.world_rooms(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  nickname VARCHAR(40) NOT NULL,
  message VARCHAR(240) NOT NULL CHECK(length(message)>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS room_messages_room_id_id_idx
  ON nexora_social_world.room_messages(room_id,id DESC);
CREATE INDEX IF NOT EXISTS world_rooms_planet_location_idx
  ON nexora_social_world.world_rooms(planet_key,location_id,sort_order);

ALTER TABLE nexora_social_world.characters
  ADD COLUMN IF NOT EXISTS room_id TEXT;

INSERT INTO nexora_social_world.world_locations(id,planet_key,name,sort_order) VALUES
  ('location-starter','starter','Главная площадь',1),
  ('location-starter-park','starter','Звёздный парк',2),
  ('location-club','club','Танцпол',1),
  ('location-club-lounge','club','VIP-лаунж',2),
  ('location-beach','beach','Пляжный берег',1),
  ('location-beach-pier','beach','Океанский пирс',2)
ON CONFLICT(id) DO NOTHING;

INSERT INTO nexora_social_world.world_rooms(id,planet_key,location_id,name,sort_order,is_default) VALUES
  ('room-starter-main','starter','location-starter','Центральная площадь',1,TRUE),
  ('room-starter-park','starter','location-starter-park','Тихий парк',1,FALSE),
  ('room-club-main','club','location-club','Главный танцпол',1,TRUE),
  ('room-club-lounge','club','location-club-lounge','Лаунж',1,FALSE),
  ('room-beach-main','beach','location-beach','Общий пляж',1,TRUE),
  ('room-beach-pier','beach','location-beach-pier','Пирс на закате',1,FALSE)
ON CONFLICT(id) DO NOTHING;

UPDATE nexora_social_world.characters c
SET room_id = CASE c.planet
  WHEN 'club' THEN 'room-club-main'
  WHEN 'beach' THEN 'room-beach-main'
  ELSE 'room-starter-main'
END
WHERE c.room_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM nexora_social_world.world_rooms r WHERE r.id=c.room_id AND r.planet_key=c.planet);

ALTER TABLE nexora_social_world.characters
  DROP CONSTRAINT IF EXISTS characters_room_id_fkey;
ALTER TABLE nexora_social_world.characters
  ADD CONSTRAINT characters_room_id_fkey
  FOREIGN KEY(room_id) REFERENCES nexora_social_world.world_rooms(id) ON DELETE SET NULL;
