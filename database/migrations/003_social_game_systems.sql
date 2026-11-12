-- NEXORA feature systems foundation. Idempotent schema extension.
CREATE TABLE IF NOT EXISTS avatar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  category VARCHAR(24) NOT NULL CHECK (category IN ('body','head','hair','outfit','shoes','accessory','pet_item','wedding')),
  rarity VARCHAR(20) NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  price_coins BIGINT NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  price_diamonds BIGINT NOT NULL DEFAULT 0 CHECK (price_diamonds >= 0),
  asset_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS character_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES avatar_items(id) ON DELETE RESTRICT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  equipped BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(character_id,item_id)
);
CREATE INDEX IF NOT EXISTS character_inventory_character_idx ON character_inventory(character_id);

CREATE TABLE IF NOT EXISTS clans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL UNIQUE,
  slug VARCHAR(48) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL DEFAULT '',
  emblem_url TEXT,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  treasury_coins BIGINT NOT NULL DEFAULT 0 CHECK (treasury_coins >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  visibility VARCHAR(12) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clan_members (
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','deputy','officer','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(clan_id,user_id),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS clan_members_clan_idx ON clan_members(clan_id,joined_at);
CREATE TABLE IF NOT EXISTS clan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clan_id,user_id)
);
CREATE TABLE IF NOT EXISTS clan_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL CHECK (amount <> 0),
  reason VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clan_transactions_clan_idx ON clan_transactions(clan_id,created_at DESC);
CREATE TABLE IF NOT EXISTS clan_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clan_messages_feed_idx ON clan_messages(clan_id,created_at DESC);


CREATE TABLE IF NOT EXISTS wallet_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receiver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency VARCHAR(12) NOT NULL DEFAULT 'coins' CHECK (currency IN ('coins','diamonds')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  idempotency_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_user_id <> receiver_user_id)
);
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES avatar_items(id) ON DELETE RESTRICT,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
  currency VARCHAR(12) NOT NULL CHECK (currency IN ('coins','diamonds')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  idempotency_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receiver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES avatar_items(id) ON DELETE RESTRICT,
  message VARCHAR(240) NOT NULL DEFAULT '',
  idempotency_key UUID NOT NULL UNIQUE,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_user_id <> receiver_user_id)
);

CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  name VARCHAR(32) NOT NULL,
  species VARCHAR(32) NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  mood SMALLINT NOT NULL DEFAULT 80 CHECK (mood BETWEEN 0 AND 100),
  hunger SMALLINT NOT NULL DEFAULT 80 CHECK (hunger BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pets_owner_idx ON pets(owner_user_id);

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(5000) NOT NULL,
  visibility VARCHAR(12) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS blog_posts_feed_idx ON blog_posts(created_at DESC);
CREATE TABLE IF NOT EXISTS blog_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS blog_likes (
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','married','declined','divorced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS relationships_one_active_per_user_idx
ON relationships(LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id))
WHERE status IN ('pending','married');
CREATE UNIQUE INDEX IF NOT EXISTS relationships_requester_active_idx ON relationships(requester_id) WHERE status IN ('pending','married');
CREATE UNIQUE INDEX IF NOT EXISTS relationships_addressee_active_idx ON relationships(addressee_id) WHERE status IN ('pending','married');

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  reward_coins BIGINT NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,achievement_id)
);
CREATE TABLE IF NOT EXISTS mini_game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_slug VARCHAR(48) NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mini_game_scores_leaderboard_idx ON mini_game_scores(game_slug,score DESC,created_at);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('warn','mute','suspend','unsuspend','lift')),
  reason VARCHAR(500) NOT NULL,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON admin_logs(created_at DESC);

-- One-time welcome grant for existing accounts with no wallet activity.
WITH granted AS (
  UPDATE wallet_balances w
  SET coins=coins+500, updated_at=NOW()
  WHERE w.coins=0
    AND NOT EXISTS (
      SELECT 1 FROM wallet_ledger l
      WHERE l.user_id=w.user_id AND l.reason='Стартовый бонус NEXORA'
    )
  RETURNING w.user_id
)
INSERT INTO wallet_ledger(user_id,currency,amount,reason)
SELECT user_id,'coins',500,'Стартовый бонус NEXORA' FROM granted;


INSERT INTO avatar_items (slug,name,description,category,rarity,price_coins)
VALUES
 ('nexora-basic-cap','Базовая кепка','Повседневная кепка NEXORA.','head','common',40),
 ('nexora-neon-jacket','Неоновая куртка','Куртка с яркими акцентами.','outfit','uncommon',120),
 ('nexora-star-glasses','Очки «Звезда»','Аксессуар для образа.','accessory','rare',180),
 ('nexora-cloud-pet-bed','Облачная лежанка','Мягкое место для питомца.','pet_item','common',60),
 ('nexora-wedding-bloom','Свадебный букет','Символ виртуальной церемонии.','wedding','uncommon',100)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO avatar_items (slug,name,description,category,rarity,price_coins)
