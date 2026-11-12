-- NEXORA game-world foundation. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  gender VARCHAR(20) NOT NULL DEFAULT 'unspecified' CHECK (gender IN ('unspecified','female','male','other')),
  character_age SMALLINT CHECK (character_age IS NULL OR character_age BETWEEN 18 AND 120),
  bio VARCHAR(500) NOT NULL DEFAULT '',
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  authority INTEGER NOT NULL DEFAULT 0 CHECK (authority >= 0),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_user_name_lower_idx ON characters(user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS characters_user_created_idx ON characters(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS characters_one_active_per_user_idx ON characters(user_id) WHERE is_active=TRUE;

-- Preserve an initial playable character for accounts already created.
INSERT INTO characters (user_id, name, is_active, bio)
SELECT u.id, COALESCE(NULLIF(LEFT(p.display_name,32),''),u.username), TRUE, COALESCE(p.bio,'')
FROM users u LEFT JOIN profiles p ON p.user_id=u.id
WHERE NOT EXISTS (SELECT 1 FROM characters c WHERE c.user_id=u.id);

INSERT INTO user_locations (user_id,planet_id)
SELECT u.id,p.id FROM users u CROSS JOIN planets p
WHERE p.slug='nexora-prime'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  slug VARCHAR(48) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  capacity SMALLINT NOT NULL DEFAULT 50 CHECK (capacity BETWEEN 2 AND 500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(planet_id, slug)
);
CREATE INDEX IF NOT EXISTS rooms_planet_active_idx ON rooms(planet_id, is_active);

INSERT INTO rooms (planet_id, slug, name, description, capacity)
SELECT p.id, seed.slug, seed.name, seed.description, seed.capacity
FROM planets p
CROSS JOIN (VALUES
 ('central-square','Центральная площадь','Главное место встреч NEXORA.',100),
 ('lounge','Зал общения','Спокойная комната для разговоров.',50),
 ('garden','Сад звёзд','Виртуальный сад для отдыха.',40)
) AS seed(slug,name,description,capacity)
WHERE p.slug='nexora-prime'
ON CONFLICT (planet_id,slug) DO NOTHING;

INSERT INTO rooms (planet_id,slug,name,description,capacity)
SELECT p.id,seed.slug,seed.name,seed.description,seed.capacity
FROM planets p
JOIN (VALUES
 ('love-planet','heart-bay','Бухта сердец','Тихая набережная для знакомств.',60),
 ('love-planet','moon-garden','Лунный сад','Сад для прогулок и встреч.',40),
 ('love-planet','date-lounge','Лаунж свиданий','Комната для спокойного общения.',35),
 ('neon-city','neon-square','Неоновая площадь','Центр ночного города.',100),
 ('neon-city','night-club','Ночной клуб','Музыка и вечеринки.',80),
 ('neon-city','rooftop','Крыша небоскрёба','Вид на огни города.',45),
 ('paradise','ocean-beach','Океанский пляж','Пляжная зона отдыха.',70),
 ('paradise','waterfall','Водопад','Уединённое место у воды.',35),
 ('paradise','sunset-cafe','Кафе на закате','Кафе с видом на океан.',40),
 ('mystery-planet','ancient-portal','Древний портал','Точка начала исследований.',50),
 ('mystery-planet','crystal-cave','Кристальная пещера','Загадочная пещера.',35),
 ('mystery-planet','star-observatory','Звёздная обсерватория','Площадка для наблюдения за космосом.',40),
 ('vip-world','vip-lounge','VIP лаунж','Закрытая комната для VIP-участников.',50),
 ('vip-world','vip-garden','VIP сад','Приватный сад.',30)
) AS seed(planet_slug,slug,name,description,capacity) ON seed.planet_slug=p.slug
ON CONFLICT (planet_id,slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS room_presence (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS room_presence_room_idx ON room_presence(room_id, connected_at);
CREATE INDEX IF NOT EXISTS room_presence_user_idx ON room_presence(user_id);

CREATE TABLE IF NOT EXISTS room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS room_messages_room_created_idx ON room_messages(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