VALUES
 ('nexora-aurora-hoodie','Худи «Аврора»','Мягкое худи с переливчатым узором.','outfit','uncommon',150),
 ('nexora-midnight-boots','Ботинки «Полночь»','Высокие ботинки для ночного города.','shoes','common',75),
 ('nexora-crystal-crown','Кристальная корона','Редкий сияющий головной убор.','head','epic',450),
 ('nexora-silver-wings','Серебряные крылья','Декоративный аксессуар за спиной.','accessory','legendary',900),
 ('nexora-pink-hair','Розовые волосы','Яркий цвет волос для образа.','hair','rare',220),
 ('nexora-blue-hair','Синие волосы','Холодный синий оттенок.','hair','rare',220),
 ('nexora-star-shirt','Футболка «Звезда»','Футболка с символом NEXORA.','outfit','common',55),
 ('nexora-galaxy-sneakers','Кроссовки «Галактика»','Кроссовки с космическим принтом.','shoes','uncommon',130),
 ('nexora-heart-pendant','Кулон «Сердце»','Небольшой романтичный аксессуар.','accessory','uncommon',95),
 ('nexora-gold-halo','Золотой нимб','Редкий светящийся аксессуар.','head','epic',500),
 ('nexora-fox-companion','Лисёнок-компаньон','Косметический предмет для коллекции.','pet_item','rare',250),
 ('nexora-dragon-egg','Яйцо дракона','Декоративный предмет коллекции.','pet_item','epic',400),
 ('nexora-wedding-ring','Обручальное кольцо','Символ виртуального союза.','wedding','rare',180),
 ('nexora-wedding-veil','Свадебная фата','Белая фата для церемонии.','wedding','uncommon',140),
 ('nexora-rainbow-scarf','Радужный шарф','Яркий аксессуар на каждый день.','accessory','common',65),
 ('nexora-sunset-coat','Пальто «Закат»','Пальто в тёплых оттенках.','outfit','rare',280),
 ('nexora-neon-sunglasses','Неоновые очки','Светящиеся очки для вечеринки.','accessory','uncommon',110),
 ('nexora-moon-boots','Лунные сапоги','Сапоги с серебристым декором.','shoes','rare',210),
 ('nexora-emerald-hair','Изумрудные волосы','Необычный зелёный оттенок.','hair','epic',350),
 ('nexora-starry-backpack','Рюкзак «Звёзды»','Рюкзак с космическим рисунком.','accessory','common',80)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO achievements (slug,name,description,reward_coins)
VALUES
 ('first-steps','Первые шаги','Создай первого персонажа.',25),
 ('social-butterfly','На связи','Отправь первое сообщение.',10),
 ('new-friend','Новый друг','Добавь первого друга.',30),
 ('first-purchase','Первая покупка','Купи первый предмет.',15)
ON CONFLICT (slug) DO NOTHING;


-- Award one-time achievements from trusted server-side database events.
CREATE OR REPLACE FUNCTION nexora_award_achievement(p_user_id UUID, p_slug TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  achievement RECORD;
BEGIN
  SELECT id,reward_coins INTO achievement FROM achievements WHERE slug=p_slug;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO user_achievements(user_id,achievement_id)
  VALUES(p_user_id,achievement.id)
  ON CONFLICT(user_id,achievement_id) DO NOTHING;
  IF FOUND AND achievement.reward_coins > 0 THEN
    INSERT INTO wallet_balances(user_id,coins)
    VALUES(p_user_id,achievement.reward_coins)
    ON CONFLICT(user_id) DO UPDATE
      SET coins=wallet_balances.coins+EXCLUDED.coins,updated_at=NOW();
    INSERT INTO wallet_ledger(user_id,currency,amount,reason)
    VALUES(p_user_id,'coins',achievement.reward_coins,'Награда: ' || p_slug);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION nexora_character_achievement_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nexora_award_achievement(NEW.user_id,'first-steps');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nexora_first_character_achievement ON characters;
CREATE TRIGGER nexora_first_character_achievement
AFTER INSERT ON characters FOR EACH ROW
EXECUTE FUNCTION nexora_character_achievement_trigger();

CREATE OR REPLACE FUNCTION nexora_message_achievement_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nexora_award_achievement(NEW.sender_id,'social-butterfly');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nexora_first_message_achievement ON messages;
CREATE TRIGGER nexora_first_message_achievement
AFTER INSERT ON messages FOR EACH ROW
EXECUTE FUNCTION nexora_message_achievement_trigger();

CREATE OR REPLACE FUNCTION nexora_friend_achievement_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    PERFORM nexora_award_achievement(NEW.requester_id,'new-friend');
    PERFORM nexora_award_achievement(NEW.addressee_id,'new-friend');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nexora_first_friend_achievement ON friendships;
CREATE TRIGGER nexora_first_friend_achievement
AFTER UPDATE OF status ON friendships FOR EACH ROW
EXECUTE FUNCTION nexora_friend_achievement_trigger();

CREATE OR REPLACE FUNCTION nexora_purchase_achievement_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nexora_award_achievement(NEW.user_id,'first-purchase');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nexora_first_purchase_achievement ON purchases;
CREATE TRIGGER nexora_first_purchase_achievement
AFTER INSERT ON purchases FOR EACH ROW
EXECUTE FUNCTION nexora_purchase_achievement_trigger();
